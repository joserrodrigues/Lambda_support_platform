import { Errors } from '../../shared/errors';
import type { SchoolRepository } from '../schools/school.repository';
import type { UserRole } from '../users/user.model';
import type { AuthenticatedUser } from '../users/user.types';
import type { PostRepository } from './post.repository';
import {
  TICKET_DEV_STATUS_LABELS,
  TICKET_DEV_STATUSES,
  TICKET_ENTRY_TYPE_LABELS,
  TICKET_ENTRY_TYPES,
  TICKET_SLA_TYPE_LABELS,
  TICKET_SLA_TYPES,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  toOptions,
} from './ticket.constants';
import type { TicketRepository } from './ticket.repository';
import type {
  CreatePostBody,
  CreateTicketBody,
  ListPostsQuery,
  ListTicketsQuery,
  PublicPost,
  PublicTicket,
  TicketOptionsResponse,
  UpdatePostBody,
  UpdateTicketBody,
} from './ticket.schemas';
import type { PostEntity, TicketEntity, TicketFilters, UpdateTicketData } from './ticket.types';

/**
 * Papéis com acesso a tickets e posts. Allowlist explícita (falha fechada): qualquer papel
 * não listado — inclusive papéis futuros — é negado. Usuários ainda não têm vínculo com escola,
 * por isso `requester` não acessa tickets.
 */
export const TICKET_STAFF_ROLES: readonly UserRole[] = ['admin', 'agent'];

