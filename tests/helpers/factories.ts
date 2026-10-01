import { randomUUID } from 'node:crypto';
import type { UserWithPassword } from '../../src/modules/users/user.types';

export function makeUser(overrides: Partial<UserWithPassword> = {}): UserWithPassword {
  const suffix = randomUUID().slice(0, 8);
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: randomUUID(),
    name: 'Usuário Teste',
    email: `user-${suffix}@escola.com`,
    login: `user.${suffix}`,
    role: 'requester',
    active: true,
    tokenVersion: 0,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    passwordHash: 'hashed:senha-super-forte',
    ...overrides,
  };
}
