/* eslint-disable no-console */
import { loadConfig } from '../config/env';
import { createMigrator } from '../database/migrator';
import { closeSequelize, getSequelize } from '../database/sequelize';

async function run(): Promise<void> {
  const direction = process.argv[2] ?? 'up';
  const sequelize = getSequelize(loadConfig());
  const migrator = createMigrator(sequelize);
  try {
    if (direction === 'down') await migrator.down();
    else await migrator.up();
    console.log(`Migrations (${direction}) executadas com sucesso`);
  } finally {
    await closeSequelize();
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
