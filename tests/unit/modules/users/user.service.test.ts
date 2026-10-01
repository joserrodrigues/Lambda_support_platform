import { AppError } from '../../../../src/shared/errors';
import { UserService, toPublicUser } from '../../../../src/modules/users/user.service';
import { fakeHasher, InMemoryUserRepository } from '../../../helpers/fakes';

describe('UserService', () => {
  let repo: InMemoryUserRepository;
  let service: UserService;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    service = new UserService(repo, fakeHasher);
  });

  describe('toPublicUser', () => {
    it('should never expose passwordHash or tokenVersion', () => {
      const user = repo.seed();
      const result = toPublicUser(user);

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('tokenVersion');
    });
  });

  describe('create', () => {
    it('should create a user with the password hashed', async () => {
      const result = await service.create({
        name: 'Maria',
        email: 'maria@escola.com',
        login: 'maria.silva',
        password: 'senha-super-forte',
        role: 'agent',
      });

      expect(result).toMatchObject({
        name: 'Maria',
        email: 'maria@escola.com',
        login: 'maria.silva',
        role: 'agent',
      });
      expect(repo.users.get(result.id)?.passwordHash).toBe('hashed:senha-super-forte');
    });

    it('should throw 409 when the e-mail already exists', async () => {
      repo.seed({ email: 'maria@escola.com' });

      await expect(
        service.create({
          name: 'Maria',
          email: 'maria@escola.com',
          login: 'maria.silva',
          password: 'senha-super-forte',
          role: 'requester',
        }),
      ).rejects.toMatchObject({ statusCode: 409, message: 'E-mail já cadastrado' });
    });

    it('should throw 409 when the login already exists', async () => {
      repo.seed({ login: 'maria.silva' });

      await expect(
        service.create({
          name: 'Maria',
          email: 'maria@escola.com',
          login: 'maria.silva',
          password: 'senha-super-forte',
          role: 'requester',
        }),
      ).rejects.toMatchObject({ statusCode: 409, message: 'Login já cadastrado' });
    });
  });

  describe('list', () => {
    it('should paginate and return metadata', async () => {
      for (let i = 0; i < 5; i++) repo.seed();

      const result = await service.list({ page: 2, pageSize: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 2, pageSize: 2, total: 5 });
    });
  });

  describe('getById', () => {
    it('should allow a user to read their own record', async () => {
      const user = repo.seed();
      await expect(
        service.getById(user.id, { id: user.id, role: 'requester' }),
      ).resolves.toMatchObject({
        id: user.id,
      });
    });

    it('should forbid a non-admin from reading another user (BOLA)', async () => {
      const other = repo.seed();
      await expect(
        service.getById(other.id, { id: 'someone-else', role: 'agent' }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('should throw 404 when the user does not exist', async () => {
      await expect(
        service.getById('00000000-0000-4000-8000-000000000000', { id: 'admin', role: 'admin' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('update', () => {
    it('should let a user update their own name', async () => {
      const user = repo.seed();
      const result = await service.update(
        user.id,
        { name: 'Novo Nome' },
        { id: user.id, role: 'requester' },
      );
      expect(result.name).toBe('Novo Nome');
    });

    it.each([
      ['role', { role: 'admin' as const }],
      ['active', { active: false }],
    ])('should forbid a non-admin from changing %s (BFLA)', async (_field, body) => {
      const user = repo.seed();
      await expect(
        service.update(user.id, body, { id: user.id, role: 'requester' }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('should forbid an admin from demoting or deactivating themselves', async () => {
      const admin = repo.seed({ role: 'admin' });
      const actor = { id: admin.id, role: 'admin' as const };

      await expect(service.update(admin.id, { role: 'agent' }, actor)).rejects.toMatchObject({
        statusCode: 400,
      });
      await expect(service.update(admin.id, { active: false }, actor)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should revoke tokens when an admin deactivates a user', async () => {
      const user = repo.seed();
      await service.update(user.id, { active: false }, { id: 'admin-id', role: 'admin' });
      expect(repo.users.get(user.id)).toMatchObject({ active: false, tokenVersion: 1 });
    });

    it('should not revoke tokens when an admin reactivates a user', async () => {
      const user = repo.seed({ active: false });
      await service.update(user.id, { active: true }, { id: 'admin-id', role: 'admin' });
      expect(repo.users.get(user.id)).toMatchObject({ active: true, tokenVersion: 0 });
    });

    it('should require the current password when a user changes their own password', async () => {
      const user = repo.seed({ passwordHash: 'hashed:senha-antiga-123' });
      const actor = { id: user.id, role: 'requester' as const };

      await expect(
        service.update(user.id, { password: 'senha-nova-12345' }, actor),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        service.update(user.id, { password: 'senha-nova-12345', currentPassword: 'errada' }, actor),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should change the password and revoke tokens when current password is valid', async () => {
      const user = repo.seed({ passwordHash: 'hashed:senha-antiga-123' });

      await service.update(
        user.id,
        { password: 'senha-nova-12345', currentPassword: 'senha-antiga-123' },
        { id: user.id, role: 'requester' },
      );

      expect(repo.users.get(user.id)).toMatchObject({
        passwordHash: 'hashed:senha-nova-12345',
        tokenVersion: 1,
      });
    });

    it('should let an admin reset another user password without currentPassword', async () => {
      const user = repo.seed();
      await service.update(
        user.id,
        { password: 'senha-nova-12345' },
        { id: 'admin-id', role: 'admin' },
      );
      expect(repo.users.get(user.id)?.passwordHash).toBe('hashed:senha-nova-12345');
    });

    it('should throw 409 when changing to an e-mail used by another user', async () => {
      repo.seed({ email: 'taken@escola.com' });
      const user = repo.seed();

      await expect(
        service.update(user.id, { email: 'taken@escola.com' }, { id: user.id, role: 'requester' }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('should change the login when it is available', async () => {
      const user = repo.seed();
      await expect(
        service.update(user.id, { login: 'novo.login' }, { id: user.id, role: 'requester' }),
      ).resolves.toMatchObject({ login: 'novo.login' });
    });

    it('should throw 409 when changing to a login used by another user', async () => {
      repo.seed({ login: 'ocupado' });
      const user = repo.seed();

      await expect(
        service.update(user.id, { login: 'ocupado' }, { id: user.id, role: 'requester' }),
      ).rejects.toMatchObject({ statusCode: 409, message: 'Login já cadastrado' });
    });

    it('should accept keeping the same login', async () => {
      const user = repo.seed({ login: 'mesmo.login' });
      await expect(
        service.update(user.id, { login: 'mesmo.login' }, { id: user.id, role: 'requester' }),
      ).resolves.toMatchObject({ login: 'mesmo.login' });
    });

    it('should accept keeping the same e-mail', async () => {
      const user = repo.seed({ email: 'same@escola.com' });
      await expect(
        service.update(
          user.id,
          { email: 'same@escola.com', name: 'Outro' },
          { id: user.id, role: 'requester' },
        ),
      ).resolves.toMatchObject({ email: 'same@escola.com', name: 'Outro' });
    });

    it('should forbid updating another user as non-admin', async () => {
      const other = repo.seed();
      await expect(
        service.update(other.id, { name: 'Hacker' }, { id: 'me', role: 'agent' }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('should throw 404 when the user does not exist', async () => {
      await expect(
        service.update('missing', { name: 'Nome' }, { id: 'admin-id', role: 'admin' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('should throw 404 when the user disappears during the update', async () => {
      const user = repo.seed();
      jest.spyOn(repo, 'update').mockResolvedValueOnce(null);
      await expect(
        service.update(user.id, { name: 'Nome' }, { id: 'admin-id', role: 'admin' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('remove', () => {
    it('should soft delete a user', async () => {
      const user = repo.seed();
      await service.remove(user.id, { id: 'admin-id', role: 'admin' });
      expect(repo.deleted.has(user.id)).toBe(true);
    });

    it('should forbid deleting yourself', async () => {
      await expect(
        service.remove('admin-id', { id: 'admin-id', role: 'admin' }),
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should throw 404 when the user does not exist', async () => {
      await expect(
        service.remove('missing', { id: 'admin-id', role: 'admin' }),
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
