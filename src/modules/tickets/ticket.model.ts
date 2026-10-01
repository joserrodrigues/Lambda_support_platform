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
  /** Id da escola (FK `schools.id`, espelha o id do School Guardian). */
  declare schoolId: number;
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
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare school?: NonAttribute<School>;
}

export function initTicketModel(sequelize: Sequelize): typeof Ticket {
  Ticket.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      schoolId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
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
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'tickets' },
  );
  return Ticket;
}
