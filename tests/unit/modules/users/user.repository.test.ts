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

      expect(result).toMatchObject({ id: data.id, email: data.email, login: data.email });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should return null when not found', async () => {
      jest.spyOn(User, 'findByPk').mockResolvedValue(null);
      await expect(repo.findById(999)).resolves.toBeNull();
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
      await expect(repo.findByIdWithPassword(999)).resolves.toBeNull();
    });
  });

  describe('emailExists', () => {
    it('should count rows with the same e-mail', async () => {
      const count = jest.spyOn(User, 'count').mockResolvedValue(1);

      await expect(repo.emailExists('a@escola.com')).resolves.toBe(true);
      expect(count).toHaveBeenCalledWith({ where: { email: 'a@escola.com' } });
    });

    it('should exclude the given id', async () => {
      const count = jest.spyOn(User, 'count').mockResolvedValue(0);

      await expect(repo.emailExists('a@escola.com', 8)).resolves.toBe(false);
      expect(count).toHaveBeenCalledWith({
        where: { email: 'a@escola.com', id: { [Op.ne]: 8 } },
      });
    });
  });

  describe('loginExists', () => {
    it('should not query a login column that does not exist on fsfadm_Usuarios', async () => {
      const count = jest.spyOn(User, 'count');

      await expect(repo.loginExists('maria.silva')).resolves.toBe(false);
      await expect(repo.loginExists('maria.silva', 8)).resolves.toBe(false);
      expect(count).not.toHaveBeenCalled();
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

  it('should refuse to insert into the shared user table', async () => {
    const create = jest.spyOn(User, 'create');
    const { data } = buildModel();

    await expect(
      repo.create({
        name: data.name,
        email: data.email,
        login: data.login,
        passwordHash: data.passwordHash,
        role: data.role,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(create).not.toHaveBeenCalled();
  });

  describe('update', () => {
    it('should refuse to change columns of the shared user table', async () => {
      const { data, instance } = buildModel();
      const findByPk = jest.spyOn(User, 'findByPk');

      await expect(repo.update(data.id, { name: 'Novo', incrementTokenVersion: true })).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(findByPk).not.toHaveBeenCalled();
      expect(instance.save).not.toHaveBeenCalled();
    });

    it('should not persist lastLoginAt', async () => {
      const { data, instance } = buildModel();
      jest.spyOn(User, 'findByPk').mockResolvedValue(instance);

      await expect(repo.update(data.id, { lastLoginAt: new Date() })).resolves.toMatchObject({
        id: data.id,
      });
      expect(instance.save).not.toHaveBeenCalled();
    });

    it('should return null when the user does not exist', async () => {
      jest.spyOn(User, 'findByPk').mockResolvedValue(null);
      await expect(repo.update(999, { incrementTokenVersion: true })).resolves.toBeNull();
    });
  });

  it('should refuse to delete a shared user', async () => {
    const destroy = jest.spyOn(User, 'destroy');

    await expect(repo.softDelete(1)).rejects.toMatchObject({ statusCode: 403 });
    expect(destroy).not.toHaveBeenCalled();
  });
});
