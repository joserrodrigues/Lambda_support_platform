import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

/**
 * Únicas tabelas deste serviço. `fsfadm_Usuarios` e `fsfadm_Escolas` já existem
 * e são de outro sistema: esta migration não cria, não altera e não declara
 * FOREIGN KEY para elas (um RESTRICT impediria o outro sistema de apagar linhas).
 * `school_id` e `user_id` são só referências lógicas, validadas na aplicação.
 */
export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('fsfadm_tickets', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    school_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false },
    dev_status: { type: DataTypes.STRING(30), allowNull: true },
    entry_type: { type: DataTypes.STRING(30), allowNull: false },
    error_type: { type: DataTypes.STRING(50), allowNull: true },
    support_level_2: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    priority: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sla_type: { type: DataTypes.STRING(30), allowNull: true },
    response_at: { type: DataTypes.DATE, allowNull: true },
    technical_response_at: { type: DataTypes.DATE, allowNull: true },
    school_responsible: { type: DataTypes.STRING(120), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('fsfadm_tickets', ['school_id', 'created_at'], {
    name: 'fsfadm_tickets_school_id_created_at',
  });
  await queryInterface.addIndex('fsfadm_tickets', ['status'], { name: 'fsfadm_tickets_status' });
  await queryInterface.addIndex('fsfadm_tickets', ['priority'], { name: 'fsfadm_tickets_priority' });

  await queryInterface.createTable('fsfadm_posts', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'fsfadm_tickets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    content: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('fsfadm_posts', ['ticket_id', 'created_at'], {
    name: 'fsfadm_posts_ticket_id_created_at',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('fsfadm_posts');
  await queryInterface.dropTable('fsfadm_tickets');
};
