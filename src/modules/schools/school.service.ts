import { Errors } from '../../shared/errors';
import type { UserRole } from '../users/user.model';
import type { AuthenticatedUser } from '../users/user.types';
import type { SchoolRepository } from './school.repository';
import type { ListSchoolsQuery, SchoolListItem } from './school.schemas';

/** Mesma allowlist dos tickets: a lista alimenta o formulário de abertura. */
const SCHOOL_LIST_ROLES: readonly UserRole[] = ['admin', 'agent'];

export class SchoolService {
  constructor(private readonly schools: SchoolRepository) {}

  async list(
    query: ListSchoolsQuery,
    actor: AuthenticatedUser,
  ): Promise<{ data: SchoolListItem[]; meta: { page: number; pageSize: number; total: number } }> {
    if (!SCHOOL_LIST_ROLES.includes(actor.role)) {
      throw Errors.forbidden('Sem permissão para listar escolas');
    }
    const { page, pageSize, name } = query;
    const { rows, count } = await this.schools.list({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      name,
    });
    return { data: rows, meta: { page, pageSize, total: count } };
  }
}
