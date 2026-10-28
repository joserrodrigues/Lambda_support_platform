import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { currentUser } from '../../plugins/auth';
import { listSchoolsQuerySchema, schoolListResponseSchema } from './school.schemas';
import type { SchoolService } from './school.service';

export interface SchoolRoutesOptions {
  schoolService: SchoolService;
}

export const schoolRoutes: FastifyPluginAsyncZod<SchoolRoutesOptions> = async (
  fastify,
  { schoolService },
) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get(
    '/',
    {
      preHandler: fastify.requireRole('admin', 'agent'),
      schema: {
        tags: ['schools'],
        querystring: listSchoolsQuerySchema,
        response: { 200: schoolListResponseSchema },
      },
    },
    async (request) => schoolService.list(request.query, currentUser(request)),
  );
};
