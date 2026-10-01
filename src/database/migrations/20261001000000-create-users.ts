import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('users', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    role: {
      type: DataTypes.ENUM('admin', 'agent', 'requester'),
      allowNull: false,
      defaultValue: 'requester',
    },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    token_version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    last_login_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('users');
};
