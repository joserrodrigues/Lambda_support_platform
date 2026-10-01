import { randomUUID } from 'node:crypto';
import type { PostEntity, TicketEntity } from '../../src/modules/tickets/ticket.types';
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

export function makeTicket(overrides: Partial<TicketEntity> = {}): TicketEntity {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: randomUUID(),
    schoolId: 1,
    status: 'aguardando',
    devStatus: null,
    entryType: 'email',
    errorType: null,
    supportLevel2: false,
    priority: false,
    slaType: null,
    responseAt: null,
    technicalResponseAt: null,
    schoolResponsible: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makePost(overrides: Partial<PostEntity> = {}): PostEntity {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const userId = overrides.userId === undefined ? randomUUID() : overrides.userId;
  return {
    id: randomUUID(),
    ticketId: randomUUID(),
    userId,
    content: 'Conteúdo do post',
    author: userId ? { id: userId, name: 'Autor Teste' } : null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
