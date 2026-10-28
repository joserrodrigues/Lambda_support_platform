import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

/**
 * Nota interna do suporte. `0` é o registro visível para a escola (FSFWEB).
 * `1` só é lido pelo Suporte SG. Posts já existentes ficam públicos.
 */
export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.addColumn('fsfadm_posts', 'is_internal', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('fsfadm_posts', 'is_internal');
};
