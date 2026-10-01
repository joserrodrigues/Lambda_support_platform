import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),

  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1).default('school_guardian_support'),
  DB_USER: z.string().min(1).default('app'),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: booleanFromString,
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),
  DB_LOGGING: booleanFromString,

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_ISSUER: z.string().min(1).default('school-guardian-support'),
  JWT_AUDIENCE: z.string().min(1).default('school-guardian-support-api'),
  /** Validade do access token em segundos (padrão: 10 minutos). */
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(600),
  /** Tempo máximo absoluto de uma sessão, mesmo com renovação deslizante (padrão: 8h). */
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(28_800),

  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
});

export type AppConfig = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Nunca inclui valores recebidos na mensagem, apenas os nomes das variáveis inválidas.
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new ConfigError(`Configuração de ambiente inválida: ${fields}`);
  }
  return result.data;
}
