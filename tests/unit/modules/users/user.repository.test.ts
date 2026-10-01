import { Op } from 'sequelize';
import { closeSequelize, getSequelize } from '../../../../src/database/sequelize';
import { User } from '../../../../src/modules/users/user.model';
import { SequelizeUserRepository } from '../../../../src/modules/users/user.repository';
import { makeUser } from '../../../helpers/factories';
import { testConfig } from '../../../helpers/fakes';

// Nenhuma conexão é aberta: os métodos estáticos do model são substituídos por mocks.
beforeAll(() => {
  getSequelize(testConfig);
});

afterAll(async () => {
  await closeSequelize();
});

function buildModel(overrides = {}) {
  const data = makeUser(overrides);
  const instance = User.build(data, { isNewRecord: false });
  jest.spyOn(instance, 'save').mockResolvedValue(instance);
  return { data, instance };
}

describe('SequelizeUserRepository', () => {
  const repo = new SequelizeUserRepository();

  it('should reuse the Sequelize singleton', () => {
    expect(getSequelize(testConfig)).toBe(getSequelize(testConfig));
  });

  it('should exclude passwordHash in the default scope', () => {
    expect(User.options.defaultScope).toEqual({ attributes: { exclude: ['passwordHash'] } });
  });

  describe('findById', () => {
    it('should map the model to a plain entity without passwordHash', async () => {
      const { data, instance } = buildModel();
      jest.spyOn(User, 'findByPk').mockResolvedValue(instance);

      const result = await repo.findById(data.id);

      expect(result).toMatchObject({ id: data.id, email: data.email });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should return null when not found', async () => {
      jest.spyOn(User, 'findByPk').mockResolvedValue(null);
      await expect(repo.findById('x')).resolves.toBeNull();
    });
  });

  describe('with password scope', () => {
    it('should use the withPassword scope to fetch by id and e-mail', async () => {
      const { data, instance } = buildModel();
      const scoped = {
        findByPk: jest.fn().mockResolvedValue(instance),
        findOne: jest.fn().mockResolvedValueOnce(instance).mockResolvedValueOnce(null),
      };
      const scope = jest.spyOn(User, 'scope').mockReturnValue(scoped as unknown as typeof User);

      await expect(repo.findByIdWithPassword(data.id)).resolves.toMatchObject({
        passwordHash: data.passwordHash,
      });
      await expect(repo.findByEmailWithPassword(data.email)).resolves.toMatchObject({
        id: data.id,
      });
      await expect(repo.findByEmailWithPassword('none@escola.com')).resolves.toBeNull();
      expect(scope).toHaveBeenCalledWith('withPassword');
      expect(scoped.findOne).toHaveBeenCalledWith({ where: { email: data.email } });
    });

    it('should return null when the user is not found by id', async () => {
      const scoped = { findByPk: jest.fn().mockResolvedValue(null) };
      jest.spyOn(User, 'scope').mockReturnValue(scoped as unknown as typeof User);
      await expect(repo.findByIdWithPassword('x')).resolves.toBeNull();
    });
  });

  describe('emailExists', () => {
    it('should include soft deleted rows', async () => {
      const count = jest.spyOn(User, 'count').mockResolvedValue(1);

      await expect(repo.emailExists('a@escola.com')).resolves.toBe(true);
      expect(count).toHaveBeenCalledWith({ where: { email: 'a@escola.com' }, paranoid: false });
    });

    it('should exclude the given id', async () => {
      const count = jest.spyOn(User, 'count').mockResolvedValue(0);

      await expect(repo.emailExists('a@escola.com', 'id-1')).resolves.toBe(false);
      expect(count).toHaveBeenCalledWith({
        where: { email: 'a@escola.com', id: { [Op.ne]: 'id-1' } },
        paranoid: false,
      });
    });
  });

  it('should list with limit, offset and ordering', async () => {
    const { instance } = buildModel();
    const findAndCountAll = jest
      .spyOn(User, 'findAndCountAll')
      .mockResolvedValue({ rows: [instance], count: 1 } as never);

    const result = await repo.list({ limit: 10, offset: 20 });

    expect(result.count).toBe(1);
    expect(result.rows[0]).not.toHaveProperty('passwordHash');
    expect(findAndCountAll).toHaveBeenCalledWith({
      limit: 10,
      offset: 20,
      order: [['createdAt', 'DESC']],
    });
  });

  it('should create a user', async () => {
    const { data, instance } = buildModel();
    const create = jest.spyOn(User, 'create').mockResolvedValue(instance);
    const input = {
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role,
    };

    await expect(repo.create(input)).resolves.toMatchObject({ id: data.id });
    expect(create).toHaveBeenCalledWith(input);
  });

  describe('update', () => {
    it('should set fields, increment tokenVersion and save', async () => {
      const { data, instance } = buildModel({ tokenVersion: 2 });
      jest.spyOn(User, 'findByPk').mockResolvedValue(instance);

      const result = await repo.update(data.id, { name: 'Novo', incrementTokenVersion: true });

      expect(result).toMatchObject({ name: 'Novo', tokenVersion: 3 });
      expect(instance.save).toHaveBeenCalled();
    });

    it('should not touch tokenVersion when not requested', async () => {
      const { data, instance } = buildModel({ tokenVersion: 2 });
      jest.spyOn(User, 'findByPk').mockResolvedValue(instance);
      await expect(repo.update(data.id, { name: 'Novo' })).resolves.toMatchObject({
        tokenVersion: 2,
      });
    });

    it('should return null when not found', async () => {
      jest.spyOn(User, 'findByPk').mockResolvedValue(null);
      await expect(repo.update('x', { name: 'Novo' })).resolves.toBeNull();
    });
  });

  it('should soft delete and report whether a row was affected', async () => {
    const destroy = jest.spyOn(User, 'destroy').mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(repo.softDelete('id-1')).resolves.toBe(true);
    await expect(repo.softDelete('id-2')).resolves.toBe(false);
    expect(destroy).toHaveBeenCalledWith({ where: { id: 'id-1' } });
  });
});
