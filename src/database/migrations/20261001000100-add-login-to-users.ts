import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

// Obs.: no MySQL, DDL faz commit implícito; por isso os passos não ficam em transação.
export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.addColumn('users', 'login', { type: DataTypes.STRING(60), allowNull: true });
  // Registros existentes recebem o próprio id como login provisório (único e não nulo).
  await queryInterface.sequelize.query('UPDATE users SET login = id WHERE login IS NULL');
  await queryInterface.changeColumn('users', 'login', {
    type: DataTypes.STRING(60),
    allowNull: false,
  });
  await queryInterface.addIndex('users', ['login'], { name: 'users_login_unique', unique: true });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeIndex('users', 'users_login_unique');
  await queryInterface.removeColumn('users', 'login');
};
