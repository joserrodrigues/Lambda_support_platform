import { Op, type WhereOptions } from 'sequelize';
import { activeModels } from '../../database/context';
import { type School } from './school.model';

function schoolModel(): typeof School {
  return activeModels().School;
}

export interface SchoolListItem {
  id: number;
  name: string;
}

export interface SchoolListParams {
  limit: number;
  offset: number;
  name?: string;
}

export interface SchoolRepository {
  exists(id: number): Promise<boolean>;
  list(params: SchoolListParams): Promise<{ rows: SchoolListItem[]; count: number }>;
}

/** Escapa `%`, `_` e `\` para que o termo seja literal num LIKE. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class SequelizeSchoolRepository implements SchoolRepository {
  async exists(id: number): Promise<boolean> {
    const count = await schoolModel().count({ where: { id } });
    return count > 0;
  }

  async list({ limit, offset, name }: SchoolListParams): Promise<{
    rows: SchoolListItem[];
    count: number;
  }> {
    const where: WhereOptions<School> = {};
    const term = name?.trim();
    if (term) {
      where.name = { [Op.like]: `%${escapeLike(term)}%` };
    }
    const { rows, count } = await schoolModel().findAndCountAll({
      where,
      attributes: ['id', 'name'],
      limit,
      offset,
      order: [
        ['name', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return {
      rows: rows.map((school) => ({ id: school.id, name: school.name })),
      count,
    };
  }
}
