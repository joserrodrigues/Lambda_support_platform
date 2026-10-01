import type { AppConfig } from '../../src/config/env';
import { loadConfig } from '../../src/config/env';
import type { SchoolRepository } from '../../src/modules/schools/school.repository';
import type { PostRepository } from '../../src/modules/tickets/post.repository';
import type { TicketRepository } from '../../src/modules/tickets/ticket.repository';
import type {
  CreatePostData,
  CreateTicketData,
  Pagination,
  PostAuthor,
  PostEntity,
  TicketEntity,
  TicketFilters,
  UpdatePostData,
  UpdateTicketData,
} from '../../src/modules/tickets/ticket.types';
import type { UserRepository } from '../../src/modules/users/user.repository';
import type { PasswordHasher } from '../../src/modules/users/user.service';
import type {
  CreateUserData,
  UpdateUserData,
  UserEntity,
  UserWithPassword,
} from '../../src/modules/users/user.types';
import { makePost, makeTicket, makeUser } from './factories';

export const testConfig: AppConfig = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  JWT_SECRET: 'test-secret-with-at-least-32-characters!!',
  RATE_LIMIT_MAX: '1000',
  LOGIN_RATE_LIMIT_MAX: '3',
});

/** Hasher determinístico e rápido para testes (não use fora de testes). */
export const fakeHasher: PasswordHasher = {
  hash: (password) => Promise.resolve(`hashed:${password}`),
  verify: (password, hash) => Promise.resolve(hash === `hashed:${password}`),
};

function strip({ passwordHash: _passwordHash, ...entity }: UserWithPassword): UserEntity {
  return entity;
}

/** Repositório em memória que respeita o contrato de `UserRepository`. */
export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, UserWithPassword>();
  readonly deleted = new Set<string>();

  seed(overrides: Partial<UserWithPassword> = {}): UserWithPassword {
    const user = makeUser(overrides);
    this.users.set(user.id, user);
    return user;
  }

  private active(id: string) {
    return this.deleted.has(id) ? undefined : this.users.get(id);
  }

  findById(id: string) {
    const user = this.active(id);
    return Promise.resolve(user ? strip(user) : null);
  }

  findByIdWithPassword(id: string) {
    const user = this.active(id);
    return Promise.resolve(user ? { ...user } : null);
  }

  findByEmailWithPassword(email: string) {
    const user = [...this.users.values()].find((u) => u.email === email && !this.deleted.has(u.id));
    return Promise.resolve(user ? { ...user } : null);
  }

  emailExists(email: string, excludeId?: string) {
    return Promise.resolve(
      [...this.users.values()].some((u) => u.email === email && u.id !== excludeId),
    );
  }

  loginExists(login: string, excludeId?: string) {
    return Promise.resolve(
      [...this.users.values()].some((u) => u.login === login && u.id !== excludeId),
    );
  }

  list({ limit, offset }: { limit: number; offset: number }) {
    const all = [...this.users.values()].filter((u) => !this.deleted.has(u.id));
    return Promise.resolve({
      rows: all.slice(offset, offset + limit).map(strip),
      count: all.length,
    });
  }

  create(data: CreateUserData) {
    return Promise.resolve(strip(this.seed(data)));
  }

  update(id: string, data: UpdateUserData) {
    const user = this.active(id);
    if (!user) return Promise.resolve(null);
    const { incrementTokenVersion, ...fields } = data;
    Object.assign(user, fields, { updatedAt: new Date() });
    if (incrementTokenVersion) user.tokenVersion += 1;
    return Promise.resolve(strip(user));
  }

  softDelete(id: string) {
    if (!this.active(id)) return Promise.resolve(false);
    this.deleted.add(id);
    return Promise.resolve(true);
  }
}

/** Repositório de escolas em memória: `exists` responde a partir de um conjunto de ids. */
export class InMemorySchoolRepository implements SchoolRepository {
  readonly ids: Set<number>;

