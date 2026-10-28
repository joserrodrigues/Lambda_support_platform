import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

/** Título do chamado. Chamados do CMS sem responsável passam a usar o nome de quem abriu. */
export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.addColumn('fsfadm_tickets', 'title', {
    type: DataTypes.STRING(191),
    allowNull: true,
  });
  await queryInterface.sequelize.query(`
    UPDATE fsfadm_tickets
    SET school_responsible = school_user_name
    WHERE entry_type = 'cms'
      AND school_user_name IS NOT NULL
      AND school_user_name <> ''
      AND (school_responsible IS NULL OR school_responsible = '')
  `);
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('fsfadm_tickets', 'title');
};
