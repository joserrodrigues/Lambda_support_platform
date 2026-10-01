import { buildApp } from './app';
import { loadConfig } from './config/env';
import { closeSequelize, getSequelize } from './database/sequelize';

async function main(): Promise<void> {
  const config = loadConfig();
  const sequelize = getSequelize(config);
  await sequelize.authenticate();

  const app = await buildApp({
    config,
    logger:
      config.NODE_ENV === 'development'
        ? { level: config.LOG_LEVEL, transport: { target: 'pino-pretty' } }
        : undefined,
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Encerrando servidor');
    await app.close();
    await closeSequelize();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((error: unknown) => {
  process.stderr.write(`Falha ao iniciar o servidor: ${String(error)}\n`);
  process.exit(1);
});
