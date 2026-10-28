import type { AppConfig } from '../config/env';

export const DATABASE_TARGETS = ['local', 'hom', 'prod'] as const;
export type DatabaseTarget = (typeof DATABASE_TARGETS)[number];

export const DATABASE_HOSTS = {
  prod: 'suporte.schoolguardian.app',
  hom: 'suporte-t.schoolguardian.app',
} as const;

export interface DatabaseConnectionConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean;
}

function hostnameOf(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end === -1 ? null : trimmed.slice(1, end);
  }
  const colon = trimmed.lastIndexOf(':');
  if (colon > -1 && trimmed.indexOf(':') === colon) return trimmed.slice(0, colon);
  return trimmed;
}

function originHostname(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string | null): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function targetFromHostname(hostname: string | null): DatabaseTarget | null {
  if (!hostname) return null;
  if (isLocalHost(hostname)) return 'local';
  if (hostname === DATABASE_HOSTS.prod) return 'prod';
  if (hostname === DATABASE_HOSTS.hom) return 'hom';
  return null;
}

/**
 * Escolhe o banco pelo host da requisição. `localhost` ganha da Origin.
 * `suporte.schoolguardian.app` é produção. Qualquer outro endereço publicado
 * usa o banco de teste.
 */
export function resolveDatabaseTarget(input: {
  host?: string;
  origin?: string;
}): DatabaseTarget | null {
  const host = hostnameOf(input.host);
  if (isLocalHost(host)) return 'local';
  const fromHost = targetFromHostname(host);
  if (fromHost) return fromHost;
  const fromOrigin = targetFromHostname(originHostname(input.origin));
  if (fromOrigin) return fromOrigin;
  return 'hom';
}

function localConnection(config: AppConfig): DatabaseConnectionConfig {
  return {
    host: config.DB_HOST,
    port: config.DB_PORT,
    name: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    ssl: config.DB_SSL,
  };
}

function remoteConnection(
  host: string | undefined,
  port: number | undefined,
  name: string | undefined,
  user: string | undefined,
  password: string | undefined,
  ssl: boolean | undefined,
): DatabaseConnectionConfig | null {
  if (!host || !name || !user) return null;
  return {
    host,
    port: port ?? 3306,
    name,
    user,
    password: password ?? '',
    ssl: ssl ?? true,
  };
}

/**
 * `local` usa sempre `DB_*` (a conexão de hoje).
 * `hom` exige `HOM_DB_*`.
 * `prod` usa `PROD_DB_*`, ou `DB_*` quando a API já está em produção e o banco
 * de prod ainda não foi separado nas variáveis próprias.
 */
export function connectionFor(
  config: AppConfig,
  target: DatabaseTarget,
): DatabaseConnectionConfig | null {
  if (target === 'local') return localConnection(config);
  if (target === 'hom') {
    return remoteConnection(
      config.HOM_DB_HOST,
      config.HOM_DB_PORT,
      config.HOM_DB_NAME,
      config.HOM_DB_USER,
      config.HOM_DB_PASSWORD,
      config.HOM_DB_SSL,
    );
  }
  const prod = remoteConnection(
    config.PROD_DB_HOST,
    config.PROD_DB_PORT,
    config.PROD_DB_NAME,
    config.PROD_DB_USER,
    config.PROD_DB_PASSWORD,
    config.PROD_DB_SSL,
  );
  if (prod) return prod;
  if (config.NODE_ENV === 'production') return localConnection(config);
  return null;
}

export function sameConnection(a: DatabaseConnectionConfig, b: DatabaseConnectionConfig): boolean {
  return a.host === b.host && a.port === b.port && a.name === b.name && a.user === b.user;
}
