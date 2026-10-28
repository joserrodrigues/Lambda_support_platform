import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import { TICKET_STAFF_ROLES } from '../tickets/ticket.service';
import {
  aiConfigBodySchema,
  aiConfigListSchema,
  aiConfigSchema,
  aiIdParamsSchema,
  aiStatusSchema,
  improveBodySchema,
  improveResponseSchema,
} from './ai.schemas';
import type { AiService } from './ai.service';

export const aiRoutes: FastifyPluginAsyncZod<{ aiService: AiService }> = async (
  fastify,
  { aiService },
) => {
  fastify.addHook('onRequest', fastify.authenticate);
  fastify.addHook('onRequest', fastify.requireRole(...TICKET_STAFF_ROLES));

  fastify.get(
    '/status',
    { schema: { tags: ['ai'], response: { 200: aiStatusSchema } } },
    async (request) => aiService.status(currentUser(request)),
  );

  fastify.get(
    '/settings',
    {
      onRequest: fastify.requireRole('admin'),
      schema: { tags: ['ai'], response: { 200: aiConfigListSchema } },
    },
    async (request) => aiService.list(currentUser(request)),
  );

  fastify.post(
    '/settings',
    {
      onRequest: fastify.requireRole('admin'),
      schema: {
        tags: ['ai'],
        body: aiConfigBodySchema,
        response: { 201: aiConfigSchema },
      },
    },
    async (request, reply) => {
      const created = await aiService.create(request.body, currentUser(request));
      return reply.status(201).send(created);
    },
  );

  fastify.put(
    '/settings/:id',
    {
      onRequest: fastify.requireRole('admin'),
      schema: {
        tags: ['ai'],
        params: aiIdParamsSchema,
        body: aiConfigBodySchema,
        response: { 200: aiConfigSchema },
      },
    },
    async (request) => aiService.update(request.params.id, request.body, currentUser(request)),
  );

  fastify.delete(
    '/settings/:id',
    {
      onRequest: fastify.requireRole('admin'),
      schema: {
        tags: ['ai'],
        params: aiIdParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await aiService.remove(request.params.id, currentUser(request));
      return reply.status(204).send(null);
    },
  );

  fastify.post(
    '/improve',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['ai'],
        body: improveBodySchema,
        response: { 200: improveResponseSchema },
      },
    },
    async (request) => aiService.improve(request.body.text, request.body.aiId, currentUser(request)),
  );
};
