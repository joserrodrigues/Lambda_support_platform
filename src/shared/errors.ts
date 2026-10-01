export class AppError extends Error {
  override name = 'AppError';

  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const Errors = {
  badRequest: (message = 'Requisição inválida') => new AppError(400, 'BAD_REQUEST', message),
  unauthorized: (message = 'Não autenticado') => new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'Acesso negado') => new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Recurso não encontrado') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message = 'Conflito') => new AppError(409, 'CONFLICT', message),
  unprocessable: (message = 'Não foi possível processar a requisição') =>
    new AppError(422, 'UNPROCESSABLE_ENTITY', message),
};
