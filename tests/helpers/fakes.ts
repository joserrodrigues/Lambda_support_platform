import type { AppConfig } from '../../src/config/env';
import { loadConfig } from '../../src/config/env';
import type { UserRepository } from '../../src/modules/users/user.repository';
import type { PasswordHasher } from '../../src/modules/users/user.service';
import type {
  CreateUserData,
  UpdateUserData,
  UserEntity,
  UserWithPassword,
} from '../../src/modules/users/user.types';
import { makeUser } from './factories';

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
