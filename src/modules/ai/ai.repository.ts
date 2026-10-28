import { QueryTypes } from 'sequelize';
import { activeModels } from '../../database/context';
import { Errors } from '../../shared/errors';
import { AI_PROVIDERS, type AiProvider, type AiSettings, type AiSettingsRepository } from './ai.types';

interface AiRow {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  secretName: string | null;
  enabled: number | boolean;
}

function isProvider(value: string): value is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

function mapRow(row: AiRow): AiSettings | null {
  if (!isProvider(row.provider)) return null;
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKey: row.apiKey,
    secretName: row.secretName?.trim() ?? '',
    enabled: row.enabled === true || row.enabled === 1,
  };
}

const COLUMNS = `id, name, provider, base_url AS baseUrl, model, api_key AS apiKey, secret_name AS secretName, enabled`;

export class SequelizeAiSettingsRepository implements AiSettingsRepository {
  private sequelize() {
    const db = activeModels().Ticket.sequelize;
    if (!db) throw Errors.serviceUnavailable('Banco indisponível');
    return db;
  }

  async list(): Promise<AiSettings[]> {
    const rows = await this.sequelize().query<AiRow>(
      `SELECT ${COLUMNS} FROM fsfadm_ai_settings ORDER BY name ASC, id ASC`,
      { type: QueryTypes.SELECT },
    );
    return rows.flatMap((row) => {
      const mapped = mapRow(row);
      return mapped ? [mapped] : [];
    });
  }

  async get(id: string): Promise<AiSettings | null> {
    const rows = await this.sequelize().query<AiRow>(
      `SELECT ${COLUMNS} FROM fsfadm_ai_settings WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    const row = rows[0];
    return row ? mapRow(row) : null;
  }

  async insert(settings: AiSettings): Promise<void> {
    await this.sequelize().query(
      `INSERT INTO fsfadm_ai_settings (id, name, provider, base_url, model, api_key, secret_name, enabled, updated_at)
       VALUES (:id, :name, :provider, :baseUrl, :model, :apiKey, :secretName, :enabled, UTC_TIMESTAMP())`,
      { replacements: this.values(settings) },
    );
  }

  async update(settings: AiSettings): Promise<void> {
    await this.sequelize().query(
      `UPDATE fsfadm_ai_settings
       SET name = :name, provider = :provider, base_url = :baseUrl, model = :model,
           api_key = :apiKey, secret_name = :secretName, enabled = :enabled, updated_at = UTC_TIMESTAMP()
       WHERE id = :id`,
      { replacements: this.values(settings) },
    );
  }

  async remove(id: string): Promise<void> {
    await this.sequelize().query(`DELETE FROM fsfadm_ai_settings WHERE id = :id`, {
      replacements: { id },
    });
  }

  private values(settings: AiSettings) {
    return {
      id: settings.id,
      name: settings.name,
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKey: settings.apiKey,
      secretName: settings.secretName,
      enabled: settings.enabled ? 1 : 0,
    };
  }
}
