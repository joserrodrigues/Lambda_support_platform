import { randomUUID } from 'node:crypto';
import {
  TICKET_DEV_STATUSES,
  TICKET_ENTRY_TYPES,
  TICKET_SLA_TYPES,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  toOptions,
} from '../../../../src/modules/tickets/ticket.constants';
import type {
  CreateTicketBody,
  ListTicketsQuery,
} from '../../../../src/modules/tickets/ticket.schemas';
import {
  TICKET_STAFF_ROLES,
  TicketService,
  toPublicPost,
  toPublicTicket,
} from '../../../../src/modules/tickets/ticket.service';
import type { AuthenticatedUser } from '../../../../src/modules/users/user.types';
import { makePost, makeTicket } from '../../../helpers/factories';
import {
  InMemoryPostRepository,
  InMemorySchoolRepository,
  InMemoryTicketRepository,
} from '../../../helpers/fakes';

const admin: AuthenticatedUser = { id: randomUUID(), role: 'admin' };
const agent: AuthenticatedUser = { id: randomUUID(), role: 'agent' };
const otherAgent: AuthenticatedUser = { id: randomUUID(), role: 'agent' };
const requester: AuthenticatedUser = { id: randomUUID(), role: 'requester' };

const PUBLIC_TICKET_KEYS = [
  'createdAt',
  'devStatus',
  'entryType',
  'errorType',
  'id',
  'priority',
  'responseAt',
  'schoolId',
  'schoolResponsible',
  'slaType',
  'status',
  'supportLevel2',
  'technicalResponseAt',
  'updatedAt',
];

function setup() {
  const tickets = new InMemoryTicketRepository();
  const posts = new InMemoryPostRepository();
  const schools = new InMemorySchoolRepository([1, 2]);
  const service = new TicketService(tickets, posts, schools);
  return { tickets, posts, schools, service };
}

const createInput = (overrides: Partial<CreateTicketBody> = {}): CreateTicketBody => ({
  schoolId: 1,
  status: 'aguardando',
  entryType: 'email',
  supportLevel2: false,
  priority: false,
  ...overrides,
});

const listQuery = (overrides: Partial<ListTicketsQuery> = {}): ListTicketsQuery => ({
  page: 1,
  pageSize: 20,
  ...overrides,
});

describe('ticket.constants', () => {
  describe('toOptions', () => {
    it('should map codes to value/label pairs preserving the order', () => {
      const result = toOptions(TICKET_STATUSES, TICKET_STATUS_LABELS);

      expect(result.map((option) => option.value)).toEqual([...TICKET_STATUSES]);
      expect(result[1]).toEqual({ value: 'em_analise', label: 'Em análise' });
    });
  });
});

describe('toPublicTicket', () => {
  it('should expose only the public ticket fields', () => {
    const ticket = { ...makeTicket(), internalNote: 'segredo' };

    const result = toPublicTicket(ticket);

    expect(Object.keys(result).sort()).toEqual(PUBLIC_TICKET_KEYS);
    expect(result).not.toHaveProperty('internalNote');
  });
});

describe('toPublicPost', () => {
  it('should expose only id and name of the author and hide userId', () => {
    const author = { id: randomUUID(), name: 'Ana', email: 'ana@escola.com' };
    const post = makePost({ userId: author.id, author });

    const result = toPublicPost(post);

    expect(result.author).toEqual({ id: author.id, name: 'Ana' });
    expect(result).not.toHaveProperty('userId');
  });

  it('should return a null author when the post has no author', () => {
    const post = makePost({ userId: null, author: null });

    expect(toPublicPost(post).author).toBeNull();
  });
});

