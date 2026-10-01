import { createSigner } from 'fast-jwt';
import { bearer, createTestApp, loginAs, type TestContext } from '../../../helpers/app';
import { testConfig } from '../../../helpers/fakes';

function decode(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

describe('Auth routes', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  describe('POST /auth/login', () => {
    it('should return a bearer token valid for 10 minutes', async () => {
      ctx.repo.seed({ email: 'ana@escola.com', passwordHash: 'hashed:senha-super-forte' });

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ANA@escola.com', password: 'senha-super-forte' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = res.json<{ accessToken: string; tokenType: string; expiresIn: number }>();
      expect(body).toMatchObject({ tokenType: 'Bearer', expiresIn: 600 });

      const claims = decode(body.accessToken);
      expect(Number(claims.exp) - Number(claims.iat)).toBe(600);
      expect(claims).toMatchObject({ iss: testConfig.JWT_ISSUER, aud: testConfig.JWT_AUDIENCE });
      expect(res.body).not.toContain('passwordHash');
    });

    it('should return 401 with a generic message for invalid credentials', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'nobody@escola.com', password: 'whatever' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED', message: 'Credenciais inválidas' });
    });

    it('should reject unknown fields in the body', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'a@escola.com', password: 'x', role: 'admin' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('should rate limit brute force attempts', async () => {
      const attempt = () =>
        ctx.app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'nobody@escola.com', password: 'whatever' },
        });

      for (let i = 0; i < testConfig.LOGIN_RATE_LIMIT_MAX; i++) await attempt();
      const res = await attempt();

      expect(res.statusCode).toBe(429);
    });
  });

  describe('sliding token renewal', () => {
    it('should return a renewed token in X-Access-Token on each authenticated request', async () => {
      const { token } = await loginAs(ctx);

      const res = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });

      expect(res.statusCode).toBe(200);
      const renewed = res.headers['x-access-token'] as string;
      expect(renewed).toBeTruthy();
      expect(renewed).not.toBe(token);
      expect(res.headers['x-access-token-expires-in']).toBe('600');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(decode(renewed).auth_time).toBe(decode(token).auth_time);
    });

    it('should accept the renewed token on the next request', async () => {
      const { token } = await loginAs(ctx);
      const first = await ctx.app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: bearer(token),
      });

      const second = await ctx.app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: bearer(first.headers['x-access-token'] as string),
      });

      expect(second.statusCode).toBe(200);
    });
  });

  describe('token validation', () => {
    const sign = (payload: Record<string, unknown>, opts: Record<string, unknown> = {}) =>
      createSigner({
        key: testConfig.JWT_SECRET,
        iss: testConfig.JWT_ISSUER,
        aud: testConfig.JWT_AUDIENCE,
        expiresIn: 600_000,
        ...opts,
      })(payload);

    it('should reject a request without Authorization header', async () => {
      const res = await ctx.app.inject({ method: 'GET', url: '/auth/me' });
      expect(res.statusCode).toBe(401);
      expect(res.headers['x-access-token']).toBeUndefined();
    });

    it('should reject a token signed with another secret', async () => {
      const user = ctx.repo.seed();
      const token = sign(
        { sub: user.id, role: user.role, ver: 0, auth_time: Math.floor(Date.now() / 1000) },
        { key: 'another-secret-with-at-least-32-characters' },
      );
      const res = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
      expect(res.statusCode).toBe(401);
    });

    it('should reject an unsigned token (alg: none)', async () => {
      const user = ctx.repo.seed();
      const token = createSigner({ algorithm: 'none' })({
        sub: user.id,
        role: user.role,
        ver: 0,
        auth_time: Math.floor(Date.now() / 1000),
        iss: testConfig.JWT_ISSUER,
        aud: testConfig.JWT_AUDIENCE,
      });
      const res = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
      expect(res.statusCode).toBe(401);
    });

    it('should reject an expired token', async () => {
      const user = ctx.repo.seed();
      const past = Math.floor(Date.now() / 1000) - 1200;
      const token = sign(
        {
          sub: user.id,
          role: user.role,
          ver: 0,
          auth_time: past,
          iat: past,
          exp: past + 600,
        },
        { expiresIn: undefined },
      );
      const res = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
      expect(res.statusCode).toBe(401);
    });

    it('should reject a token with a different audience', async () => {
      const user = ctx.repo.seed();
      const token = sign(
        { sub: user.id, role: user.role, ver: 0, auth_time: Math.floor(Date.now() / 1000) },
        { aud: 'other-api' },
      );
      const res = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
      expect(res.statusCode).toBe(401);
    });

    it('should reject a token after the user is deactivated', async () => {
      const { token, userId } = await loginAs(ctx);
      await ctx.repo.update(userId, { active: false });
      const res = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should revoke the current and renewed tokens', async () => {
      const { token } = await loginAs(ctx);
      const me = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
      const renewed = me.headers['x-access-token'] as string;

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: bearer(renewed),
      });

      expect(res.statusCode).toBe(204);
      expect(res.headers['x-access-token']).toBeUndefined();
      for (const t of [token, renewed]) {
        const after = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(t) });
        expect(after.statusCode).toBe(401);
      }
    });
  });
});
