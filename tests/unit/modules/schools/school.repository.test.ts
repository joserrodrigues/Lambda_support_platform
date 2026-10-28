import { Op } from 'sequelize';
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

  it('should map the school model to fsfadm_Escolas', () => {
    expect(School.getTableName()).toBe('fsfadm_Escolas');
    expect(School.getAttributes().id).toMatchObject({ primaryKey: true, autoIncrement: true });
    expect(School.getAttributes().name).toMatchObject({ allowNull: false, field: 'nomeEscola' });
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

  describe('list', () => {
    it('should select only id and name, ordered by name', async () => {
      const findAndCountAll = jest.spyOn(School, 'findAndCountAll').mockResolvedValue({
        rows: [{ id: 7, name: 'Colégio Alfa' } as School],
        count: 1,
      } as never);

      const result = await repo.list({ limit: 20, offset: 0 });

      expect(result).toEqual({ rows: [{ id: 7, name: 'Colégio Alfa' }], count: 1 });
      expect(findAndCountAll).toHaveBeenCalledWith({
        where: {},
        attributes: ['id', 'name'],
        limit: 20,
        offset: 0,
        order: [
          ['name', 'ASC'],
          ['id', 'ASC'],
        ],
      });
    });

    it('should escape LIKE wildcards in the name filter', async () => {
      const findAndCountAll = jest.spyOn(School, 'findAndCountAll').mockResolvedValue({
        rows: [],
        count: 0,
      } as never);

      await repo.list({ limit: 10, offset: 20, name: '100%_a\\b' });

      expect(findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: { [Op.like]: '%100\\%\\_a\\\\b%' } },
          limit: 10,
          offset: 20,
        }),
      );
    });
  });
});
