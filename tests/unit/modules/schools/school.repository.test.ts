import { closeSequelize, getSequelize } from '../../../../src/database/sequelize';
import { School } from '../../../../src/modules/schools/school.model';
import { SequelizeSchoolRepository } from '../../../../src/modules/schools/school.repository';
import { testConfig } from '../../../helpers/fakes';

// Nenhuma conexão é aberta: os métodos estáticos do model são substituídos por mocks.
beforeAll(() => {
  getSequelize(testConfig);
});

afterAll(async () => {
  await closeSequelize();
});

describe('SequelizeSchoolRepository', () => {
  const repo = new SequelizeSchoolRepository();

  it('should map the school model to the schools table', () => {
    expect(School.getTableName()).toBe('schools');
    expect(School.getAttributes().id).toMatchObject({ primaryKey: true, autoIncrement: true });
    expect(School.getAttributes().name).toMatchObject({ allowNull: false });
  });

  describe('exists', () => {
    it('should return true when the school is found', async () => {
      const count = jest.spyOn(School, 'count').mockResolvedValue(1);

      const result = await repo.exists(42);

      expect(result).toBe(true);
      expect(count).toHaveBeenCalledWith({ where: { id: 42 } });
    });

    it('should return false when the school is not found', async () => {
      jest.spyOn(School, 'count').mockResolvedValue(0);

      const result = await repo.exists(999);

      expect(result).toBe(false);
    });
  });
});
