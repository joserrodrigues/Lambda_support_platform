import mysql2 from 'mysql2';
import { Sequelize } from 'sequelize';
import type { AppConfig } from '../config/env';
import { Errors } from '../shared/errors';
import { defaultModels, type AppModels } from './context';
import { bindModels, initModels } from './models';
import {
  connectionFor,
  sameConnection,
  type DatabaseConnectionConfig,
  type DatabaseTarget,
} from './routing';

let instance: Sequelize | undefined;

const pools = new Map<DatabaseTarget, { sequelize: Sequelize; models: AppModels }>();

function openSequelize(settings: DatabaseConnectionConfig, config: AppConfig): Sequelize {
  return new Sequelize(settings.name, settings.user, settings.password, {
    host: settings.host,
    port: settings.port,
    dialect: 'mysql',
    dialectModule: mysql2,
    logging: config.DB_LOGGING ? (sql) => process.stdout.write(`${sql}\n`) : false,
    timezone: '+00:00',
    dialectOptions: settings.ssl
      ? { ssl: { rejectUnauthorized: false } }
      : {},
    pool: {
      max: config.DB_POOL_MAX,
      min: 0,
      idle: 10_000,
      acquire: 10_000,
      evict: 1_000,
    },
    define: {
      underscored: true,
      timestamps: true,
    },
  });
}

/**
 * Conexão de `DB_*` (localhost). Em Lambda a instância é reutilizada entre invocações.
 */
export function getSequelize(config: AppConfig): Sequelize {
  if (instance) return instance;

  const local = connectionFor(config, 'local');
  if (!local) throw new Error('DB_* não configurado');
  instance = openSequelize(local, config);
  initModels(instance);
  pools.set('local', { sequelize: instance, models: defaultModels });
  return instance;
}

const NOT_CONFIGURED = 'Banco deste ambiente não está configurado';

/** Models da conexão escolhida pela URL. Cria o pool na primeira vez. */
export function modelsFor(config: AppConfig, target: DatabaseTarget): AppModels {
  const cached = pools.get(target);
  if (cached) return cached.models;

  const settings = connectionFor(config, target);
  if (!settings) throw Errors.serviceUnavailable(NOT_CONFIGURED);

  const local = connectionFor(config, 'local');
  if (!local) throw Errors.serviceUnavailable(NOT_CONFIGURED);
  if (target === 'local' || sameConnection(settings, local)) {
    getSequelize(config);
    return defaultModels;
  }

  const sequelize = openSequelize(settings, config);
  const models = bindModels(sequelize);
  pools.set(target, { sequelize, models });
  return models;
}

export async function closeSequelize(): Promise<void> {
  const closing = new Set<Sequelize>();
  if (instance) closing.add(instance);
  for (const pool of pools.values()) closing.add(pool.sequelize);
  pools.clear();
  instance = undefined;
  await Promise.all([...closing].map((sequelize) => sequelize.close()));
}
