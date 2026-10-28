import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { School } from '../schools/school.model';
import type {
  TicketDevStatus,
  TicketEntryType,
  TicketSlaType,
  TicketStatus,
} from './ticket.constants';

/**
 * Os campos categóricos são VARCHAR no banco e validados apenas na aplicação
 * (ver `ticket.constants.ts`), para permitir novos valores sem migration.
 */
export class Ticket extends Model<InferAttributes<Ticket>, InferCreationAttributes<Ticket>> {
  declare id: CreationOptional<string>;
  /** Id da escola em `fsfadm_Escolas` (sem FK: a tabela é do outro sistema). */
  declare schoolId: number;
  declare title: string | null;
  declare status: CreationOptional<TicketStatus>;
  declare devStatus: TicketDevStatus | null;
  declare entryType: TicketEntryType;
  /** Texto livre (valores ainda não definidos pelo produto). */
  declare errorType: string | null;
  /** 1 quando o ticket foi escalado para o suporte nível 2 (exposto como boolean na API). */
  declare supportLevel2: CreationOptional<number>;
  declare priority: CreationOptional<boolean>;
  declare slaType: TicketSlaType | null;
  declare responseAt: Date | null;
  declare technicalResponseAt: Date | null;
  /** Responsável pelo ticket na escola (texto livre, nem sempre é um usuário). */
  declare schoolResponsible: string | null;
  /** Id em `usersWEB` do banco do colégio. Sem FK. Quem criou o chamado no CMS. */
  declare schoolUserId: number | null;
  /** Nome (ou username) desse usuário no momento da criação. */
  declare schoolUserName: string | null;
  declare viewedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare school?: NonAttribute<School>;
}

export function initTicketModel(sequelize: Sequelize, model: typeof Ticket = Ticket): typeof Ticket {
  model.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      schoolId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      title: { type: DataTypes.STRING(191), allowNull: true },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'aguardando' },
      devStatus: { type: DataTypes.STRING(30), allowNull: true },
      entryType: { type: DataTypes.STRING(30), allowNull: false },
      errorType: { type: DataTypes.STRING(50), allowNull: true },
      supportLevel2: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        field: 'support_level_2',
      },
      priority: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      slaType: { type: DataTypes.STRING(30), allowNull: true },
      responseAt: { type: DataTypes.DATE, allowNull: true },
      technicalResponseAt: { type: DataTypes.DATE, allowNull: true },
      schoolResponsible: { type: DataTypes.STRING(120), allowNull: true },
      schoolUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'school_user_id' },
      schoolUserName: { type: DataTypes.STRING(191), allowNull: true, field: 'school_user_name' },
      viewedAt: { type: DataTypes.DATE, allowNull: true, field: 'viewed_at' },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'fsfadm_tickets', freezeTableName: true },
  );
  return model;
}
