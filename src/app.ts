import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from './config/env';
import { defaultModels, runWithDatabase } from './database/context';
import { connectionFor, resolveDatabaseTarget } from './database/routing';
import { modelsFor } from './database/sequelize';
import { AiService } from './modules/ai/ai.service';
import { SequelizeAiSettingsRepository } from './modules/ai/ai.repository';
import { aiRoutes } from './modules/ai/ai.routes';
import { authRoutes } from './modules/auth/auth.routes';
import {
  SequelizeSchoolRepository,
  type SchoolRepository,
} from './modules/schools/school.repository';
import { schoolRoutes } from './modules/schools/school.routes';
import { SchoolService } from './modules/schools/school.service';
import { SequelizePostRepository, type PostRepository } from './modules/tickets/post.repository';
import {
  SequelizeTicketRepository,
  type TicketRepository,
} from './modules/tickets/ticket.repository';
import { registerPublicTicketImages } from './modules/tickets/image.routes';
import { inboundRoutes } from './modules/inbound/inbound.routes';
import { InboundService, readInboundSecret } from './modules/inbound/inbound.service';
import { ticketRoutes } from './modules/tickets/ticket.routes';
import { TicketService } from './modules/tickets/ticket.service';
import { SequelizeUserRepository, type UserRepository } from './modules/users/user.repository';
import { userRoutes } from './modules/users/user.routes';
import { UserService, type PasswordHasher } from './modules/users/user.service';
import authPlugin from './plugins/auth';
import errorHandler from './plugins/error-handler';
import openApiPlugin, { type OpenApiPluginOptions } from './plugins/openapi';
import securityPlugin from './plugins/security';
import { Errors } from './shared/errors';

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
  /**
   * Abre o pool do banco escolhido pela URL. Testes com repositório em memória
   * desligam isso e só registram o ambiente da requisição.
   */
  manageDatabases?: boolean;
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
          '*.hash',
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

  app.addHook('onRequest', (request, _reply, done) => {
    if (request.method === 'OPTIONS') {
      done();
      return;
    }
    const path = (request.url.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
    if (path === '/health') {
      done();
      return;
    }

    const target = resolveDatabaseTarget({
      host: request.headers.host,
      origin: request.headers.origin,
    });
    if (!target) {
      done(Errors.badRequest('Endereço não corresponde a um ambiente conhecido'));
      return;
    }

    if (!connectionFor(config, target)) {
      done(Errors.serviceUnavailable('Banco deste ambiente não está configurado'));
      return;
    }

    try {
      const models = options.manageDatabases === false ? defaultModels : modelsFor(config, target);
      runWithDatabase(target, models, () => {
        done();
      });
    } catch (error) {
      done(error as Error);
    }
  });

  const userService = new UserService(userRepository, options.hasher);
  const schoolService = new SchoolService(schoolRepository);
  const ticketService = new TicketService(ticketRepository, postRepository, schoolRepository, userRepository);

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
  await app.register(schoolRoutes, { prefix: '/schools', schoolService });
  await registerPublicTicketImages(app);
  await app.register(ticketRoutes, { prefix: '/tickets', ticketService });
  const aiService = new AiService(new SequelizeAiSettingsRepository());
  await app.register(inboundRoutes, {
    prefix: '/inbound',
    inboundService: new InboundService(
      ticketRepository,
      postRepository,
      schoolRepository,
      () => readInboundSecret(config),
      (text, aiId) => aiService.improveText(text, aiId),
    ),
  });
  await app.register(aiRoutes, {
    prefix: '/ai',
    aiService,
  });

  return app;
}
