import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { User } from '../users/user.model';

export class Post extends Model<InferAttributes<Post>, InferCreationAttributes<Post>> {
  declare id: CreationOptional<string>;
  declare ticketId: string;
  /** Autor (`fsfadm_Usuarios.id`, sem FK: a tabela é do outro sistema). */
  declare userId: number | null;
  declare content: string;
  /** `true` = nota interna, visível só no Suporte SG. A escola (FSFWEB) não lê este post. */
  declare isInternal: CreationOptional<boolean>;
  /** Id em `usersWEB` quando a mensagem veio do CMS. Null se o autor é o suporte (`userId`). */
  declare schoolUserId: CreationOptional<number | null>;
  /** Nome (ou username) do usuário do colégio no momento do envio. */
  declare schoolUserName: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  /** Carregado via `include` (alias `author`). */
  declare author?: NonAttribute<User | null>;
}

export function initPostModel(sequelize: Sequelize, model: typeof Post = Post): typeof Post {
  model.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      ticketId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      content: { type: DataTypes.TEXT, allowNull: false },
      isInternal: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_internal',
      },
      schoolUserId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        field: 'school_user_id',
      },
      schoolUserName: {
        type: DataTypes.STRING(191),
        allowNull: true,
        defaultValue: null,
        field: 'school_user_name',
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'fsfadm_posts', freezeTableName: true },
  );
  return model;
}
