import { bearer, createTestApp, loginAs, type TestContext } from '../../../helpers/app';

describe('User routes', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const validUser = {
    name: 'Maria Silva',
    email: 'maria@escola.com',
    login: 'Maria.Silva',
    password: 'senha-super-forte',
    role: 'agent',
  };

  it('should require authentication on every route', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/users' });
    expect(res.statusCode).toBe(401);
  });

  describe('POST /users', () => {
    it('should create a user as admin and never return the password', async () => {
      const { token } = await loginAs(ctx, 'admin');

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/users',
        headers: bearer(token),
        payload: validUser,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        name: 'Maria Silva',
        email: 'maria@escola.com',
        login: 'maria.silva',
        role: 'agent',
      });
      expect(res.body).not.toMatch(/password|tokenVersion/i);
    });

    it('should forbid non-admin users (BFLA)', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/users',
        headers: bearer(token),
        payload: validUser,
      });
      expect(res.statusCode).toBe(403);
    });

    it('should reject mass assignment of unknown fields', async () => {
      const { token } = await loginAs(ctx, 'admin');
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/users',
        headers: bearer(token),
        payload: { ...validUser, tokenVersion: 99 },
      });
      expect(res.statusCode).toBe(400);
    });

    it.each([
      ['too short', 'ab'],
      ['with spaces', 'maria silva'],
      ['with special characters', "maria';--"],
      ['too long', 'a'.repeat(61)],
    ])('should reject an invalid login (%s)', async (_case, login) => {
      const { token } = await loginAs(ctx, 'admin');
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/users',
        headers: bearer(token),
        payload: { ...validUser, login },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<{ details: { field: string }[] }>().details[0]?.field).toBe('login');
    });

    it('should require the login', async () => {
      const { token } = await loginAs(ctx, 'admin');
      const { login: _login, ...withoutLogin } = validUser;
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/users',
        headers: bearer(token),
        payload: withoutLogin,
      });
      expect(res.statusCode).toBe(400);
    });

    it('should reject weak passwords', async () => {
      const { token } = await loginAs(ctx, 'admin');
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/users',
        headers: bearer(token),
        payload: { ...validUser, password: 'curta' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<{ details: { field: string }[] }>().details[0]?.field).toBe('password');
    });

    it('should return 409 for duplicated e-mail', async () => {
      const { token } = await loginAs(ctx, 'admin');
      ctx.repo.seed({ email: 'maria@escola.com' });
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/users',
        headers: bearer(token),
        payload: validUser,
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /users', () => {
    it('should list users with pagination for admins', async () => {
      const { token } = await loginAs(ctx, 'admin');
      ctx.repo.seed();

      const res = await ctx.app.inject({
        method: 'GET',
        url: '/users?page=1&pageSize=1',
        headers: bearer(token),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ meta: { page: 1, pageSize: 1, total: 2 } });
    });

    it('should cap pageSize at 100 (resource consumption)', async () => {
      const { token } = await loginAs(ctx, 'admin');
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/users?pageSize=1000',
        headers: bearer(token),
      });
      expect(res.statusCode).toBe(400);
    });

    it('should forbid non-admin users', async () => {
      const { token } = await loginAs(ctx, 'requester');
      const res = await ctx.app.inject({ method: 'GET', url: '/users', headers: bearer(token) });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /users/:id', () => {
    it('should return the own user', async () => {
      const { token, userId } = await loginAs(ctx);
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/users/${userId}`,
        headers: bearer(token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: userId });
    });

    it("should forbid reading another user's record (BOLA)", async () => {
      const { token } = await loginAs(ctx);
      const other = ctx.repo.seed();
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/users/${other.id}`,
        headers: bearer(token),
      });
      expect(res.statusCode).toBe(403);
    });

    it('should validate the id as UUID', async () => {
      const { token } = await loginAs(ctx, 'admin');
      const res = await ctx.app.inject({
        method: 'GET',
        url: "/users/1' OR '1'='1",
        headers: bearer(token),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /users/:id', () => {
    it('should update the own name', async () => {
      const { token, userId } = await loginAs(ctx);
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/users/${userId}`,
        headers: bearer(token),
        payload: { name: 'Nome Novo' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: 'Nome Novo' });
    });

    it('should forbid privilege escalation through role change', async () => {
      const { token, userId } = await loginAs(ctx);
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/users/${userId}`,
        headers: bearer(token),
        payload: { role: 'admin' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should reject an empty body', async () => {
      const { token, userId } = await loginAs(ctx);
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/users/${userId}`,
        headers: bearer(token),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should soft delete a user as admin', async () => {
      const { token } = await loginAs(ctx, 'admin');
      const other = ctx.repo.seed();
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/users/${other.id}`,
        headers: bearer(token),
      });
      expect(res.statusCode).toBe(204);
      expect(ctx.repo.deleted.has(other.id)).toBe(true);
    });

    it('should forbid non-admin users', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const other = ctx.repo.seed();
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/users/${other.id}`,
        headers: bearer(token),
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
