import { createApiHash, canonicalJson } from '../../../../src/shared/api-auth';
import { InboundService } from '../../../../src/modules/inbound/inbound.service';
import {
  InMemoryPostRepository,
  InMemorySchoolRepository,
  InMemoryTicketRepository,
} from '../../../helpers/fakes';

const SECRET = 'pre-%Y%-%m%-%d%-%H%-%i%-%s%-suf';

function utcNow(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function service(secret = SECRET) {
  const tickets = new InMemoryTicketRepository();
  const posts = new InMemoryPostRepository();
  const schools = new InMemorySchoolRepository([7]);
  return {
    tickets,
    posts,
    inbound: new InboundService(tickets, posts, schools, () => Promise.resolve(secret)),
  };
}

describe('canonical API auth', () => {
  it('should match the FSFAPI license vector', () => {
    const secret = 'chave-teste-%Y%-%m%';
    const date = '20261002123045';
    const body = {
      date,
      environment: 'model_1',
      fingerprint: 'a'.repeat(64),
    };
    expect(canonicalJson(body)).toBe(
      '{"date":"20261002123045","environment":"model_1","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
    );
    expect(createApiHash(secret, date, body)).toBe(
      '9e5240bebd17d79ca077d2726fda63cbc425bacd94e74b0335eb547563891853',
    );
  });
});

describe('InboundService', () => {
  it('should open a card and keep the message as the first post', async () => {
    const date = utcNow();
    const body: Record<string, unknown> = {
      date,
      schoolId: 7,
      entryType: 'whatsapp',
      content: '<p>A catraca parou.</p>',
      schoolResponsible: 'Maria',
      priority: true,
    };
    body.hash = createApiHash(SECRET, date, body);
    const { inbound, tickets, posts } = service();

    const created = await inbound.receive(body);

    expect(created.schoolId).toBe(7);
    expect(created.entryType).toBe('whatsapp');
    expect(created.priority).toBe(true);
    expect(created.schoolResponsible).toBe('Maria');
    expect(tickets.tickets.size).toBe(1);
    const post = [...posts.posts.values()][0];
    expect(post?.userId).toBeNull();
    expect(post?.content).toContain('catraca');
    expect(post?.isInternal).toBe(false);
  });

  it('should reject a body that changed after the hash', async () => {
    const date = utcNow();
    const body: Record<string, unknown> = {
      date,
      schoolId: 7,
      entryType: 'email',
      content: 'texto',
    };
    body.hash = createApiHash(SECRET, date, body);
    body.content = 'outro texto';
    const { inbound } = service();
    await expect(inbound.receive(body)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('should refuse the call when the secret is missing', async () => {
    const { inbound } = service('');
    await expect(inbound.receive({ date: utcNow() })).rejects.toMatchObject({ statusCode: 503 });
  });

  it('should return a page of cards with the opening text and the unseen flag', async () => {
    const date = utcNow();
    const { inbound, tickets, posts } = service();
    const ticket = await tickets.create({
      schoolId: 7,
      title: null,
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
      schoolUserId: null,
      schoolUserName: null,
    });
    await posts.create({
      ticketId: ticket.id,
      userId: null,
      content: '<p>Primeira mensagem</p>',
      isInternal: false,
    });
    const body: Record<string, unknown> = { date, page: 1, pageSize: 100, schoolId: 7 };
    body.hash = createApiHash(SECRET, date, body);

    const result = await inbound.search(body);

    expect(result.meta).toEqual({ page: 1, pageSize: 100, total: 1 });
    expect(result.data[0]?.unseen).toBe(true);
    expect(result.data[0]?.viewedAt).toBeNull();
    expect(result.data[0]?.firstContent).toContain('Primeira mensagem');
  });

  it('should return the improved text without saving a post', async () => {
    const date = utcNow();
    const improveText = jest.fn(async (text: string) => ({ text: `${text} melhorado` }));
    const { inbound, tickets, posts } = service();
    const withImprove = new InboundService(tickets, posts, new InMemorySchoolRepository([7]), () => Promise.resolve(SECRET), improveText);
    const body: Record<string, unknown> = { date, text: '<p>a catraca parou</p>', ticketId: 'card-1' };
    body.hash = createApiHash(SECRET, date, body);

    await expect(withImprove.improve(body)).resolves.toEqual({ text: '<p>a catraca parou</p> melhorado' });
    expect(improveText).toHaveBeenCalledWith('<p>a catraca parou</p>', undefined);
    expect(tickets.tickets.size).toBe(0);
    expect(posts.posts.size).toBe(0);
  });
});
