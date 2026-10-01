import type { WhereOptions } from 'sequelize';
import { Ticket } from './ticket.model';
import type {
  CreateTicketData,
  Pagination,
  TicketEntity,
  TicketFilters,
  UpdateTicketData,
} from './ticket.types';

export interface TicketRepository {
  findById(id: string): Promise<TicketEntity | null>;
  list(
    params: Pagination & { filters: TicketFilters },
  ): Promise<{ rows: TicketEntity[]; count: number }>;
  create(data: CreateTicketData): Promise<TicketEntity>;
  update(id: string, data: UpdateTicketData): Promise<TicketEntity | null>;
  /** Remove o ticket; os posts são removidos pela FK `ON DELETE CASCADE`. */
  delete(id: string): Promise<boolean>;
}

function toEntity(ticket: Ticket): TicketEntity {
  return {
    id: ticket.id,
    schoolId: ticket.schoolId,
    status: ticket.status,
    devStatus: ticket.devStatus ?? null,
    entryType: ticket.entryType,
    errorType: ticket.errorType ?? null,
    supportLevel2: Number(ticket.supportLevel2) === 1,
    priority: Boolean(ticket.priority),
    slaType: ticket.slaType ?? null,
    responseAt: ticket.responseAt ?? null,
    technicalResponseAt: ticket.technicalResponseAt ?? null,
    schoolResponsible: ticket.schoolResponsible ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

/** Converte o boolean da aplicação para a coluna TINYINT `support_level_2`. */
function toAttributes(data: UpdateTicketData) {
  const { supportLevel2, ...rest } = data;
  return supportLevel2 === undefined ? rest : { ...rest, supportLevel2: supportLevel2 ? 1 : 0 };
}

function toWhere(filters: TicketFilters): WhereOptions<Ticket> {
  const where: WhereOptions<Ticket> = {};
  if (filters.schoolId !== undefined) where.schoolId = filters.schoolId;
  if (filters.status !== undefined) where.status = filters.status;
  if (filters.devStatus !== undefined) where.devStatus = filters.devStatus;
  if (filters.entryType !== undefined) where.entryType = filters.entryType;
  if (filters.slaType !== undefined) where.slaType = filters.slaType;
  if (filters.priority !== undefined) where.priority = filters.priority;
  if (filters.supportLevel2 !== undefined) where.supportLevel2 = filters.supportLevel2 ? 1 : 0;
  return where;
}

export class SequelizeTicketRepository implements TicketRepository {
  async findById(id: string): Promise<TicketEntity | null> {
    const ticket = await Ticket.findByPk(id);
    return ticket ? toEntity(ticket) : null;
  }

  async list({ limit, offset, filters }: Pagination & { filters: TicketFilters }) {
    const { rows, count } = await Ticket.findAndCountAll({
      where: toWhere(filters),
      limit,
      offset,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
      ],
    });
    return { rows: rows.map(toEntity), count };
  }

  async create(data: CreateTicketData): Promise<TicketEntity> {
    const ticket = await Ticket.create({ ...data, supportLevel2: data.supportLevel2 ? 1 : 0 });
    return toEntity(ticket);
  }

  async update(id: string, data: UpdateTicketData): Promise<TicketEntity | null> {
    const ticket = await Ticket.findByPk(id);
    if (!ticket) return null;
    ticket.set(toAttributes(data));
    await ticket.save();
    return toEntity(ticket);
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await Ticket.destroy({ where: { id } });
    return deleted > 0;
  }
}
