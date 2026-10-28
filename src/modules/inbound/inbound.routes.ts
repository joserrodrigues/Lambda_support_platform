import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { publicTicketSchema } from '../tickets/ticket.schemas';
import type { InboundService } from './inbound.service';

const searchResponseSchema = z.object({
  data: z.array(publicTicketSchema.extend({ unseen: z.boolean(), firstContent: z.string().nullable() })),
  meta: z.object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int() }),
});

export const inboundRoutes: FastifyPluginAsyncZod<{ inboundService: InboundService }> = async (
  fastify,
  { inboundService },
) => {
  fastify.post(
    '/text/improve',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['inbound'],
        security: [],
        body: z.record(z.string(), z.json()).meta({ id: 'InboundImproveEnvelope' }),
        response: { 200: z.object({ text: z.string() }) },
      },
    },
    async (request) => inboundService.improve(request.body),
  );

  fastify.post(
    '/tickets/search',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['inbound'],
        security: [],
        body: z.record(z.string(), z.json()).meta({ id: 'InboundTicketSearchEnvelope' }),
        response: { 200: searchResponseSchema },
      },
    },
    async (request) => inboundService.search(request.body),
  );

  fastify.post(
    '/tickets',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['inbound'],
        security: [],
        body: z.record(z.string(), z.json()).meta({ id: 'InboundTicketEnvelope' }),
        response: { 201: publicTicketSchema },
      },
    },
    async (request, reply) => {
      const created = await inboundService.receive(request.body);
      return reply.status(201).send(created);
    },
  );
};
