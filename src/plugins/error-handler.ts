import type { FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../shared/errors';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: { field: string; message: string }[];
}

/**
 * Padroniza respostas de erro e evita vazamento de stack traces, SQL ou detalhes
 * internos para o cliente (OWASP A02:2025 / A10:2025).
 */
export default fp(
  (fastify) => {
    fastify.setErrorHandler<FastifyError | AppError>((error, request, reply) => {
      if (error instanceof AppError) {
        const body: ErrorBody = {
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
        };
        return reply.status(error.statusCode).send(body);
      }

      if (error.validation) {
        const body: ErrorBody = {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: error.validation.map((issue) => ({
            field:
              issue.instancePath.replace(/^\//, '').replaceAll('/', '.') ||
              (error.validationContext ?? ''),
            message: issue.message ?? 'inválido',
          })),
        };
        return reply.status(400).send(body);
      }

      const statusCode = error.statusCode ?? 500;
      if (statusCode >= 400 && statusCode < 500) {
        const body: ErrorBody = {
          statusCode,
          code: error.code || 'REQUEST_ERROR',
          message: error.message,
        };
        return reply.status(statusCode).send(body);
      }

      request.log.error({ err: error }, 'Erro não tratado');
      const body: ErrorBody = {
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro interno do servidor',
      };
      return reply.status(500).send(body);
    });

    fastify.setNotFoundHandler((_request, reply) => {
      const body: ErrorBody = {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Rota não encontrada',
      };
      return reply.status(404).send(body);
    });
  },
  { name: 'error-handler' },
);
