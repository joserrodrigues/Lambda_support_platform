import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/config/env';
import type { UserRole } from '../../src/modules/users/user.model';
import {
  fakeHasher,
  InMemoryPostRepository,
  InMemorySchoolRepository,
  InMemoryTicketRepository,
  InMemoryUserRepository,
  testConfig,
} from './fakes';

export interface TestContext {
  app: FastifyInstance;
  repo: InMemoryUserRepository;
  tickets: InMemoryTicketRepository;
  posts: InMemoryPostRepository;
  /** Escolas existentes (padrão: id 1). */
  schools: InMemorySchoolRepository;
}

export async function createTestApp(config: Partial<AppConfig> = {}): Promise<TestContext> {
  const repo = new InMemoryUserRepository();
  const posts = new InMemoryPostRepository((userId) => {
    const user = repo.users.get(userId);
    return user ? { id: user.id, name: user.name } : null;
  });
  const tickets = new InMemoryTicketRepository();
  tickets.onDelete = (id) => {
    posts.deleteByTicket(id);
  };
  const schools = new InMemorySchoolRepository();
  const app = await buildApp({
    config: { ...testConfig, ...config },
    userRepository: repo,
    ticketRepository: tickets,
    postRepository: posts,
    schoolRepository: schools,
    hasher: fakeHasher,
    logger: false,
  });
  await app.ready();
  return { app, repo, tickets, posts, schools };
}

export async function loginAs(
  ctx: TestContext,
  role: UserRole = 'requester',
): Promise<{ token: string; userId: string }> {
  const password = 'senha-super-forte';
  const user = ctx.repo.seed({ role, passwordHash: `hashed:${password}` });
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: user.email, password },
  });
  return { token: res.json<{ accessToken: string }>().accessToken, userId: user.id };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
