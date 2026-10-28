import { randomUUID } from 'node:crypto';
import { currentDatabaseTarget } from '../../database/context';
import type { DatabaseTarget } from '../../database/routing';
import { Errors } from '../../shared/errors';
import { conteudoVazio } from '../../shared/ticket-html';
import type { AuthenticatedUser } from '../users/user.types';
import { TICKET_STAFF_ROLES } from '../tickets/ticket.service';
import { improveRequest, readImproveResponse } from './ai.client';
import type { AiConfigBody } from './ai.schemas';
import { readAwsSecret, type AiSecretReader } from './ai.secrets';
import type { AiSettings, AiSettingsRepository } from './ai.types';

const NOT_READY = 'A IA não está configurada.';
const EMPTY = 'Escreva o texto antes de melhorar.';
const FAILED = 'A IA não respondeu. Confira o modelo e o segredo da IA.';
const SECRET_FAILED = 'Não foi possível ler o segredo da IA.';
const TABLE_MISSING = 'A tabela de configuração de IA não existe. Rode a migration do suporte.';
const DUPLICATE = 'Já existe uma IA com esse nome.';
const MISSING = 'IA não encontrada.';
const LIMIT = 'O limite é de 20 IAs.';
const NEED_KEY = 'Informe a chave da API para deixar esta IA disponível.';
const NEED_SECRET = 'Informe o nome do segredo para deixar esta IA disponível.';
const CHOOSE = 'Informe qual IA deve melhorar o texto.';
const MAX_CONFIGS = 20;

export interface AiPublicConfig {
  id: string;
  name: string;
  enabled: boolean;
  provider: AiSettings['provider'];
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyHint: string;
  secretName: string;
}

export interface AiOption {
  id: string;
  name: string;
}

function keyHint(apiKey: string): string {
  if (apiKey.length < 4) return '';
  return `••••${apiKey.slice(-4)}`;
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase('pt-BR') === right.trim().toLocaleLowerCase('pt-BR');
}

function remoteTarget(target: DatabaseTarget | undefined): boolean {
  return target === 'hom' || target === 'prod';
}

/** Local usa a chave já salva. Hom e produção exigem o nome do segredo. */
export function aiConfigured(settings: AiSettings, target: DatabaseTarget | undefined): boolean {
  if (remoteTarget(target)) return settings.secretName.trim().length > 0;
  return settings.apiKey.trim().length > 0 || settings.secretName.trim().length > 0;
}

function toPublic(settings: AiSettings, target: DatabaseTarget | undefined): AiPublicConfig {
  const remote = remoteTarget(target);
  return {
    id: settings.id,
    name: settings.name,
    enabled: settings.enabled,
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    hasKey: aiConfigured(settings, target),
    keyHint: remote ? '' : keyHint(settings.apiKey),
    secretName: settings.secretName,
  };
}

function assertStaff(actor: AuthenticatedUser): void {
  if (!TICKET_STAFF_ROLES.includes(actor.role)) throw Errors.forbidden();
}

function assertAdmin(actor: AuthenticatedUser): void {
  if (actor.role !== 'admin') throw Errors.forbidden();
}

function isMissingAiTable(error: unknown): boolean {
  const record = error as { original?: { sqlMessage?: string }; parent?: { sqlMessage?: string }; message?: string };
  const sql = record.original?.sqlMessage ?? record.parent?.sqlMessage ?? record.message ?? '';
  return sql.includes('fsfadm_ai_settings');
}

export class AiService {
  constructor(
    private readonly settings: AiSettingsRepository,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly secrets: AiSecretReader = { read: readAwsSecret },
    private readonly target: () => DatabaseTarget | undefined = currentDatabaseTarget,
  ) {}

  async status(actor: AuthenticatedUser): Promise<{ options: AiOption[] }> {
    assertStaff(actor);
    try {
      const items = await this.settings.list();
      return {
        options: items
          .filter((item) => item.enabled && aiConfigured(item, this.target()))
          .map((item) => ({ id: item.id, name: item.name })),
      };
    } catch (error) {
      if (isMissingAiTable(error)) return { options: [] };
      throw error;
    }
  }

  async list(actor: AuthenticatedUser): Promise<{ items: AiPublicConfig[] }> {
    assertAdmin(actor);
    const target = this.target();
    return { items: (await this.readList()).map((item) => toPublic(item, target)) };
  }

  async create(input: AiConfigBody, actor: AuthenticatedUser): Promise<AiPublicConfig> {
    assertAdmin(actor);
    const items = await this.readList();
    if (items.length >= MAX_CONFIGS) throw Errors.unprocessable(LIMIT);
    this.assertUniqueName(items, input.name);
    const next = this.build(randomUUID().replaceAll('-', ''), input, '', input.secretName?.trim() ?? '');
    this.assertReady(next);
    await this.write(() => this.settings.insert(next));
    return toPublic(next, this.target());
  }

