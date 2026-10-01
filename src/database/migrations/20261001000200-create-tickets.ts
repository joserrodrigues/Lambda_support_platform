import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('tickets', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    // id da escola no School Guardian (sem FK: a tabela de escolas não pertence a este serviço).
    school_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false },
    dev_status: { type: DataTypes.STRING(30), allowNull: true },
    entry_type: { type: DataTypes.STRING(30), allowNull: false },
    error_type: { type: DataTypes.STRING(50), allowNull: true },
    support_level_2: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    priority: { type: DataTypes.STRING(20), allowNull: false },
    sla_type: { type: DataTypes.STRING(30), allowNull: true },
    response_at: { type: DataTypes.DATE, allowNull: true },
    technical_response_at: { type: DataTypes.DATE, allowNull: true },
    school_responsible: { type: DataTypes.STRING(120), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('tickets', ['school_id', 'created_at'], {
    name: 'tickets_school_id_created_at',
  });
  await queryInterface.addIndex('tickets', ['status'], { name: 'tickets_status' });
  await queryInterface.addIndex('tickets', ['priority'], { name: 'tickets_priority' });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('tickets');
};
