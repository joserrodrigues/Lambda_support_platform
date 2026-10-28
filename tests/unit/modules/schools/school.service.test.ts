import { AppError } from '../../../../src/shared/errors';
import { InMemorySchoolRepository } from '../../../helpers/fakes';
import { SchoolService } from '../../../../src/modules/schools/school.service';

describe('SchoolService', () => {
  const schools = new InMemorySchoolRepository([2, 1]);
  schools.schools.set(2, 'Beta');
  schools.schools.set(1, 'Alfa');
  const service = new SchoolService(schools);

  it('should return id and name for staff, ordered by name', async () => {
    const result = await service.list({ page: 1, pageSize: 20 }, { id: 1, role: 'agent' });

    expect(result).toEqual({
      data: [
        { id: 1, name: 'Alfa' },
        { id: 2, name: 'Beta' },
      ],
      meta: { page: 1, pageSize: 20, total: 2 },
    });
  });

  it('should filter by name and paginate', async () => {
    const result = await service.list(
      { page: 1, pageSize: 1, name: 'alf' },
      { id: 1, role: 'admin' },
    );

    expect(result.data).toEqual([{ id: 1, name: 'Alfa' }]);
    expect(result.meta.total).toBe(1);
  });

  it('should reject a requester', async () => {
    await expect(service.list({ page: 1, pageSize: 20 }, { id: 3, role: 'requester' })).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
