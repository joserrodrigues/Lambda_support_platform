import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

/** Hom e produção guardam o nome do segredo na AWS. A chave em si não entra na tabela. */
export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.addColumn('fsfadm_ai_settings', 'secret_name', {
    type: DataTypes.STRING(512),
    allowNull: false,
    defaultValue: '',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('fsfadm_ai_settings', 'secret_name');
};
