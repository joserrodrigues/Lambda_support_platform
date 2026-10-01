import { School } from './school.model';

export interface SchoolRepository {
  exists(id: number): Promise<boolean>;
}

export class SequelizeSchoolRepository implements SchoolRepository {
  async exists(id: number): Promise<boolean> {
    const count = await School.count({ where: { id } });
    return count > 0;
  }
}
