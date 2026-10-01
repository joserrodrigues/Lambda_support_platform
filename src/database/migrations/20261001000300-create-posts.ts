import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('posts', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tickets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    // Autor do post (usuários são excluídos apenas logicamente, por isso RESTRICT).
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    content: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('posts', ['ticket_id', 'created_at'], {
    name: 'posts_ticket_id_created_at',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('posts');
};
