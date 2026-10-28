import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

/** Várias IAs. A linha que já existia ganha um nome a partir do protocolo e do modelo. */
export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.addColumn('fsfadm_ai_settings', 'name', {
    type: DataTypes.STRING(80),
    allowNull: true,
  });
  await queryInterface.sequelize.query(`
    UPDATE fsfadm_ai_settings
    SET name = LEFT(CONCAT(
      CASE provider WHEN 'anthropic' THEN 'Claude' ELSE 'OpenAI' END,
      ' · ',
      model
    ), 80)
    WHERE name IS NULL OR name = ''
  `);
  await queryInterface.changeColumn('fsfadm_ai_settings', 'name', {
    type: DataTypes.STRING(80),
    allowNull: false,
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('fsfadm_ai_settings', 'name');
};
