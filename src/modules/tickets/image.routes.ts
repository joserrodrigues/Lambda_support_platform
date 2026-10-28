import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentDatabaseTarget } from '../../database/context';
import { Errors } from '../../shared/errors';
import { saveTicketImagePrivate, signsTicketImages } from './image-s3';
import { saveTicketImage, ticketImageMime, ticketImagePath } from './image.storage';

function imageUrl(request: FastifyRequest, name: string): string {
  const forwarded = request.headers['x-forwarded-proto'];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const proto = header?.split(',')[0]?.trim() || request.protocol;
  return `${proto}://${request.headers.host}/ticket-images/${name}`;
}

export async function registerPublicTicketImages(app: FastifyInstance): Promise<void> {
  app.get(
    '/ticket-images/:name',
    {
      config: { rateLimit: false },
      schema: { hide: true },
    },
    async (request, reply) => {
      const name = (request.params as { name: string }).name;
      const full = ticketImagePath(name);
      const mime = ticketImageMime(name);
      if (!full || !mime) throw Errors.notFound();
      try {
        await access(full);
      } catch {
        throw Errors.notFound();
      }
      return reply
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .header('Cache-Control', 'private, max-age=300')
        .type(mime)
        .send(createReadStream(full));
    },
  );
}

export const ticketImageUploadRoutes: FastifyPluginAsyncZod = async (fastify) => {
  await fastify.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  fastify.post(
    '/images',
    {
      bodyLimit: 6 * 1024 * 1024,
      schema: {
        tags: ['posts'],
        response: { 201: z.object({ url: z.string() }) },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw Errors.unprocessable('Envie uma imagem.');
      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch {
        throw Errors.unprocessable('A imagem pode ter no máximo 5 MB.');
      }
      if (signsTicketImages(currentDatabaseTarget())) {
        const saved = await saveTicketImagePrivate(buffer);
        return reply.status(201).send(saved);
      }
      const saved = await saveTicketImage(buffer);
      return reply.status(201).send({ url: imageUrl(request, saved.name) });
    },
  );
};
