import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalEnv = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const optionalPort = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const optionalBoolean = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

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

  /** Banco de https://suporte-t.schoolguardian.app. Vazio = ambiente hom indisponível. */
  HOM_DB_HOST: optionalEnv,
  HOM_DB_PORT: optionalPort,
  HOM_DB_NAME: optionalEnv,
  HOM_DB_USER: optionalEnv,
  HOM_DB_PASSWORD: z.string().optional(),
  HOM_DB_SSL: optionalBoolean,

  /** Banco de https://suporte.schoolguardian.app. Vazio em produção usa DB_* . */
  PROD_DB_HOST: optionalEnv,
  PROD_DB_PORT: optionalPort,
  PROD_DB_NAME: optionalEnv,
  PROD_DB_USER: optionalEnv,
  PROD_DB_PASSWORD: z.string().optional(),
  PROD_DB_SSL: optionalBoolean,

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

  /** Bucket privado das fotos (o mesmo do CMS). Vazio no local: a imagem fica em disco e não é assinada. */
  AWS_S3_BUCKET: optionalEnv,
  AWS_S3_REGION: z
    .string()
    .optional()
    .transform((value) => value?.trim() || 'us-west-2'),
  AWS_S3_URL: z
    .string()
    .optional()
    .transform((value) => value?.trim() || 'https://d2j2x01e904yhl.cloudfront.net/'),
  AWS_S3_KEY: optionalEnv,
  AWS_S3_SECRET: optionalEnv,

  /** Modelo da chave de entrada no local, com `%Y%`, `%m%`, `%d%`, `%H%`, `%i%` e `%s%`. */
  INBOUND_API_SECRET: optionalEnv,
  /** Nome do segredo dessa chave na AWS. Hom e produção leem o modelo por aqui. */
  INBOUND_API_SECRET_NAME: optionalEnv,
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
