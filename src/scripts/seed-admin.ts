/* eslint-disable no-console */
import { loadConfig } from '../config/env';
import { closeSequelize, getSequelize } from '../database/sequelize';
import { SequelizeUserRepository } from '../modules/users/user.repository';
import { createUserBodySchema } from '../modules/users/user.schemas';
import { UserService } from '../modules/users/user.service';

/** Cria o primeiro administrador a partir de ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD. */
async function run(): Promise<void> {
  const input = createUserBodySchema.parse({
    name: process.env.ADMIN_NAME ?? 'Administrador',
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    role: 'admin',
  });
  getSequelize(loadConfig());
  try {
    const user = await new UserService(new SequelizeUserRepository()).create(input);
    console.log(`Administrador criado: ${user.email} (${user.id})`);
  } finally {
    await closeSequelize();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
