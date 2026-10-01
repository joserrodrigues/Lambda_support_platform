import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppConfig } from './config/env';
import { authRoutes } from './modules/auth/auth.routes';
import { SequelizeUserRepository, type UserRepository } from './modules/users/user.repository';
import { userRoutes } from './modules/users/user.routes';
import { UserService, type PasswordHasher } from './modules/users/user.service';
import authPlugin from './plugins/auth';
import errorHandler from './plugins/error-handler';
import securityPlugin from './plugins/security';

export interface BuildAppOptions {
  config: AppConfig;
  /** Permite injetar dependências (ex.: mocks em testes). */
  userRepository?: UserRepository;
  hasher?: PasswordHasher;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const userRepository = options.userRepository ?? new SequelizeUserRepository();

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

  await app.register(errorHandler);
  await app.register(sensible);
  await app.register(securityPlugin, { config });
  await app.register(authPlugin, { config, userRepository, hasher: options.hasher });

  const userService = new UserService(userRepository, options.hasher);

  app.get('/health', { config: { rateLimit: false } }, () => ({ status: 'ok' }));
  await app.register(authRoutes, { prefix: '/auth', config, userService });
  await app.register(userRoutes, { prefix: '/users', userService });

  return app;
}
