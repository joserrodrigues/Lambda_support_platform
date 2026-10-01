import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from './config/env';
import { authRoutes } from './modules/auth/auth.routes';
import {
  SequelizeSchoolRepository,
  type SchoolRepository,
} from './modules/schools/school.repository';
import { SequelizePostRepository, type PostRepository } from './modules/tickets/post.repository';
import {
  SequelizeTicketRepository,
  type TicketRepository,
} from './modules/tickets/ticket.repository';
import { ticketRoutes } from './modules/tickets/ticket.routes';
import { TicketService } from './modules/tickets/ticket.service';
import { SequelizeUserRepository, type UserRepository } from './modules/users/user.repository';
import { userRoutes } from './modules/users/user.routes';
import { UserService, type PasswordHasher } from './modules/users/user.service';
import authPlugin from './plugins/auth';
import errorHandler from './plugins/error-handler';
import openApiPlugin, { type OpenApiPluginOptions } from './plugins/openapi';
import securityPlugin from './plugins/security';

export interface BuildAppOptions {
  config: AppConfig;
  /** Permite injetar dependências (ex.: mocks em testes). */
  userRepository?: UserRepository;
  ticketRepository?: TicketRepository;
  postRepository?: PostRepository;
  schoolRepository?: SchoolRepository;
  hasher?: PasswordHasher;
  logger?: FastifyServerOptions['logger'];
  /** Registra o gerador OpenAPI (usado por `npm run docs:openapi`; desligado em produção). */
  openapi?: OpenApiPluginOptions;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const userRepository = options.userRepository ?? new SequelizeUserRepository();
  const ticketRepository = options.ticketRepository ?? new SequelizeTicketRepository();
  const postRepository = options.postRepository ?? new SequelizePostRepository();
  const schoolRepository = options.schoolRepository ?? new SequelizeSchoolRepository();

  const app = Fastify({
    logger: options.logger ?? {
      level: config.LOG_LEVEL,
      // Nunca registrar credenciais ou tokens em log (OWASP A09:2025).
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["x-access-token"]',
          '*.password',
          '*.currentPassword',
          '*.accessToken',
        ],
        censor: '[REDACTED]',
      },
    },
    bodyLimit: 100 * 1024,
    // Atrás do API Gateway: usa X-Forwarded-For para o IP do cliente (rate limit/logs).
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    routerOptions: { ignoreTrailingSlash: true },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Precisa ser registrado antes das rotas para coletar os schemas.
  if (options.openapi) await app.register(openApiPlugin, options.openapi);
  await app.register(errorHandler);
  await app.register(sensible);
  await app.register(securityPlugin, { config });
  await app.register(authPlugin, { config, userRepository, hasher: options.hasher });

  const userService = new UserService(userRepository, options.hasher);
  const ticketService = new TicketService(ticketRepository, postRepository, schoolRepository);

  app.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['health'],
        security: [],
        response: { 200: z.object({ status: z.literal('ok') }) },
      },
    },
    () => ({ status: 'ok' as const }),
  );
  await app.register(authRoutes, { prefix: '/auth', config, userService });
  await app.register(userRoutes, { prefix: '/users', userService });
  await app.register(ticketRoutes, { prefix: '/tickets', ticketService });

  return app;
}
