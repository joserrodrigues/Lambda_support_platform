import path from 'node:path';
import type { QueryInterface, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

export type Migration = (params: { context: QueryInterface }) => Promise<void>;

interface MigrationModule {
  up: Migration;
  down: Migration;
}

export function createMigrator(sequelize: Sequelize): Umzug<QueryInterface> {
  return new Umzug<QueryInterface>({
    migrations: {
      glob: ['migrations/*.{ts,js}', { cwd: __dirname, ignore: ['**/*.d.ts'] }],
      resolve: ({ name, path: filePath, context }) => {
        if (!filePath) throw new Error(`Migration sem caminho: ${name}`);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const migration = require(filePath) as MigrationModule;
        return {
          name: path.basename(name, path.extname(name)),
          up: () => migration.up({ context }),
          down: () => migration.down({ context }),
        };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize, tableName: 'sequelize_meta' }),
    logger: console,
  });
}