describe('TicketService', () => {
  it('should restrict tickets to admin and agent roles', () => {
    expect(TICKET_STAFF_ROLES).toEqual(['admin', 'agent']);
  });

  describe('requester (defense in depth)', () => {
    const ticketId = randomUUID();
    const postId = randomUUID();

    it.each([
      ['getOptions', (s: TicketService) => Promise.resolve().then(() => s.getOptions(requester))],
      ['create', (s: TicketService) => s.create(createInput(), requester)],
      ['list', (s: TicketService) => s.list(listQuery(), requester)],
      ['getById', (s: TicketService) => s.getById(ticketId, requester)],
      ['update', (s: TicketService) => s.update(ticketId, { status: 'done' }, requester)],
      ['remove', (s: TicketService) => s.remove(ticketId, requester)],
      ['createPost', (s: TicketService) => s.createPost(ticketId, { content: 'x' }, requester)],
      [
        'listPosts',
        (s: TicketService) => s.listPosts(ticketId, { page: 1, pageSize: 20 }, requester),
      ],
      [
        'updatePost',
        (s: TicketService) => s.updatePost(ticketId, postId, { content: 'x' }, requester),
      ],
      ['removePost', (s: TicketService) => s.removePost(ticketId, postId, requester)],
    ])('should return 403 on %s when the actor is a requester', async (_method, call) => {
      const { service, tickets, posts, schools } = setup();
      const spies = [
        jest.spyOn(tickets, 'findById'),
        jest.spyOn(tickets, 'list'),
        jest.spyOn(tickets, 'create'),
        jest.spyOn(tickets, 'update'),
        jest.spyOn(tickets, 'delete'),
        jest.spyOn(posts, 'findInTicket'),
        jest.spyOn(posts, 'create'),
        jest.spyOn(schools, 'exists'),
      ];

      await expect(call(service)).rejects.toMatchObject({ statusCode: 403 });

      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('getOptions', () => {
    it('should return every domain list with labels', () => {
      const { service } = setup();

      const result = service.getOptions(agent);

      expect(result.status).toHaveLength(TICKET_STATUSES.length);
      expect(result.devStatus).toHaveLength(TICKET_DEV_STATUSES.length);
      expect(result.entryType).toHaveLength(TICKET_ENTRY_TYPES.length);
      expect(result.slaType).toHaveLength(TICKET_SLA_TYPES.length);
      expect(result.entryType).toContainEqual({ value: 'whatsapp', label: 'WhatsApp' });
      expect(result.slaType).toContainEqual({ value: 'critico', label: 'Crítico' });
    });
  });

  describe('create', () => {
    it('should create a ticket filling optional fields with null', async () => {
      const { service, tickets } = setup();
      const create = jest.spyOn(tickets, 'create');

      const result = await service.create(createInput(), agent);

      expect(create).toHaveBeenCalledWith({
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
      expect(result).toMatchObject({ schoolId: 1, status: 'aguardando', devStatus: null });
      expect(Object.keys(result).sort()).toEqual(PUBLIC_TICKET_KEYS);
    });

    it('should persist every field provided', async () => {
      const { service, tickets } = setup();
      const responseAt = new Date('2026-02-01T12:00:00.000Z');
      const input = createInput({
        schoolId: 2,
        status: 'em_analise',
        devStatus: 'em_teste',
        entryType: 'whatsapp',
        errorType: 'login',
        supportLevel2: true,
        priority: true,
        slaType: 'alto',
        responseAt,
        technicalResponseAt: responseAt,
        schoolResponsible: 'Diretora Ana',
      });

      const result = await service.create(input, admin);

      expect(result).toMatchObject({ ...input, id: expect.any(String) as string });
      await expect(tickets.findById(result.id)).resolves.toMatchObject(input);
    });

    it('should return 422 when the school does not exist', async () => {
      const { service, tickets } = setup();
      const create = jest.spyOn(tickets, 'create');

      await expect(service.create(createInput({ schoolId: 999 }), agent)).rejects.toMatchObject({
        statusCode: 422,
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Escola não encontrada',
      });
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should translate page/pageSize to limit/offset and return meta', async () => {
      const { service, tickets } = setup();
      for (let i = 0; i < 5; i += 1) tickets.seed();
      const list = jest.spyOn(tickets, 'list');

      const result = await service.list(listQuery({ page: 2, pageSize: 2 }), agent);

      expect(list).toHaveBeenCalledWith({ limit: 2, offset: 2, filters: {} });
      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 2, pageSize: 2, total: 5 });
    });

    it.each([
      ['schoolId', { schoolId: 2 }],
      ['status', { status: 'done' }],
      ['devStatus', { devStatus: 'concluido' }],
      ['entryType', { entryType: 'cms' }],
      ['slaType', { slaType: 'baixo' }],
      ['priority', { priority: true }],
      ['priority (false)', { priority: false }],
      ['supportLevel2', { supportLevel2: true }],
      ['supportLevel2 (false)', { supportLevel2: false }],
    ] as const)('should forward only the %s filter', async (_name, filter) => {
      const { service, tickets } = setup();
      const list = jest.spyOn(tickets, 'list');

      await service.list(listQuery(filter), agent);

      expect(list).toHaveBeenCalledWith({ limit: 20, offset: 0, filters: filter });
    });

    it('should return only the tickets matching the filters', async () => {
      const { service, tickets } = setup();
      const match = tickets.seed({ schoolId: 2, priority: true });
      tickets.seed({ schoolId: 2, priority: false });
      tickets.seed({ schoolId: 1, priority: true });

      const result = await service.list(listQuery({ schoolId: 2, priority: true }), agent);

      expect(result.data.map((ticket) => ticket.id)).toEqual([match.id]);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getById', () => {
    it('should return the public ticket', async () => {
      const { service, tickets } = setup();
      const ticket = tickets.seed({ status: 'done' });

      await expect(service.getById(ticket.id, agent)).resolves.toMatchObject({
        id: ticket.id,
        status: 'done',
      });
    });

    it('should return 404 when the ticket does not exist', async () => {
      const { service } = setup();

      await expect(service.getById(randomUUID(), agent)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Ticket não encontrado',
      });
    });
  });

  describe('update', () => {
    it('should send only the provided fields to the repository', async () => {
      const { service, tickets } = setup();
      const ticket = tickets.seed({ errorType: 'login', slaType: 'alto' });
      const update = jest.spyOn(tickets, 'update');

      const result = await service.update(ticket.id, { status: 'done', priority: true }, agent);

      expect(update).toHaveBeenCalledWith(ticket.id, { status: 'done', priority: true });
      expect(result).toMatchObject({
        status: 'done',
        priority: true,
        errorType: 'login',
        slaType: 'alto',
      });
    });

    it('should copy every updatable field when all are provided', async () => {
      const { service, tickets } = setup();
      const ticket = tickets.seed();
      const update = jest.spyOn(tickets, 'update');
      const date = new Date('2026-03-01T10:00:00.000Z');
      const input = {
        schoolId: 2,
        status: 'em_analise',
        devStatus: 'em_desenvolvimento',
        entryType: 'reuniao',
        errorType: 'performance',
        supportLevel2: true,
        priority: true,
        slaType: 'critico',
        responseAt: date,
        technicalResponseAt: date,
        schoolResponsible: 'Coordenação',
      } as const;

      await service.update(ticket.id, input, admin);

      expect(update).toHaveBeenCalledWith(ticket.id, input);
    });

    it('should clear optional fields when null is sent', async () => {
      const { service, tickets } = setup();
      const date = new Date('2026-03-01T10:00:00.000Z');
      const ticket = tickets.seed({
        devStatus: 'em_teste',
        errorType: 'login',
        slaType: 'alto',
        responseAt: date,
        technicalResponseAt: date,
        schoolResponsible: 'Ana',
      });
      const nulls = {
        devStatus: null,
        errorType: null,
        slaType: null,
        responseAt: null,
        technicalResponseAt: null,
        schoolResponsible: null,
      };

      const result = await service.update(ticket.id, nulls, agent);

      expect(result).toMatchObject(nulls);
    });

    it('should validate the school when schoolId changes', async () => {
      const { service, tickets, schools } = setup();
      const ticket = tickets.seed({ schoolId: 1 });
      const exists = jest.spyOn(schools, 'exists');

      await expect(service.update(ticket.id, { schoolId: 2 }, agent)).resolves.toMatchObject({
        schoolId: 2,
      });
      expect(exists).toHaveBeenCalledWith(2);
    });

    it('should return 422 and not update when the new school does not exist', async () => {
      const { service, tickets } = setup();
      const ticket = tickets.seed({ schoolId: 1 });
      const update = jest.spyOn(tickets, 'update');

      await expect(service.update(ticket.id, { schoolId: 999 }, agent)).rejects.toMatchObject({
        statusCode: 422,
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('should not validate the school when schoolId is unchanged', async () => {
      const { service, tickets, schools } = setup();
      const ticket = tickets.seed({ schoolId: 1 });
      const exists = jest.spyOn(schools, 'exists');

      await service.update(ticket.id, { schoolId: 1, status: 'done' }, agent);

      expect(exists).not.toHaveBeenCalled();
    });

    it('should return 404 when the ticket does not exist', async () => {
      const { service, tickets } = setup();
      const update = jest.spyOn(tickets, 'update');

      await expect(service.update(randomUUID(), { status: 'done' }, agent)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('should return 404 when the ticket disappears during the update', async () => {
      const { service, tickets } = setup();
      const ticket = tickets.seed();
      jest.spyOn(tickets, 'update').mockResolvedValueOnce(null);

      await expect(service.update(ticket.id, { status: 'done' }, agent)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Ticket não encontrado',
      });
    });
  });

  describe('remove', () => {
    it('should delete the ticket when the actor is admin', async () => {
      const { service, tickets } = setup();
      const ticket = tickets.seed();

      await service.remove(ticket.id, admin);

      await expect(tickets.findById(ticket.id)).resolves.toBeNull();
    });

    it('should return 403 for agents (BFLA)', async () => {
      const { service, tickets } = setup();
      const ticket = tickets.seed();
      const remove = jest.spyOn(tickets, 'delete');

      await expect(service.remove(ticket.id, agent)).rejects.toMatchObject({ statusCode: 403 });
      expect(remove).not.toHaveBeenCalled();
    });

    it('should return 404 when the ticket does not exist', async () => {
      const { service } = setup();

      await expect(service.remove(randomUUID(), admin)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('createPost', () => {
    it('should always use the authenticated actor as the author', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      const create = jest.spyOn(posts, 'create');

      const result = await service.createPost(ticket.id, { content: 'Olá' }, agent);

      expect(create).toHaveBeenCalledWith({
        ticketId: ticket.id,
        userId: agent.id,
        content: 'Olá',
      });
      expect(result).toMatchObject({
        ticketId: ticket.id,
        content: 'Olá',
        author: { id: agent.id },
      });
      expect(result).not.toHaveProperty('userId');
    });

    it('should return 404 when the ticket does not exist', async () => {
      const { service, posts } = setup();
      const create = jest.spyOn(posts, 'create');

      await expect(
        service.createPost(randomUUID(), { content: 'Olá' }, agent),
      ).rejects.toMatchObject({ statusCode: 404, message: 'Ticket não encontrado' });
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('listPosts', () => {
    it('should paginate the posts of the ticket', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      for (let i = 0; i < 3; i += 1) posts.seed({ ticketId: ticket.id });
      posts.seed();
      const listByTicket = jest.spyOn(posts, 'listByTicket');

      const result = await service.listPosts(ticket.id, { page: 2, pageSize: 2 }, agent);

      expect(listByTicket).toHaveBeenCalledWith(ticket.id, { limit: 2, offset: 2 });
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 2, pageSize: 2, total: 3 });
    });

    it('should return 404 when the ticket does not exist', async () => {
      const { service } = setup();

      await expect(
        service.listPosts(randomUUID(), { page: 1, pageSize: 20 }, agent),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe.each([
    [
      'updatePost',
      (s: TicketService, ticketId: string, postId: string, actor: AuthenticatedUser) =>
        s.updatePost(ticketId, postId, { content: 'Editado' }, actor),
      (posts: InMemoryPostRepository, postId: string) => {
        expect(posts.posts.get(postId)?.content).toBe('Editado');
      },
    ],
    [
      'removePost',
      (s: TicketService, ticketId: string, postId: string, actor: AuthenticatedUser) =>
        s.removePost(ticketId, postId, actor),
      (posts: InMemoryPostRepository, postId: string) => {
        expect(posts.posts.has(postId)).toBe(false);
      },
    ],
  ])('%s', (_method, call, expectApplied) => {
    it('should allow the author', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      const post = posts.seed({ ticketId: ticket.id, userId: agent.id });

      await call(service, ticket.id, post.id, agent);

      expectApplied(posts, post.id);
    });

    it('should allow an admin on a post of another user', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      const post = posts.seed({ ticketId: ticket.id, userId: agent.id });

      await call(service, ticket.id, post.id, admin);

      expectApplied(posts, post.id);
    });

    it('should return 403 when the actor is not the author (BOLA)', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      const post = posts.seed({ ticketId: ticket.id, userId: agent.id });

      await expect(call(service, ticket.id, post.id, otherAgent)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(posts.posts.get(post.id)?.content).toBe(post.content);
    });

    it('should return 403 for agents on posts without author', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      const post = posts.seed({ ticketId: ticket.id, userId: null, author: null });

      await expect(call(service, ticket.id, post.id, agent)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('should return 404 when the post belongs to another ticket', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      const post = posts.seed({ ticketId: randomUUID(), userId: agent.id });

      await expect(call(service, ticket.id, post.id, agent)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Post não encontrado',
      });
    });

    it('should return 404 when the post does not exist', async () => {
      const { service, tickets } = setup();
      const ticket = tickets.seed();

      await expect(call(service, ticket.id, randomUUID(), admin)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('updatePost', () => {
    it('should update the content and return the public post', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      const post = posts.seed({ ticketId: ticket.id, userId: agent.id });
      const update = jest.spyOn(posts, 'update');

      const result = await service.updatePost(ticket.id, post.id, { content: 'Editado' }, agent);

      expect(update).toHaveBeenCalledWith(ticket.id, post.id, { content: 'Editado' });
      expect(result).toMatchObject({ id: post.id, content: 'Editado' });
    });

    it('should return 404 when the post disappears during the update', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      const post = posts.seed({ ticketId: ticket.id, userId: agent.id });
      jest.spyOn(posts, 'update').mockResolvedValueOnce(null);

      await expect(
        service.updatePost(ticket.id, post.id, { content: 'Editado' }, agent),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('removePost', () => {
    it('should delete the post', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      const post = posts.seed({ ticketId: ticket.id, userId: agent.id });

      await service.removePost(ticket.id, post.id, agent);

      expect(posts.posts.has(post.id)).toBe(false);
    });

    it('should return 404 when the post disappears during the removal', async () => {
      const { service, tickets, posts } = setup();
      const ticket = tickets.seed();
      const post = posts.seed({ ticketId: ticket.id, userId: agent.id });
      jest.spyOn(posts, 'delete').mockResolvedValueOnce(false);

      await expect(service.removePost(ticket.id, post.id, agent)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
