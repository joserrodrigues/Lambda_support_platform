import type { FastifyRequest } from 'fastify';
import { currentUser } from '../../../src/plugins/auth';
import { AppError } from '../../../src/shared/errors';

describe('currentUser', () => {
  it('should throw 401 when the request is not authenticated', () => {
    expect(() => currentUser({ authUser: null } as FastifyRequest)).toThrow(AppError);
    expect(() => currentUser({ authUser: null } as FastifyRequest)).toThrow('Não autenticado');
  });

  it('should return the authenticated user', () => {
    const authUser = { id: 'id', role: 'admin' as const };
    expect(currentUser({ authUser } as FastifyRequest)).toBe(authUser);
  });
});
