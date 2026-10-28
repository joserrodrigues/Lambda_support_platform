import { currentDatabaseTarget } from '../../database/context';
import type { AppConfig } from '../../config/env';
import { readAwsSecret } from '../ai/ai.secrets';
import type { SchoolRepository } from '../schools/school.repository';
import type { PostRepository } from '../tickets/post.repository';
import type { TicketRepository } from '../tickets/ticket.repository';
import { toPublicTicket } from '../tickets/ticket.service';
import type { PublicTicket } from '../tickets/ticket.schemas';
import { DEFAULT_TICKET_STATUS } from '../tickets/ticket.constants';
import { Errors } from '../../shared/errors';
import { verifyApiAuth } from '../../shared/api-auth';
import { preparePostContent } from '../../shared/ticket-html';
import { inboundImproveSchema, inboundSearchSchema, inboundTicketSchema } from './inbound.schemas';

export type InboundImprover = (text: string, aiId?: string) => Promise<{ text: string }>;

const NOT_CONFIGURED = 'A chave de entrada não está configurada.';
const INVALID = 'Chave inválida.';
const SCHOOL_NOT_FOUND = 'Escola não encontrada';

export async function readInboundSecret(config: AppConfig): Promise<string> {
  const target = currentDatabaseTarget();
  if (target === 'hom' || target === 'prod') {
    const name = config.INBOUND_API_SECRET_NAME?.trim() ?? '';
    if (!name) return '';
    return readAwsSecret(name);
  }
  return config.INBOUND_API_SECRET?.trim() ?? '';
}

export class InboundService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly posts: PostRepository,
    private readonly schools: SchoolRepository,
    private readonly readSecret: () => Promise<string>,
    private readonly improveText: InboundImprover | null = null,
  ) {}

  async receive(raw: Record<string, unknown>): Promise<PublicTicket> {
    const secret = (await this.readSecret()).trim();
    if (!secret) throw Errors.serviceUnavailable(NOT_CONFIGURED);
    const date = typeof raw.date === 'string' ? raw.date : '';
    if (!verifyApiAuth(secret, date, raw)) throw Errors.unauthorized(INVALID);

    const parsed = inboundTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join('.') || 'body';
      throw Errors.unprocessable(`${field}: ${issue?.message ?? 'dados inválidos'}`);
    }
    if (!(await this.schools.exists(parsed.data.schoolId))) throw Errors.unprocessable(SCHOOL_NOT_FOUND);

    const input = parsed.data;
    const ticket = await this.tickets.create({
      schoolId: input.schoolId,
      title: input.title ?? null,
      status: input.status ?? DEFAULT_TICKET_STATUS,
      devStatus: input.devStatus ?? null,
      entryType: input.entryType,
      errorType: input.errorType ?? null,
      supportLevel2: input.supportLevel2 ?? false,
      priority: input.priority ?? false,
      slaType: input.slaType ?? null,
      responseAt: input.responseAt ? new Date(input.responseAt) : null,
      technicalResponseAt: input.technicalResponseAt ? new Date(input.technicalResponseAt) : null,
      schoolResponsible: input.schoolResponsible ?? null,
      schoolUserId: input.schoolUserId ?? null,
      schoolUserName: input.schoolUserName ?? null,
    });
    try {
      await this.posts.create({
        ticketId: ticket.id,
        userId: null,
        content: preparePostContent(input.content),
        isInternal: false,
        schoolUserId: input.schoolUserId ?? null,
        schoolUserName: input.schoolUserName ?? null,
      });
    } catch (error) {
      await this.tickets.delete(ticket.id);
      throw error;
    }
    return toPublicTicket(ticket);
  }

  async search(raw: Record<string, unknown>) {
    const secret = (await this.readSecret()).trim();
    if (!secret) throw Errors.serviceUnavailable(NOT_CONFIGURED);
    const date = typeof raw.date === 'string' ? raw.date : '';
    if (!verifyApiAuth(secret, date, raw)) throw Errors.unauthorized(INVALID);

    const parsed = inboundSearchSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join('.') || 'body';
      throw Errors.unprocessable(`${field}: ${issue?.message ?? 'dados inválidos'}`);
    }
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 100;
    const { rows, count } = await this.tickets.list({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      filters: {
        schoolId: parsed.data.schoolId,
        status: parsed.data.status,
        devStatus: parsed.data.devStatus,
        entryType: parsed.data.entryType,
        slaType: parsed.data.slaType,
        priority: parsed.data.priority,
        supportLevel2: parsed.data.supportLevel2,
        since: parsed.data.since ? new Date(parsed.data.since) : undefined,
      },
    });
    const contents = await this.posts.firstPublicContents(rows.map((ticket) => ticket.id));
    return {
      data: rows.map((ticket) => ({
        ...toPublicTicket(ticket),
        unseen: ticket.viewedAt == null,
        firstContent: contents.get(ticket.id) ?? null,
      })),
      meta: { page, pageSize, total: count },
    };
  }

  async improve(raw: Record<string, unknown>): Promise<{ text: string }> {
    const secret = (await this.readSecret()).trim();
    if (!secret) throw Errors.serviceUnavailable(NOT_CONFIGURED);
    const date = typeof raw.date === 'string' ? raw.date : '';
    if (!verifyApiAuth(secret, date, raw)) throw Errors.unauthorized(INVALID);

    const parsed = inboundImproveSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join('.') || 'body';
      throw Errors.unprocessable(`${field}: ${issue?.message ?? 'dados inválidos'}`);
    }
    if (!this.improveText) throw Errors.serviceUnavailable('A IA não está configurada.');
    return this.improveText(parsed.data.text, parsed.data.aiId);
  }
}
