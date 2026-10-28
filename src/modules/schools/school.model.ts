import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

/**
 * Escola já existente em `fsfadm_Escolas`. O model declara só `id` e `nomeEscola`
 * para não ler nem gravar as demais colunas da tabela compartilhada.
 */
export class School extends Model<InferAttributes<School>, InferCreationAttributes<School>> {
  declare id: CreationOptional<number>;
  declare name: string;
}

export function initSchoolModel(sequelize: Sequelize, model: typeof School = School): typeof School {
  model.init(
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false, field: 'nomeEscola' },
    },
    {
      sequelize,
      tableName: 'fsfadm_Escolas',
      freezeTableName: true,
      underscored: false,
      timestamps: false,
    },
  );
  const blockWrite = (): never => {
    throw new Error('fsfadm_Escolas é do outro sistema: este serviço não grava nela');
  };
  model.addHook('beforeSave', blockWrite);
  model.addHook('beforeDestroy', blockWrite);
  model.addHook('beforeBulkCreate', blockWrite);
  model.addHook('beforeBulkUpdate', blockWrite);
  model.addHook('beforeBulkDestroy', blockWrite);
  return model;
}
