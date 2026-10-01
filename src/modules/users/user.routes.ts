import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import {
  createUserBodySchema,
  listUsersQuerySchema,
  publicUserSchema,
  updateUserBodySchema,
  userIdParamsSchema,
  userListResponseSchema,
} from './user.schemas';
import type { UserService } from './user.service';

export const userRoutes: FastifyPluginAsyncZod<{ userService: UserService }> = async (
  fastify,
  { userService },
) => {
  // Todas as rotas de usuário exigem autenticação.
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post(
    '/',
    {
      preHandler: fastify.requireRole('admin'),
      schema: {
        tags: ['users'],
        body: createUserBodySchema,
        response: { 201: publicUserSchema },
      },
    },
    async (request, reply) => {
      const user = await userService.create(request.body);
      return reply.status(201).send(user);
    },
  );

  fastify.get(
    '/',
    {
      preHandler: fastify.requireRole('admin'),
      schema: {
        tags: ['users'],
        querystring: listUsersQuerySchema,
        response: { 200: userListResponseSchema },
      },
    },
    async (request) => userService.list(request.query),
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['users'],
        params: userIdParamsSchema,
        response: { 200: publicUserSchema },
      },
    },
    async (request) => userService.getById(request.params.id, currentUser(request)),
  );

  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['users'],
        params: userIdParamsSchema,
        body: updateUserBodySchema,
        response: { 200: publicUserSchema },
      },
    },
    async (request) => userService.update(request.params.id, request.body, currentUser(request)),
  );

  fastify.delete(
    '/:id',
    {
      preHandler: fastify.requireRole('admin'),
      schema: {
        tags: ['users'],
        params: userIdParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await userService.remove(request.params.id, currentUser(request));
      return reply.status(204).send(null);
    },
  );
};