  async update(id: string, input: AiConfigBody, actor: AuthenticatedUser): Promise<AiPublicConfig> {
    assertAdmin(actor);
    const items = await this.readList();
    const current = items.find((item) => item.id === id);
    if (!current) throw Errors.notFound(MISSING);
    this.assertUniqueName(items, input.name, id);
    const secretName = input.secretName !== undefined ? input.secretName.trim() : current.secretName;
    const next = this.build(id, input, current.apiKey, secretName);
    this.assertReady(next);
    await this.write(() => this.settings.update(next));
    return toPublic(next, this.target());
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    assertAdmin(actor);
    const current = await this.readOne(id);
    if (!current) throw Errors.notFound(MISSING);
    await this.write(() => this.settings.remove(id));
  }

  async improve(text: string, aiId: string, actor: AuthenticatedUser): Promise<{ text: string }> {
    assertStaff(actor);
    return this.improveText(text, aiId);
  }

  async improveText(text: string, aiId?: string): Promise<{ text: string }> {
    if (conteudoVazio(text)) throw Errors.unprocessable(EMPTY);
    const current = await this.resolveSettings(aiId);
    const apiKey = await this.resolveKey(current);
    if (!apiKey) throw Errors.unprocessable(NOT_READY);

    const request = improveRequest({ ...current, apiKey }, text);
    let response: Response;
    try {
      response = await this.fetchImpl(request.url, {
        ...request.init,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw Errors.serviceUnavailable(FAILED);
    }
    if (!response.ok) throw Errors.serviceUnavailable(FAILED);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw Errors.serviceUnavailable(FAILED);
    }
    const improved = readImproveResponse(current.provider, body);
    if (!improved || conteudoVazio(improved)) throw Errors.serviceUnavailable(FAILED);
    return { text: improved };
  }

  private async resolveSettings(aiId?: string): Promise<AiSettings> {
    if (aiId) {
      let current: AiSettings | null;
      try {
        current = await this.settings.get(aiId);
      } catch (error) {
        if (isMissingAiTable(error)) throw Errors.serviceUnavailable(TABLE_MISSING);
        throw error;
      }
      if (!current?.enabled || !aiConfigured(current, this.target())) throw Errors.unprocessable(NOT_READY);
      return current;
    }
    const ready = (await this.readList()).filter((item) => item.enabled && aiConfigured(item, this.target()));
    const only = ready[0];
    if (ready.length === 1 && only) return only;
    if (ready.length === 0) throw Errors.unprocessable(NOT_READY);
    throw Errors.unprocessable(CHOOSE);
  }

  private assertReady(settings: AiSettings): void {
    if (settings.enabled && !aiConfigured(settings, this.target())) {
      throw Errors.unprocessable(remoteTarget(this.target()) ? NEED_SECRET : NEED_KEY);
    }
  }

  private async resolveKey(settings: AiSettings): Promise<string> {
    const remote = remoteTarget(this.target());
    if (!remote && settings.apiKey.trim()) return settings.apiKey.trim();
    const name = settings.secretName.trim();
    if (!name) return '';
    try {
      return (await this.secrets.read(name)).trim();
    } catch {
      throw Errors.serviceUnavailable(SECRET_FAILED);
    }
  }

  private build(id: string, input: AiConfigBody, apiKey: string, secretName: string): AiSettings {
    return {
      id,
      name: input.name.trim(),
      provider: input.provider,
      baseUrl: input.baseUrl.replace(/\/$/, ''),
      model: input.model,
      apiKey,
      secretName,
      enabled: input.enabled,
    };
  }

  private assertUniqueName(items: AiSettings[], name: string, exceptId?: string): void {
    if (items.some((item) => item.id !== exceptId && sameName(item.name, name))) {
      throw Errors.conflict(DUPLICATE);
    }
  }

  private async readList(): Promise<AiSettings[]> {
    try {
      return await this.settings.list();
    } catch (error) {
      if (isMissingAiTable(error)) throw Errors.serviceUnavailable(TABLE_MISSING);
      throw error;
    }
  }

  private async readOne(id: string): Promise<AiSettings | null> {
    try {
      return await this.settings.get(id);
    } catch (error) {
      if (isMissingAiTable(error)) throw Errors.serviceUnavailable(TABLE_MISSING);
      throw error;
    }
  }

  private async write(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (isMissingAiTable(error)) throw Errors.serviceUnavailable(TABLE_MISSING);
      throw error;
    }
  }
}
