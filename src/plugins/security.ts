import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { AppConfig } from '../config/env';
import { ACCESS_TOKEN_EXPIRES_HEADER, ACCESS_TOKEN_HEADER } from './auth';

export default fp<{ config: AppConfig }>(
  async (fastify, { config }) => {
    // API JSON: CSP restritiva, sem frames, HSTS etc. (OWASP A02:2025 - Security Misconfiguration).
    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    });

    await fastify.register(cors, {
      // Lista explícita de origens; vazio = CORS desabilitado (nenhuma origem permitida).
      origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      exposedHeaders: [ACCESS_TOKEN_HEADER, ACCESS_TOKEN_EXPIRES_HEADER],
      credentials: false,
      maxAge: 600,
    });

    // Defesa em profundidade: o throttling principal é feito no API Gateway.
    // Em Lambda o contador é por instância (memória), por isso não é a única barreira.
    await fastify.register(rateLimit, {
      global: true,
      max: config.RATE_LIMIT_MAX,
      timeWindow: '1 minute',
    });
  },
  { name: 'security' },
);
