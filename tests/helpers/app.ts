import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/config/env';
import type { UserRole } from '../../src/modules/users/user.model';
import { fakeHasher, InMemoryUserRepository, testConfig } from './fakes';

export interface TestContext {
  app: FastifyInstance;
  repo: InMemoryUserRepository;
}

export async function createTestApp(config: Partial<AppConfig> = {}): Promise<TestContext> {
  const repo = new InMemoryUserRepository();
  const app = await buildApp({
    config: { ...testConfig, ...config },
    userRepository: repo,
    hasher: fakeHasher,
    logger: false,
  });
  await app.ready();
  return { app, repo };
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
