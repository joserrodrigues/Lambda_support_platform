import mysql2 from 'mysql2';
import { Sequelize } from 'sequelize';
import type { AppConfig } from '../config/env';
import { initModels } from './models';

let instance: Sequelize | undefined;

/**
 * Retorna uma instância única do Sequelize. Em Lambda, a instância é criada fora
 * do handler e reutilizada entre invocações (warm start), evitando abrir uma nova
 * conexão a cada requisição.
 */
export function getSequelize(config: AppConfig): Sequelize {
  if (instance) return instance;

  instance = new Sequelize(config.DB_NAME, config.DB_USER, config.DB_PASSWORD, {
    host: config.DB_HOST,
    port: config.DB_PORT,
    dialect: 'mysql',
    // Import explícito para o bundle do esbuild (evita require dinâmico do Sequelize).
    dialectModule: mysql2,
    logging: config.DB_LOGGING ? (sql) => process.stdout.write(`${sql}\n`) : false,
    timezone: '+00:00',
    dialectOptions: config.DB_SSL ? { ssl: { rejectUnauthorized: true } } : {},
    pool: {
      max: config.DB_POOL_MAX,
      min: 0,
      idle: 10_000,
      acquire: 10_000,
      // Em Lambda, conexões ociosas são encerradas antes de o container congelar.
      evict: 1_000,
    },
    define: {
      underscored: true,
      timestamps: true,
    },
  });

  initModels(instance);
  return instance;
}

export async function closeSequelize(): Promise<void> {
  if (!instance) return;
  await instance.close();
  instance = undefined;
}