export function toPublicTicket(ticket: TicketEntity): PublicTicket {
  return {
    id: ticket.id,
    schoolId: ticket.schoolId,
    status: ticket.status,
    devStatus: ticket.devStatus,
    entryType: ticket.entryType,
    errorType: ticket.errorType,
    supportLevel2: ticket.supportLevel2,
    priority: ticket.priority,
    slaType: ticket.slaType,
    responseAt: ticket.responseAt,
    technicalResponseAt: ticket.technicalResponseAt,
    schoolResponsible: ticket.schoolResponsible,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

export function toPublicPost(post: PostEntity): PublicPost {
  return {
    id: post.id,
    ticketId: post.ticketId,
    content: post.content,
    author: post.author ? { id: post.author.id, name: post.author.name } : null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

const TICKET_NOT_FOUND = 'Ticket não encontrado';
const POST_NOT_FOUND = 'Post não encontrado';
const SCHOOL_NOT_FOUND = 'Escola não encontrada';

export class TicketService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly posts: PostRepository,
    private readonly schools: SchoolRepository,
  ) {}

  getOptions(actor: AuthenticatedUser): TicketOptionsResponse {
    this.assertStaff(actor);
    return {
      status: toOptions(TICKET_STATUSES, TICKET_STATUS_LABELS),
      devStatus: toOptions(TICKET_DEV_STATUSES, TICKET_DEV_STATUS_LABELS),
      entryType: toOptions(TICKET_ENTRY_TYPES, TICKET_ENTRY_TYPE_LABELS),
      slaType: toOptions(TICKET_SLA_TYPES, TICKET_SLA_TYPE_LABELS),
    };
  }

  async create(input: CreateTicketBody, actor: AuthenticatedUser): Promise<PublicTicket> {
    this.assertStaff(actor);
    await this.assertSchoolExists(input.schoolId);
    const ticket = await this.tickets.create({
      schoolId: input.schoolId,
      status: input.status,
      devStatus: input.devStatus ?? null,
      entryType: input.entryType,
      errorType: input.errorType ?? null,
      supportLevel2: input.supportLevel2,
      priority: input.priority,
      slaType: input.slaType ?? null,
      responseAt: input.responseAt ?? null,
      technicalResponseAt: input.technicalResponseAt ?? null,
      schoolResponsible: input.schoolResponsible ?? null,
    });
    return toPublicTicket(ticket);
  }

  async list(query: ListTicketsQuery, actor: AuthenticatedUser) {
    this.assertStaff(actor);
    const { page, pageSize, ...filterInput } = query;
    const filters: TicketFilters = {};
    if (filterInput.schoolId !== undefined) filters.schoolId = filterInput.schoolId;
    if (filterInput.status !== undefined) filters.status = filterInput.status;
    if (filterInput.devStatus !== undefined) filters.devStatus = filterInput.devStatus;
    if (filterInput.entryType !== undefined) filters.entryType = filterInput.entryType;
    if (filterInput.slaType !== undefined) filters.slaType = filterInput.slaType;
    if (filterInput.priority !== undefined) filters.priority = filterInput.priority;
    if (filterInput.supportLevel2 !== undefined) filters.supportLevel2 = filterInput.supportLevel2;

    const { rows, count } = await this.tickets.list({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      filters,
    });
    return { data: rows.map(toPublicTicket), meta: { page, pageSize, total: count } };
  }

  async getById(id: string, actor: AuthenticatedUser): Promise<PublicTicket> {
    this.assertStaff(actor);
    return toPublicTicket(await this.findTicketOrFail(id));
  }

  async update(id: string, input: UpdateTicketBody, actor: AuthenticatedUser) {
    this.assertStaff(actor);
    const current = await this.findTicketOrFail(id);

    if (input.schoolId !== undefined && input.schoolId !== current.schoolId) {
      await this.assertSchoolExists(input.schoolId);
    }

    // Copia apenas os campos informados (undefined = não alterar; null = limpar).
    const changes: UpdateTicketData = {};
    if (input.schoolId !== undefined) changes.schoolId = input.schoolId;
    if (input.status !== undefined) changes.status = input.status;
    if (input.devStatus !== undefined) changes.devStatus = input.devStatus;
    if (input.entryType !== undefined) changes.entryType = input.entryType;
    if (input.errorType !== undefined) changes.errorType = input.errorType;
    if (input.supportLevel2 !== undefined) changes.supportLevel2 = input.supportLevel2;
    if (input.priority !== undefined) changes.priority = input.priority;
    if (input.slaType !== undefined) changes.slaType = input.slaType;
    if (input.responseAt !== undefined) changes.responseAt = input.responseAt;
    if (input.technicalResponseAt !== undefined) {
      changes.technicalResponseAt = input.technicalResponseAt;
    }
    if (input.schoolResponsible !== undefined) changes.schoolResponsible = input.schoolResponsible;

    const updated = await this.tickets.update(id, changes);
    if (!updated) throw Errors.notFound(TICKET_NOT_FOUND);
    return toPublicTicket(updated);
  }

  /** Exclusão definitiva (somente admin); os posts são removidos em cascata pela FK. */
  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role !== 'admin') throw Errors.forbidden();
    const deleted = await this.tickets.delete(id);
    if (!deleted) throw Errors.notFound(TICKET_NOT_FOUND);
  }

  async createPost(
    ticketId: string,
    input: CreatePostBody,
    actor: AuthenticatedUser,
  ): Promise<PublicPost> {
    this.assertStaff(actor);
    await this.findTicketOrFail(ticketId);
    // O autor é sempre o usuário autenticado (nunca vem do corpo da requisição).
    const post = await this.posts.create({ ticketId, userId: actor.id, content: input.content });
    return toPublicPost(post);
  }

  async listPosts(ticketId: string, query: ListPostsQuery, actor: AuthenticatedUser) {
    this.assertStaff(actor);
    await this.findTicketOrFail(ticketId);
    const { page, pageSize } = query;
    const { rows, count } = await this.posts.listByTicket(ticketId, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { data: rows.map(toPublicPost), meta: { page, pageSize, total: count } };
  }

  async updatePost(
    ticketId: string,
    postId: string,
    input: UpdatePostBody,
    actor: AuthenticatedUser,
  ): Promise<PublicPost> {
    await this.findOwnedPostOrFail(ticketId, postId, actor);
    const updated = await this.posts.update(ticketId, postId, { content: input.content });
    if (!updated) throw Errors.notFound(POST_NOT_FOUND);
    return toPublicPost(updated);
  }

  async removePost(ticketId: string, postId: string, actor: AuthenticatedUser): Promise<void> {
    await this.findOwnedPostOrFail(ticketId, postId, actor);
    const deleted = await this.posts.delete(ticketId, postId);
    if (!deleted) throw Errors.notFound(POST_NOT_FOUND);
  }

  /** Controle de função (OWASP API5 - BFLA), repetido no service como defesa em profundidade. */
  private assertStaff(actor: AuthenticatedUser): void {
    if (!TICKET_STAFF_ROLES.includes(actor.role)) throw Errors.forbidden();
  }

  private async assertSchoolExists(schoolId: number): Promise<void> {
    if (!(await this.schools.exists(schoolId))) throw Errors.unprocessable(SCHOOL_NOT_FOUND);
  }

  private async findTicketOrFail(id: string): Promise<TicketEntity> {
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw Errors.notFound(TICKET_NOT_FOUND);
    return ticket;
  }

  /**
   * O post precisa pertencer ao ticket da URL (senão 404) e somente o autor ou um admin
   * pode alterá-lo/excluí-lo (OWASP API1 - BOLA).
   */
  private async findOwnedPostOrFail(
    ticketId: string,
    postId: string,
    actor: AuthenticatedUser,
  ): Promise<PostEntity> {
    this.assertStaff(actor);
    const post = await this.posts.findInTicket(ticketId, postId);
    if (!post) throw Errors.notFound(POST_NOT_FOUND);
    if (actor.role !== 'admin' && post.userId !== actor.id) throw Errors.forbidden();
    return post;
  }
}