  constructor(ids: Iterable<number> = [1]) {
    this.ids = new Set(ids);
  }

  exists(id: number) {
    return Promise.resolve(this.ids.has(id));
  }
}

const FILTER_KEYS = [
  'schoolId',
  'status',
  'devStatus',
  'entryType',
  'slaType',
  'priority',
  'supportLevel2',
] as const satisfies readonly (keyof TicketFilters)[];

/** Repositório de tickets em memória que respeita o contrato de `TicketRepository`. */
export class InMemoryTicketRepository implements TicketRepository {
  readonly tickets = new Map<string, TicketEntity>();
  /** Chamado após excluir um ticket (simula o `ON DELETE CASCADE` dos posts). */
  onDelete?: (id: string) => void;

  seed(overrides: Partial<TicketEntity> = {}): TicketEntity {
    const ticket = makeTicket(overrides);
    this.tickets.set(ticket.id, ticket);
    return { ...ticket };
  }

  findById(id: string) {
    const ticket = this.tickets.get(id);
    return Promise.resolve(ticket ? { ...ticket } : null);
  }

  list({ limit, offset, filters }: Pagination & { filters: TicketFilters }) {
    const all = [...this.tickets.values()]
      .filter((ticket) =>
        FILTER_KEYS.every((key) => filters[key] === undefined || ticket[key] === filters[key]),
      )
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    return Promise.resolve({
      rows: all.slice(offset, offset + limit).map((ticket) => ({ ...ticket })),
      count: all.length,
    });
  }

  create(data: CreateTicketData) {
    return Promise.resolve(this.seed(data));
  }

  update(id: string, data: UpdateTicketData) {
    const ticket = this.tickets.get(id);
    if (!ticket) return Promise.resolve(null);
    Object.assign(ticket, data, { updatedAt: new Date() });
    return Promise.resolve({ ...ticket });
  }

  delete(id: string) {
    const deleted = this.tickets.delete(id);
    if (deleted) this.onDelete?.(id);
    return Promise.resolve(deleted);
  }
}

/** Repositório de posts em memória que respeita o contrato de `PostRepository`. */
export class InMemoryPostRepository implements PostRepository {
  readonly posts = new Map<string, PostEntity>();

  /** `resolveAuthor` simula o `include` do autor (apenas id e nome). */
  constructor(
    private readonly resolveAuthor: (userId: string) => PostAuthor | null = (userId) => ({
      id: userId,
      name: 'Autor Teste',
    }),
  ) {}

  seed(overrides: Partial<PostEntity> = {}): PostEntity {
    const post = makePost(overrides);
    this.posts.set(post.id, post);
    return { ...post };
  }

  findInTicket(ticketId: string, postId: string) {
    const post = this.posts.get(postId);
    return Promise.resolve(post?.ticketId === ticketId ? { ...post } : null);
  }

  listByTicket(ticketId: string, { limit, offset }: Pagination) {
    const all = [...this.posts.values()]
      .filter((post) => post.ticketId === ticketId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return Promise.resolve({
      rows: all.slice(offset, offset + limit).map((post) => ({ ...post })),
      count: all.length,
    });
  }

  create(data: CreatePostData) {
    return Promise.resolve(
      this.seed({ ...data, author: this.resolveAuthor(data.userId), createdAt: new Date() }),
    );
  }

  update(ticketId: string, postId: string, data: UpdatePostData) {
    const post = this.posts.get(postId);
    if (post?.ticketId !== ticketId) return Promise.resolve(null);
    Object.assign(post, { content: data.content, updatedAt: new Date() });
    return Promise.resolve({ ...post });
  }

  delete(ticketId: string, postId: string) {
    const post = this.posts.get(postId);
    if (post?.ticketId !== ticketId) return Promise.resolve(false);
    return Promise.resolve(this.posts.delete(postId));
  }

  deleteByTicket(ticketId: string): void {
    for (const post of this.posts.values()) {
      if (post.ticketId === ticketId) this.posts.delete(post.id);
    }
  }
}
