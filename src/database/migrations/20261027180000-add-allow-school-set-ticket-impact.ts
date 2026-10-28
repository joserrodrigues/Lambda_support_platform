import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

/**
 * 1 mostra o nível de impacto para a escola no CMS. 0 oculta.
 * A coluna fica em fsfadm_school_settings, a mesma tabela que o FSFWEB lê.
 */
export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.addColumn('fsfadm_school_settings', 'allow_school_set_ticket_impact', {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 0,
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('fsfadm_school_settings', 'allow_school_set_ticket_impact');
};
