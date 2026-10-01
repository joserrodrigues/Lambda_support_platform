import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { AppConfig } from '../config/env';
import { AuthService } from '../modules/auth/auth.service';
import type { AccessTokenClaims, AccessTokenPayload } from '../modules/auth/auth.types';
import type { UserRole } from '../modules/users/user.model';
import type { UserRepository } from '../modules/users/user.repository';
import type { PasswordHasher } from '../modules/users/user.service';
import type { AuthenticatedUser } from '../modules/users/user.types';
import { Errors } from '../shared/errors';

export const ACCESS_TOKEN_HEADER = 'x-access-token';
export const ACCESS_TOKEN_EXPIRES_HEADER = 'x-access-token-expires-in';

type AuthHook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyInstance {
    authService: AuthService;
    /** Valida o Bearer token e renova a sessão (novo token no header `X-Access-Token`). */
    authenticate: AuthHook;
    requireRole: (...roles: UserRole[]) => AuthHook;
  }
  interface FastifyRequest {
    authUser: AuthenticatedUser | null;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenClaims;
    user: AccessTokenPayload;
  }
}

export interface AuthPluginOptions {
  config: AppConfig;
  userRepository: UserRepository;
  hasher?: PasswordHasher;
}

/** Retorna o usuário autenticado ou lança 401 caso a rota não tenha passado por `authenticate`. */
export function currentUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.authUser) throw Errors.unauthorized();
  return request.authUser;
}

export default fp<AuthPluginOptions>(
  async (fastify, { config, userRepository, hasher }) => {
    await fastify.register(fastifyJwt, {
      secret: config.JWT_SECRET,
      sign: {
        algorithm: 'HS256',
        // @fastify/jwt interpreta valores numéricos em segundos.
        expiresIn: config.JWT_EXPIRES_IN_SECONDS,
        iss: config.JWT_ISSUER,
        aud: config.JWT_AUDIENCE,
      },
      verify: {
        // Fixa o algoritmo para impedir ataques de "alg: none" / troca de algoritmo.
        algorithms: ['HS256'],
        allowedIss: config.JWT_ISSUER,
        allowedAud: config.JWT_AUDIENCE,
        requiredClaims: ['sub', 'exp', 'iat', 'ver', 'auth_time'],
      },
    });

    const authService = new AuthService(
      userRepository,
      { sign: (claims) => Promise.resolve(fastify.jwt.sign(claims)) },
      {
        expiresInSeconds: config.JWT_EXPIRES_IN_SECONDS,
        sessionMaxAgeSeconds: config.SESSION_MAX_AGE_SECONDS,
      },
      hasher,
    );

    fastify.decorate('authService', authService);
    fastify.decorateRequest('authUser', null);

    fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
      let payload: AccessTokenPayload;
      try {
        payload = await request.jwtVerify<AccessTokenPayload>();
      } catch {
        // Não expõe o motivo exato da falha (expirado, assinatura, formato) ao cliente.
        throw Errors.unauthorized('Token inválido ou expirado');
      }

      const user = await authService.validateSession(payload);
      request.authUser = { id: user.id, role: user.role };

      // Renovação deslizante: cada requisição autenticada recebe um novo token de 10 min.
      const renewed = await authService.refresh(user, payload);
      reply
        .header(ACCESS_TOKEN_HEADER, renewed)
        .header(ACCESS_TOKEN_EXPIRES_HEADER, String(config.JWT_EXPIRES_IN_SECONDS))
        .header('cache-control', 'no-store');
    });

    fastify.decorate('requireRole', (...roles: UserRole[]): AuthHook => (request) => {
      const user = currentUser(request);
      if (!roles.includes(user.role)) throw Errors.forbidden();
      return Promise.resolve();
    });
  },
  { name: 'auth' },
);
