import { bearer, createTestApp, loginAs, type TestContext } from '../../../helpers/app';

describe('School routes', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.schools.schools.set(1, 'Escola Alfa');
    ctx.schools.schools.set(2, 'Escola Beta');
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it('should return only id and name for an agent', async () => {
    const { token } = await loginAs(ctx, 'agent');

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/schools?page=1&pageSize=10',
      headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: [
        { id: 1, name: 'Escola Alfa' },
        { id: 2, name: 'Escola Beta' },
      ],
      meta: { page: 1, pageSize: 10, total: 2 },
    });
  });

  it('should filter by name', async () => {
    const { token } = await loginAs(ctx, 'admin');

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/schools?name=beta',
      headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { id: number; name: string }[] }>().data).toEqual([
      { id: 2, name: 'Escola Beta' },
    ]);
  });

  it('should reject a requester', async () => {
    const { token } = await loginAs(ctx, 'requester');

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/schools',
      headers: bearer(token),
    });

    expect(res.statusCode).toBe(403);
  });

  it('should reject a missing token', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/schools' });

    expect(res.statusCode).toBe(401);
  });
});