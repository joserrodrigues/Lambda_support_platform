import { bearer, createTestApp, type TestContext } from '../../helpers/app';

describe('Database routing', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it('should treat an unknown host as the test database', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/schools',
      headers: { host: 'evil.example' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('should reject hom when HOM_DB_* is missing', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/schools',
      headers: { host: 'suporte-t.schoolguardian.app' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('should keep localhost on the current database even if Origin is prod', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/schools',
      headers: { host: 'localhost:3000', origin: 'https://suporte.schoolguardian.app' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('should refuse a token issued on another environment', async () => {
    const prod = await createTestApp({
      PROD_DB_HOST: 'prod.internal',
      PROD_DB_NAME: 'BaseEscolas',
      PROD_DB_USER: 'app',
      PROD_DB_PASSWORD: 'secret',
      PROD_DB_SSL: false,
    });
    const password = 'senha-super-forte';
    const user = prod.repo.seed({ role: 'agent', passwordHash: `hashed:${password}` });
    const login = await prod.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { host: 'suporte.schoolguardian.app' },
      payload: { email: user.email, password },
    });
    const token = login.json<{ accessToken: string }>().accessToken;

    const sameEnv = await prod.app.inject({
      method: 'GET',
      url: '/schools',
      headers: { host: 'suporte.schoolguardian.app', ...bearer(token) },
    });
    const otherEnv = await prod.app.inject({
      method: 'GET',
      url: '/schools',
      headers: { host: 'localhost:3000', ...bearer(token) },
    });

    expect(login.statusCode).toBe(200);
    expect(sameEnv.statusCode).toBe(200);
    expect(otherEnv.statusCode).toBe(401);
    await prod.app.close();
  });
});
