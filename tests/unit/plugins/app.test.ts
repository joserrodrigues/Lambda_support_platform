import { buildApp } from '../../../src/app';
import { createTestApp, type TestContext } from '../../helpers/app';
import { testConfig } from '../../helpers/fakes';

describe('App hardening', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp({ CORS_ORIGINS: ['https://app.schoolguardian.app'] });
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it('should respond to /health', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('should send security headers', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('should allow only configured CORS origins and expose the renewed token header', async () => {
    const allowed = await ctx.app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://app.schoolguardian.app' },
    });
    const denied = await ctx.app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.schoolguardian.app');
    expect(allowed.headers['access-control-expose-headers']).toContain('x-access-token');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should return a standard 404 body for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/nao-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Rota não encontrada',
    });
  });

  it('should hide internal error details', async () => {
    jest
      .spyOn(ctx.repo, 'findByEmailWithPassword')
      .mockRejectedValueOnce(new Error('ER_ACCESS_DENIED: SELECT * FROM users'));
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'a@escola.com', password: 'x' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno do servidor',
    });
  });

  it('should reject oversized payloads', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'a@escola.com', password: 'x'.repeat(200 * 1024) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ statusCode: 413 });
  });

  it('should reject malformed JSON with 400', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('buildApp defaults', () => {
  it('should build with the default Sequelize repositories and logger without touching the database', async () => {
    const app = await buildApp({ config: testConfig });

    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(app.hasRoute({ method: 'GET', url: '/tickets' })).toBe(true);
  });
});
