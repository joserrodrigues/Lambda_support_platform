import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

/** Hora em que alguém da equipe abriu o chamado. Vazio significa card novo. */
export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.addColumn('fsfadm_tickets', 'viewed_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('fsfadm_tickets', 'viewed_at');
};
