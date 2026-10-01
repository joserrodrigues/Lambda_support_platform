import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import {
  createPostBodySchema,
  createTicketBodySchema,
  listPostsQuerySchema,
  listTicketsQuerySchema,
  postListResponseSchema,
  postParamsSchema,
  publicPostSchema,
  publicTicketSchema,
  ticketIdParamsSchema,
  ticketListResponseSchema,
  ticketOptionsResponseSchema,
  updatePostBodySchema,
  updateTicketBodySchema,
} from './ticket.schemas';
import { TICKET_STAFF_ROLES, type TicketService } from './ticket.service';

export const ticketRoutes: FastifyPluginAsyncZod<{ ticketService: TicketService }> = async (
  fastify,
  { ticketService },
) => {
  // Todas as rotas exigem autenticação e papel admin/agent. A checagem de papel roda no
  // onRequest (antes da validação), para que `requester` receba 403 sem conhecer o schema.
  // O service repete as checagens (defesa em profundidade).
  fastify.addHook('onRequest', fastify.authenticate);
  fastify.addHook('onRequest', fastify.requireRole(...TICKET_STAFF_ROLES));

  fastify.get(
    '/options',
    {
      schema: {
        tags: ['tickets'],
        querystring: z.strictObject({}),
        response: { 200: ticketOptionsResponseSchema },
      },
    },
    async (request) => ticketService.getOptions(currentUser(request)),
  );

  fastify.post(
    '/',
    {
      schema: {
        tags: ['tickets'],
        body: createTicketBodySchema,
        response: { 201: publicTicketSchema },
      },
    },
    async (request, reply) => {
      const ticket = await ticketService.create(request.body, currentUser(request));
      return reply.status(201).send(ticket);
    },
  );

  fastify.get(
    '/',
    {
      schema: {
        tags: ['tickets'],
        querystring: listTicketsQuerySchema,
        response: { 200: ticketListResponseSchema },
      },
    },
    async (request) => ticketService.list(request.query, currentUser(request)),
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['tickets'],
        params: ticketIdParamsSchema,
        response: { 200: publicTicketSchema },
      },
    },
    async (request) => ticketService.getById(request.params.id, currentUser(request)),
  );

  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['tickets'],
        params: ticketIdParamsSchema,
        body: updateTicketBodySchema,
        response: { 200: publicTicketSchema },
      },
    },
    async (request) => ticketService.update(request.params.id, request.body, currentUser(request)),
  );

  fastify.delete(
    '/:id',
    {
      onRequest: fastify.requireRole('admin'),
      schema: {
        tags: ['tickets'],
        params: ticketIdParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await ticketService.remove(request.params.id, currentUser(request));
      return reply.status(204).send(null);
    },
  );

  fastify.post(
    '/:id/posts',
    {
      schema: {
        tags: ['posts'],
        params: ticketIdParamsSchema,
        body: createPostBodySchema,
        response: { 201: publicPostSchema },
      },
    },
    async (request, reply) => {
      const post = await ticketService.createPost(
        request.params.id,
        request.body,
        currentUser(request),
      );
      return reply.status(201).send(post);
    },
  );

  fastify.get(
    '/:id/posts',
    {
      schema: {
        tags: ['posts'],
        params: ticketIdParamsSchema,
        querystring: listPostsQuerySchema,
        response: { 200: postListResponseSchema },
      },
    },
    async (request) =>
      ticketService.listPosts(request.params.id, request.query, currentUser(request)),
  );

  fastify.patch(
    '/:id/posts/:postId',
    {
      schema: {
        tags: ['posts'],
        params: postParamsSchema,
        body: updatePostBodySchema,
        response: { 200: publicPostSchema },
      },
    },
    async (request) =>
      ticketService.updatePost(
        request.params.id,
        request.params.postId,
        request.body,
        currentUser(request),
      ),
  );

  fastify.delete(
    '/:id/posts/:postId',
    {
      schema: {
        tags: ['posts'],
        params: postParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await ticketService.removePost(
        request.params.id,
        request.params.postId,
        currentUser(request),
      );
      return reply.status(204).send(null);
    },
  );
};
