import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export const USER_ROLES = ['admin', 'agent', 'requester'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * De-para provisório de `fsfadm_Usuarios.tipo` para o papel desta API.
 * A tabela legada não tem admin/agent/requester. Ajuste este mapa se o
 * significado de `tipo` no School Guardian for outro.
 * 1 administrador, 4 operação/vendas, 7 demais usuários internos.
 * `null` e `0` são tratados como inativos.
 */
export function roleFromTipo(tipo: number | null | undefined): UserRole {
  if (tipo === 1) return 'admin';
  if (tipo === 4) return 'agent';
  return 'requester';
}

export function isActiveTipo(tipo: number | null | undefined): boolean {
  return tipo !== null && tipo !== undefined && tipo !== 0;
}

/** Usuário interno já existente em `fsfadm_Usuarios` (BaseEscolas). */
export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare email: string;
  declare passwordHash: string;
  declare tipo: CreationOptional<number | null>;
  declare lastLoginAt: Date | null;
  declare createdAt: CreationOptional<Date>;
}

export function initUserModel(sequelize: Sequelize, model: typeof User = User): typeof User {
  model.init(
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false, field: 'nome' },
      email: { type: DataTypes.STRING(255), allowNull: false },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'senha' },
      tipo: { type: DataTypes.INTEGER, allowNull: true },
      lastLoginAt: { type: DataTypes.DATE, allowNull: false, field: 'dtUltLogin' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'dtCriacao' },
    },
    {
      sequelize,
      tableName: 'fsfadm_Usuarios',
      freezeTableName: true,
      underscored: false,
      timestamps: true,
      createdAt: 'dtCriacao',
      updatedAt: false,
      paranoid: false,
      defaultScope: { attributes: { exclude: ['passwordHash'] } },
      scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
    },
  );
  const blockWrite = (): never => {
    throw new Error('fsfadm_Usuarios é do outro sistema: este serviço não grava nela');
  };
  model.addHook('beforeSave', blockWrite);
  model.addHook('beforeDestroy', blockWrite);
  model.addHook('beforeBulkCreate', blockWrite);
  model.addHook('beforeBulkUpdate', blockWrite);
  model.addHook('beforeBulkDestroy', blockWrite);
  return model;
}
