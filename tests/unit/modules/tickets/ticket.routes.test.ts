import { randomUUID } from 'node:crypto';
import { bearer, createTestApp, loginAs, type TestContext } from '../../../helpers/app';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const INTERNAL_FIELDS = /passwordHash|tokenVersion|"userId"|"email":|"role":|"login":/;

describe('Ticket routes', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const validTicket = { schoolId: 1, entryType: 'email' };

  async function request(
    token: string,
    method: Method,
    url: string,
    payload?: Record<string, unknown>,
  ) {
    return ctx.app.inject({ method, url, headers: bearer(token), ...(payload ? { payload } : {}) });
  }

  const ticketId = randomUUID();
  const postId = randomUUID();
  // Sempre 3 elementos: com 2, o Jest trataria o 3º parâmetro da função como `done`.
  const everyRoute: [Method, string, Record<string, unknown> | undefined][] = [
    ['GET', '/tickets/options', undefined],
    ['POST', '/tickets', validTicket],
    ['GET', '/tickets', undefined],
    ['GET', `/tickets/${ticketId}`, undefined],
    ['PATCH', `/tickets/${ticketId}`, { status: 'done' }],
    ['DELETE', `/tickets/${ticketId}`, undefined],
    ['POST', `/tickets/${ticketId}/posts`, { content: 'Olá' }],
    ['GET', `/tickets/${ticketId}/posts`, undefined],
    ['PATCH', `/tickets/${ticketId}/posts/${postId}`, { content: 'Olá' }],
    ['DELETE', `/tickets/${ticketId}/posts/${postId}`, undefined],
  ];

  describe('authentication and authorization', () => {
    it.each(everyRoute)('should return 401 on %s %s without a token', async (method, url, body) => {
      const res = await ctx.app.inject({ method, url, ...(body ? { payload: body } : {}) });

      expect(res.statusCode).toBe(401);
      expect(res.headers['x-access-token']).toBeUndefined();
    });

    it('should return 401 with an invalid signature', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const [header, payload] = token.split('.');

      const res = await request(`${header}.${payload}.assinatura-invalida`, 'GET', '/tickets');

      expect(res.statusCode).toBe(401);
    });

    it.each(everyRoute)(
      'should return 403 on %s %s for requesters (BFLA)',
      async (method, url, body) => {
        const { token } = await loginAs(ctx, 'requester');
        ctx.tickets.seed({ id: ticketId });

        const res = await request(token, method, url, body);

        expect(res.statusCode).toBe(403);
        expect(res.json()).toMatchObject({ code: 'FORBIDDEN' });
      },
    );

    it.each([
      ['POST', '/tickets', { hacker: true }],
      ['PATCH', '/tickets/nao-e-uuid', {}],
      ['GET', '/tickets?pageSize=999999', undefined],
      ['POST', `/tickets/${ticketId}/posts`, { content: '' }],
    ] as [Method, string, Record<string, unknown> | undefined][])(
      'should return 403 (not 400) on %s %s for requesters with an invalid input',
      async (method, url, body) => {
        const { token } = await loginAs(ctx, 'requester');

        const res = await request(token, method, url, body);

        expect(res.statusCode).toBe(403);
        expect(res.body).not.toMatch(/VALIDATION_ERROR|details/);
      },
    );

    it('should return 403 when an agent deletes a ticket (BFLA)', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'DELETE', `/tickets/${ticket.id}`);

      expect(res.statusCode).toBe(403);
      expect(ctx.tickets.tickets.has(ticket.id)).toBe(true);
    });

    it('should return 401 after logout (revoked token)', async () => {
      const { token } = await loginAs(ctx, 'agent');
      await request(token, 'POST', '/auth/logout');

      const res = await request(token, 'GET', '/tickets');

      expect(res.statusCode).toBe(401);
    });

    it('should return 401 when the agent was deactivated', async () => {
      const { token, userId } = await loginAs(ctx, 'agent');
      await ctx.repo.update(userId, { active: false });

      const res = await request(token, 'GET', '/tickets');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('sliding token renewal', () => {
    it('should return X-Access-Token on every authenticated ticket response', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const responses = await Promise.all([
        request(token, 'GET', '/tickets/options'),
        request(token, 'GET', '/tickets'),
        request(token, 'GET', `/tickets/${ticket.id}`),
        request(token, 'GET', `/tickets/${randomUUID()}`),
      ]);

      for (const res of responses) {
        expect(res.headers['x-access-token']).toEqual(expect.any(String));
        expect(res.headers['cache-control']).toBe('no-store');
      }
    });

    it('should accept the renewed token', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const first = await request(token, 'GET', '/tickets');
      const renewed = first.headers['x-access-token'] as string;

      const res = await request(renewed, 'GET', '/tickets');

      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /tickets/options', () => {
    it('should return the domain options', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'GET', '/tickets/options');

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: expect.arrayContaining([{ value: 'aguardando', label: 'Aguardando' }]) as unknown,
        devStatus: expect.any(Array) as unknown,
        entryType: expect.any(Array) as unknown,
        slaType: expect.any(Array) as unknown,
      });
    });

    it('should reject unknown query parameters', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'GET', '/tickets/options?x=1');

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /tickets', () => {
    it.each(['agent', 'admin'] as const)(
      'should create a ticket with defaults as %s',
      async (role) => {
        const { token } = await loginAs(ctx, role);

        const res = await request(token, 'POST', '/tickets', validTicket);

        expect(res.statusCode).toBe(201);
        expect(res.json()).toMatchObject({
          id: expect.any(String) as string,
          schoolId: 1,
          status: 'aguardando',
          devStatus: null,
          entryType: 'email',
          errorType: null,
          supportLevel2: false,
          priority: false,
          slaType: null,
          responseAt: null,
          technicalResponseAt: null,
          schoolResponsible: null,
        });
        expect(ctx.tickets.tickets.size).toBe(1);
      },
    );

    it('should convert dates with offset to UTC', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'POST', '/tickets', {
        ...validTicket,
        responseAt: '2026-03-10T09:30:00-03:00',
        technicalResponseAt: '2026-03-10T12:00:00Z',
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        responseAt: '2026-03-10T12:30:00.000Z',
        technicalResponseAt: '2026-03-10T12:00:00.000Z',
      });
    });

    it.each(['2026-03-10T09:30:00', '2026-03-10', '10/03/2026', 'amanhã'])(
      'should reject the date %s without timezone or in an invalid format',
      async (responseAt) => {
        const { token } = await loginAs(ctx, 'agent');

        const res = await request(token, 'POST', '/tickets', { ...validTicket, responseAt });

        expect(res.statusCode).toBe(400);
      },
    );

    it('should trim schoolResponsible and errorType', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'POST', '/tickets', {
        ...validTicket,
        schoolResponsible: '  Diretora Ana  ',
        errorType: ' login ',
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ schoolResponsible: 'Diretora Ana', errorType: 'login' });
    });

    it.each([
      ['blank schoolResponsible', { schoolResponsible: '   ' }],
      ['schoolResponsible above 120 chars', { schoolResponsible: 'a'.repeat(121) }],
      ['errorType above 50 chars', { errorType: 'a'.repeat(51) }],
    ])('should reject %s', async (_case, extra) => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'POST', '/tickets', { ...validTicket, ...extra });

      expect(res.statusCode).toBe(400);
    });

    it('should accept the limits of schoolResponsible and errorType', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'POST', '/tickets', {
        ...validTicket,
        schoolResponsible: 'a'.repeat(120),
        errorType: 'b'.repeat(50),
      });

      expect(res.statusCode).toBe(201);
    });

    it.each(['id', 'userId', 'createdAt', 'updatedAt'])(
      'should reject mass assignment of %s',
      async (field) => {
        const { token } = await loginAs(ctx, 'agent');

        const res = await request(token, 'POST', '/tickets', {
          ...validTicket,
          [field]:
            field === 'createdAt' || field === 'updatedAt' ? '2020-01-01T00:00:00Z' : randomUUID(),
        });

        expect(res.statusCode).toBe(400);
        expect(ctx.tickets.tickets.size).toBe(0);
      },
    );

    it.each([
      ['status', { status: 'fechado' }],
      ['devStatus', { devStatus: 'pronto' }],
      ['entryType', { entryType: 'telefone' }],
      ['slaType', { slaType: 'urgente' }],
    ])('should reject an invalid %s', async (field, extra) => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'POST', '/tickets', { ...validTicket, ...extra });

      expect(res.statusCode).toBe(400);
      expect(res.json<{ details: { field: string }[] }>().details[0]?.field).toBe(field);
    });

    it.each([
      ['zero', 0],
      ['negative', -1],
      ['decimal', 1.5],
      ['above INT UNSIGNED', 4_294_967_296],
      ['string', '1'],
    ])('should reject a %s schoolId', async (_case, schoolId) => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'POST', '/tickets', { ...validTicket, schoolId });

      expect(res.statusCode).toBe(400);
    });

    it('should require schoolId and entryType', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'POST', '/tickets', {});

      expect(res.statusCode).toBe(400);
      const fields = res.json<{ details: { field: string }[] }>().details.map((d) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['schoolId', 'entryType']));
    });

    it('should return 422 when the school does not exist', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'POST', '/tickets', { ...validTicket, schoolId: 999 });

      expect(res.statusCode).toBe(422);
      expect(res.json()).toEqual({
        statusCode: 422,
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Escola não encontrada',
      });
    });

    it('should return 413 when the payload exceeds the body limit', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'POST', '/tickets', {
        ...validTicket,
        errorType: 'a'.repeat(110 * 1024),
      });

      expect(res.statusCode).toBe(413);
    });

    it('should not leak internal details on unexpected errors', async () => {
      const { token } = await loginAs(ctx, 'agent');
      jest
        .spyOn(ctx.tickets, 'create')
        .mockRejectedValueOnce(new Error('ER_NO_REFERENCED_ROW: INSERT INTO tickets'));

      const res = await request(token, 'POST', '/tickets', validTicket);

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro interno do servidor',
      });
      expect(res.body).not.toMatch(/INSERT|ER_NO_REFERENCED_ROW|stack/);
    });
  });

  describe('GET /tickets', () => {
    it('should list tickets with pagination', async () => {
      const { token } = await loginAs(ctx, 'agent');
      for (let i = 0; i < 3; i += 1) ctx.tickets.seed();

      const res = await request(token, 'GET', '/tickets?page=2&pageSize=2');

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ meta: { page: 2, pageSize: 2, total: 3 } });
      expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
    });

    it('should use default pagination', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'GET', '/tickets');

      expect(res.json()).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    });

    it('should accept pageSize=100', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'GET', '/tickets?pageSize=100');

      expect(res.statusCode).toBe(200);
    });

    it.each([
      'pageSize=101',
      'pageSize=0',
      'page=0',
      'page=10001',
      'page=abc',
      'schoolId=0',
      'schoolId=abc',
      'status=fechado',
      'devStatus=pronto',
      'entryType=telefone',
      'slaType=urgente',
      'foo=bar',
    ])('should reject the query %s', async (query) => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'GET', `/tickets?${query}`);

      expect(res.statusCode).toBe(400);
    });

    it.each([
      ['priority', 'true', true],
      ['priority', 'false', false],
      ['supportLevel2', 'true', true],
      ['supportLevel2', 'false', false],
    ] as const)('should filter by %s=%s', async (field, raw, value) => {
      const { token } = await loginAs(ctx, 'agent');
      const match = ctx.tickets.seed({ [field]: value });
      ctx.tickets.seed({ [field]: !value });

      const res = await request(token, 'GET', `/tickets?${field}=${raw}`);

      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: { id: string }[] }>().data.map((t) => t.id)).toEqual([match.id]);
    });

    it.each(['1', '0', 'yes', 'TRUE', ''])(
      'should reject the boolean filter value "%s"',
      async (raw) => {
        const { token } = await loginAs(ctx, 'agent');

        const res = await request(token, 'GET', `/tickets?priority=${raw}`);

        expect(res.statusCode).toBe(400);
      },
    );

    it('should combine schoolId, status and enum filters', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const match = ctx.tickets.seed({
        schoolId: 7,
        status: 'done',
        devStatus: 'concluido',
        entryType: 'cms',
        slaType: 'baixo',
      });
      ctx.tickets.seed({ schoolId: 7, status: 'aguardando' });
      ctx.tickets.seed({ schoolId: 8, status: 'done' });

      const res = await request(
        token,
        'GET',
        '/tickets?schoolId=7&status=done&devStatus=concluido&entryType=cms&slaType=baixo',
      );

      expect(res.json<{ data: { id: string }[] }>().data.map((t) => t.id)).toEqual([match.id]);
    });
  });

  describe('GET /tickets/:id', () => {
    it('should return the ticket without internal fields', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed({ status: 'em_analise' });
      Object.assign(ctx.tickets.tickets.get(ticket.id)!, { passwordHash: 'x', tokenVersion: 3 });

      const res = await request(token, 'GET', `/tickets/${ticket.id}`);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: ticket.id, status: 'em_analise' });
      expect(res.body).not.toMatch(INTERNAL_FIELDS);
    });

    it('should return 404 for unknown tickets', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'GET', `/tickets/${randomUUID()}`);

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ message: 'Ticket não encontrado' });
    });

    it('should return 400 for a non-uuid id', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'GET', '/tickets/123');

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /tickets/:id', () => {
    it('should update only the provided fields', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed({ errorType: 'login', slaType: 'alto' });

      const res = await request(token, 'PATCH', `/tickets/${ticket.id}`, {
        status: 'done',
        supportLevel2: true,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: 'done',
        supportLevel2: true,
        errorType: 'login',
        slaType: 'alto',
      });
    });

    it('should clear optional fields with null', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed({
        errorType: 'login',
        responseAt: new Date('2026-01-02T00:00:00Z'),
      });

      const res = await request(token, 'PATCH', `/tickets/${ticket.id}`, {
        errorType: null,
        responseAt: null,
      });

      expect(res.json()).toMatchObject({ errorType: null, responseAt: null });
    });

    it.each([
      ['status', { status: null }],
      ['entryType', { entryType: null }],
      ['schoolId', { schoolId: null }],
      ['priority', { priority: null }],
    ])('should reject null for the required field %s', async (_field, body) => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'PATCH', `/tickets/${ticket.id}`, body);

      expect(res.statusCode).toBe(400);
    });

    it('should convert dates with offset to UTC', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'PATCH', `/tickets/${ticket.id}`, {
        technicalResponseAt: '2026-05-01T23:00:00+02:00',
      });

      expect(res.json()).toMatchObject({ technicalResponseAt: '2026-05-01T21:00:00.000Z' });
    });

    it('should return 400 for an empty body', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'PATCH', `/tickets/${ticket.id}`, {});

      expect(res.statusCode).toBe(400);
    });

    it.each(['id', 'userId', 'createdAt'])('should reject mass assignment of %s', async (field) => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'PATCH', `/tickets/${ticket.id}`, {
        status: 'done',
        [field]: field === 'createdAt' ? '2020-01-01T00:00:00Z' : randomUUID(),
      });

      expect(res.statusCode).toBe(400);
      expect(ctx.tickets.tickets.get(ticket.id)?.status).toBe('aguardando');
    });

    it('should return 422 when changing to an unknown school', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'PATCH', `/tickets/${ticket.id}`, { schoolId: 999 });

      expect(res.statusCode).toBe(422);
    });

    it('should return 404 for unknown tickets', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'PATCH', `/tickets/${randomUUID()}`, { status: 'done' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /tickets/:id', () => {
    it('should delete the ticket and its posts as admin', async () => {
      const { token } = await loginAs(ctx, 'admin');
      const ticket = ctx.tickets.seed();
      ctx.posts.seed({ ticketId: ticket.id });

      const res = await request(token, 'DELETE', `/tickets/${ticket.id}`);

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
      expect(ctx.tickets.tickets.size).toBe(0);
      expect(ctx.posts.posts.size).toBe(0);
    });

    it('should return 404 for unknown tickets', async () => {
      const { token } = await loginAs(ctx, 'admin');

      const res = await request(token, 'DELETE', `/tickets/${randomUUID()}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('posts', () => {
    it('should create a post authored by the authenticated user', async () => {
      const { token, userId } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'POST', `/tickets/${ticket.id}/posts`, {
        content: '  Primeiro contato  ',
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        ticketId: ticket.id,
        content: 'Primeiro contato',
        author: { id: userId, name: expect.any(String) as string },
      });
      expect(Object.keys(res.json<Record<string, unknown>>().author as object).sort()).toEqual([
        'id',
        'name',
      ]);
      expect(res.body).not.toMatch(INTERNAL_FIELDS);
    });

    it.each(['userId', 'author', 'ticketId', 'id'])(
      'should reject mass assignment of %s in a post',
      async (field) => {
        const { token } = await loginAs(ctx, 'agent');
        const ticket = ctx.tickets.seed();

        const res = await request(token, 'POST', `/tickets/${ticket.id}/posts`, {
          content: 'Olá',
          [field]: randomUUID(),
        });

        expect(res.statusCode).toBe(400);
        expect(ctx.posts.posts.size).toBe(0);
      },
    );

    it.each([
      ['empty', ''],
      ['blank', '   '],
      ['above 10000 chars', 'a'.repeat(10_001)],
    ])('should reject %s content', async (_case, content) => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'POST', `/tickets/${ticket.id}/posts`, { content });

      expect(res.statusCode).toBe(400);
    });

    it('should accept content with exactly 10000 chars', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'POST', `/tickets/${ticket.id}/posts`, {
        content: 'a'.repeat(10_000),
      });

      expect(res.statusCode).toBe(201);
    });

    it('should return 404 when creating a post on an unknown ticket', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'POST', `/tickets/${randomUUID()}/posts`, {
        content: 'Olá',
      });

      expect(res.statusCode).toBe(404);
    });

    it('should list only the posts of the ticket, oldest first', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();
      const newer = ctx.posts.seed({ ticketId: ticket.id, createdAt: new Date('2026-01-03') });
      const older = ctx.posts.seed({ ticketId: ticket.id, createdAt: new Date('2026-01-02') });
      ctx.posts.seed();

      const res = await request(token, 'GET', `/tickets/${ticket.id}/posts`);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ meta: { page: 1, pageSize: 20, total: 2 } });
      expect(res.json<{ data: { id: string }[] }>().data.map((p) => p.id)).toEqual([
        older.id,
        newer.id,
      ]);
      expect(res.body).not.toMatch(INTERNAL_FIELDS);
    });

    it('should cap the posts pageSize at 100', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'GET', `/tickets/${ticket.id}/posts?pageSize=101`);

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 when listing posts of an unknown ticket', async () => {
      const { token } = await loginAs(ctx, 'agent');

      const res = await request(token, 'GET', `/tickets/${randomUUID()}/posts`);

      expect(res.statusCode).toBe(404);
    });

    it('should let the author edit the post', async () => {
      const { token, userId } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();
      const post = ctx.posts.seed({ ticketId: ticket.id, userId });

      const res = await request(token, 'PATCH', `/tickets/${ticket.id}/posts/${post.id}`, {
        content: 'Editado',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: post.id, content: 'Editado' });
    });

    it('should forbid another agent from editing the post (BOLA)', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();
      const post = ctx.posts.seed({ ticketId: ticket.id, userId: randomUUID() });

      const res = await request(token, 'PATCH', `/tickets/${ticket.id}/posts/${post.id}`, {
        content: 'Editado',
      });

      expect(res.statusCode).toBe(403);
      expect(ctx.posts.posts.get(post.id)?.content).toBe(post.content);
    });

    it('should forbid another agent from deleting the post (BOLA)', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();
      const post = ctx.posts.seed({ ticketId: ticket.id, userId: randomUUID() });

      const res = await request(token, 'DELETE', `/tickets/${ticket.id}/posts/${post.id}`);

      expect(res.statusCode).toBe(403);
      expect(ctx.posts.posts.has(post.id)).toBe(true);
    });

    it('should let an admin edit and delete posts of other users', async () => {
      const { token } = await loginAs(ctx, 'admin');
      const ticket = ctx.tickets.seed();
      const post = ctx.posts.seed({ ticketId: ticket.id, userId: randomUUID() });

      const patch = await request(token, 'PATCH', `/tickets/${ticket.id}/posts/${post.id}`, {
        content: 'Moderado',
      });
      const del = await request(token, 'DELETE', `/tickets/${ticket.id}/posts/${post.id}`);

      expect(patch.statusCode).toBe(200);
      expect(del.statusCode).toBe(204);
      expect(ctx.posts.posts.has(post.id)).toBe(false);
    });

    it.each(['PATCH', 'DELETE'] as const)(
      'should return 404 on %s when the post belongs to another ticket (BOLA)',
      async (method) => {
        const { token, userId } = await loginAs(ctx, 'agent');
        const ticket = ctx.tickets.seed();
        const otherTicket = ctx.tickets.seed();
        const post = ctx.posts.seed({ ticketId: otherTicket.id, userId });

        const res = await request(
          token,
          method,
          `/tickets/${ticket.id}/posts/${post.id}`,
          method === 'PATCH' ? { content: 'Editado' } : undefined,
        );

        expect(res.statusCode).toBe(404);
        expect(ctx.posts.posts.get(post.id)?.content).toBe(post.content);
      },
    );

    it('should return 400 for a non-uuid postId', async () => {
      const { token } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();

      const res = await request(token, 'DELETE', `/tickets/${ticket.id}/posts/1`);

      expect(res.statusCode).toBe(400);
    });

    it('should reject mass assignment when editing a post', async () => {
      const { token, userId } = await loginAs(ctx, 'agent');
      const ticket = ctx.tickets.seed();
      const post = ctx.posts.seed({ ticketId: ticket.id, userId });

      const res = await request(token, 'PATCH', `/tickets/${ticket.id}/posts/${post.id}`, {
        content: 'Editado',
        userId: randomUUID(),
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
