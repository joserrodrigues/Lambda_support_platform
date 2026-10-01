import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export class Ticket extends Model<InferAttributes<Ticket>, InferCreationAttributes<Ticket>> {
  declare id: CreationOptional<string>;
  /** Id da escola no School Guardian. */
  declare schoolId: number;
  declare status: string;
  declare devStatus: string | null;
  declare entryType: string;
  declare errorType: string | null;
  /** 1 quando o ticket foi escalado para o suporte nível 2. */
  declare supportLevel2: CreationOptional<number>;
  declare priority: string;
  declare slaType: string | null;
  declare responseAt: Date | null;
  declare technicalResponseAt: Date | null;
  /** Responsável pelo ticket na escola. */
  declare schoolResponsible: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initTicketModel(sequelize: Sequelize): typeof Ticket {
  Ticket.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      schoolId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      status: { type: DataTypes.STRING(30), allowNull: false },
      devStatus: { type: DataTypes.STRING(30), allowNull: true },
      entryType: { type: DataTypes.STRING(30), allowNull: false },
      errorType: { type: DataTypes.STRING(50), allowNull: true },
      supportLevel2: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        field: 'support_level_2',
      },
      priority: { type: DataTypes.STRING(20), allowNull: false },
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
