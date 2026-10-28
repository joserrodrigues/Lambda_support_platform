import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

/** Uma linha só. A chave fica aqui para o administrador configurar pela tela. */
export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('fsfadm_ai_settings', {
    id: { type: DataTypes.STRING(32), primaryKey: true },
    provider: { type: DataTypes.STRING(20), allowNull: false },
    base_url: { type: DataTypes.STRING(255), allowNull: false },
    model: { type: DataTypes.STRING(120), allowNull: false },
    api_key: { type: DataTypes.TEXT, allowNull: false },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('fsfadm_ai_settings');
};
