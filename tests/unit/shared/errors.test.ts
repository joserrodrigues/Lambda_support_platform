import { AppError, Errors } from '../../../src/shared/errors';

describe('Errors', () => {
  it.each([
    ['badRequest', 400, 'BAD_REQUEST'],
    ['unauthorized', 401, 'UNAUTHORIZED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['notFound', 404, 'NOT_FOUND'],
    ['conflict', 409, 'CONFLICT'],
  ] as const)('%s should build an AppError with status %i', (factory, statusCode, code) => {
    const error = Errors[factory]();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode, code });
    expect(error.message).toBeTruthy();
  });

  it('should accept a custom message', () => {
    expect(Errors.notFound('Ticket não encontrado').message).toBe('Ticket não encontrado');
  });
});
