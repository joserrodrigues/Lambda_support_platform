import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

/**
 * Usuário do CMS (`usersWEB` do banco do colégio). Sem FK: o id só vale
 * dentro daquele banco, junto com `school_id`. O nome fica gravado para o
 * Suporte SG exibir sem abrir o banco da escola.
 */
const schoolUserId = {
  type: DataTypes.INTEGER.UNSIGNED,
  allowNull: true,
};
const schoolUserName = {
  type: DataTypes.STRING(191),
  allowNull: true,
};

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.addColumn('fsfadm_tickets', 'school_user_id', schoolUserId);
  await queryInterface.addColumn('fsfadm_tickets', 'school_user_name', schoolUserName);
  await queryInterface.addColumn('fsfadm_posts', 'school_user_id', schoolUserId);
  await queryInterface.addColumn('fsfadm_posts', 'school_user_name', schoolUserName);
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('fsfadm_posts', 'school_user_name');
  await queryInterface.removeColumn('fsfadm_posts', 'school_user_id');
  await queryInterface.removeColumn('fsfadm_tickets', 'school_user_name');
  await queryInterface.removeColumn('fsfadm_tickets', 'school_user_id');
};
