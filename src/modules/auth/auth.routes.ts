import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from '../../config/env';
import { currentUser } from '../../plugins/auth';
import { publicUserSchema } from '../users/user.schemas';
import type { UserService } from '../users/user.service';
import { loginBodySchema, loginResponseSchema } from './auth.schemas';

export const authRoutes: FastifyPluginAsyncZod<{
  config: AppConfig;
  userService: UserService;
}> = async (fastify, { config, userService }) => {
  fastify.post(
    '/login',
    {
      // Limite mais restrito contra força bruta / credential stuffing.
      config: { rateLimit: { max: config.LOGIN_RATE_LIMIT_MAX, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        security: [],
        body: loginBodySchema,
        response: { 200: loginResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await fastify.authService.login(request.body);
      return reply.header('cache-control', 'no-store').send(result);
    },
  );

  fastify.get(
    '/me',
    {
      onRequest: fastify.authenticate,
      schema: { tags: ['auth'], response: { 200: publicUserSchema } },
    },
    async (request) => {
      const user = currentUser(request);
      return userService.getById(user.id, user);
    },
  );

  fastify.post(
    '/logout',
    {
      onRequest: fastify.authenticate,
      schema: { tags: ['auth'], response: { 204: z.null() } },
    },
    async (request, reply) => {
      await fastify.authService.logout(currentUser(request).id);
      // O token renovado nesta requisição também passa a ser inválido; não o devolvemos.
      reply.removeHeader('x-access-token');
      reply.removeHeader('x-access-token-expires-in');
      return reply.status(204).send(null);
    },
  );
};
