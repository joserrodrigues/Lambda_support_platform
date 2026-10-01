import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

const SCHOOL_FK = 'tickets_school_id_schools_fk';

// Obs.: no MySQL, DDL faz commit implícito; por isso os passos não ficam em transação.
export const up: Migration = async ({ context: queryInterface }) => {
  // 1) priority: VARCHAR(20) -> BOOLEAN (TINYINT(1)). Normaliza os dados antigos antes da conversão:
  //    apenas valores explicitamente afirmativos viram 1; todo o resto vira 0.
  await queryInterface.sequelize.query(
    "UPDATE tickets SET priority = CASE WHEN LOWER(TRIM(priority)) IN ('1', 'true', 'sim') THEN '1' ELSE '0' END",
  );
  await queryInterface.changeColumn('tickets', 'priority', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  // 2) Garante que todo school_id já usado tenha uma escola correspondente (senão a FK falha).
  //    As escolas criadas aqui recebem um nome provisório e devem ser renomeadas depois.
  await queryInterface.sequelize.query(
    `INSERT INTO schools (id, name, created_at, updated_at)
     SELECT DISTINCT t.school_id, CONCAT('Escola ', t.school_id), UTC_TIMESTAMP(), UTC_TIMESTAMP()
     FROM tickets t
     LEFT JOIN schools s ON s.id = t.school_id
     WHERE s.id IS NULL`,
  );

  // 3) FK tickets.school_id -> schools.id (o índice tickets_school_id_created_at atende a FK).
  await queryInterface.addConstraint('tickets', {
    fields: ['school_id'],
    type: 'foreign key',
    name: SCHOOL_FK,
    references: { table: 'schools', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeConstraint('tickets', SCHOOL_FK);
  // Os valores 0/1 são preservados como texto ('0'/'1').
  await queryInterface.changeColumn('tickets', 'priority', {
    type: DataTypes.STRING(20),
    allowNull: false,
  });
};
