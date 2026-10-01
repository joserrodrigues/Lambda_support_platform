import { closeSequelize, getSequelize } from '../../../../src/database/sequelize';
import { Post } from '../../../../src/modules/tickets/post.model';
import { SequelizePostRepository } from '../../../../src/modules/tickets/post.repository';
import { User } from '../../../../src/modules/users/user.model';
import { makeUser } from '../../../helpers/factories';
import { testConfig } from '../../../helpers/fakes';

// Nenhuma conexão é aberta: os métodos estáticos do model são substituídos por mocks.
beforeAll(() => {
  getSequelize(testConfig);
});

afterAll(async () => {
  await closeSequelize();
});

const TICKET_ID = '6f1c1a52-2f0e-4a59-9a43-1f8f1f2c0a01';
const POST_ID = '0b0a7c3e-55a6-4f3a-8f0e-3f2b9a6c1d02';

const authorInclude = {
  model: User,
  as: 'author',
  attributes: ['id', 'name'],
  required: false,
  paranoid: false,
};

function buildModel({ withAuthor = true, userId = 'b5f1b2a8-6f6e-4c38-9d3c-2a7d2f1e9c03' } = {}) {
  const author = makeUser({ id: userId, name: 'Ana Agente' });
  const now = new Date('2026-01-01T00:00:00.000Z');
  const instance = Post.build(
    {
      id: POST_ID,
      ticketId: TICKET_ID,
      userId,
      content: 'Olá',
      createdAt: now,
      updatedAt: now,
    },
    { isNewRecord: false, raw: true },
  );
  if (withAuthor) {
    // Simula o resultado do include: o model do autor traz campos sensíveis que não podem vazar.
    (instance as unknown as { author: unknown }).author = User.build(author, {
      isNewRecord: false,
    });
  }
  jest.spyOn(instance, 'save').mockResolvedValue(instance);
  return { instance, author, now };
}

describe('SequelizePostRepository', () => {
  const repo = new SequelizePostRepository();

  describe('findInTicket', () => {
    it('should scope the query by ticket and include only id and name of the author', async () => {
      const { instance, author, now } = buildModel();
      const findOne = jest.spyOn(Post, 'findOne').mockResolvedValue(instance);

      const result = await repo.findInTicket(TICKET_ID, POST_ID);

      expect(findOne).toHaveBeenCalledWith({
        where: { id: POST_ID, ticketId: TICKET_ID },
        include: [authorInclude],
      });
      expect(result).toEqual({
        id: POST_ID,
        ticketId: TICKET_ID,
        userId: author.id,
        content: 'Olá',
        author: { id: author.id, name: 'Ana Agente' },
        createdAt: now,
        updatedAt: now,
      });
      expect(JSON.stringify(result)).not.toMatch(/passwordHash|email|tokenVersion|role/);
    });

    it('should map a missing author and userId to null', async () => {
      const { instance } = buildModel({ withAuthor: false });
      instance.userId = null;
      jest.spyOn(Post, 'findOne').mockResolvedValue(instance);

      const result = await repo.findInTicket(TICKET_ID, POST_ID);

      expect(result).toMatchObject({ userId: null, author: null });
    });

    it('should return null when the post is not in the ticket', async () => {
      jest.spyOn(Post, 'findOne').mockResolvedValue(null);

      await expect(repo.findInTicket(TICKET_ID, POST_ID)).resolves.toBeNull();
    });
  });

  describe('listByTicket', () => {
    it('should paginate oldest first with distinct count and author include', async () => {
      const { instance, author } = buildModel();
      const findAndCountAll = jest
        .spyOn(Post, 'findAndCountAll')
        .mockResolvedValue({ rows: [instance], count: 3 } as never);

      const result = await repo.listByTicket(TICKET_ID, { limit: 5, offset: 10 });

      expect(findAndCountAll).toHaveBeenCalledWith({
        where: { ticketId: TICKET_ID },
        include: [authorInclude],
        limit: 5,
        offset: 10,
        order: [
          ['createdAt', 'ASC'],
          ['id', 'ASC'],
        ],
        distinct: true,
      });
      expect(result.count).toBe(3);
      expect(result.rows[0]).toMatchObject({ author: { id: author.id, name: 'Ana Agente' } });
    });
  });

  describe('create', () => {
    it('should create and reload the post with the author', async () => {
      const { instance, author } = buildModel();
      const created = buildModel({ withAuthor: false }).instance;
      const create = jest.spyOn(Post, 'create').mockResolvedValue(created);
      const findOne = jest.spyOn(Post, 'findOne').mockResolvedValue(instance);
      const input = { ticketId: TICKET_ID, userId: author.id, content: 'Olá' };

      const result = await repo.create(input);

      expect(create).toHaveBeenCalledWith(input);
      expect(findOne).toHaveBeenCalledWith({
        where: { id: POST_ID, ticketId: TICKET_ID },
        include: [authorInclude],
      });
      expect(result.author).toEqual({ id: author.id, name: 'Ana Agente' });
    });

    it('should fall back to the created instance when the reload returns nothing', async () => {
      const { instance, author } = buildModel({ withAuthor: false });
      jest.spyOn(Post, 'create').mockResolvedValue(instance);
      jest.spyOn(Post, 'findOne').mockResolvedValue(null);

      const result = await repo.create({ ticketId: TICKET_ID, userId: author.id, content: 'Olá' });

      expect(result).toMatchObject({ id: POST_ID, author: null });
    });
  });

  describe('update', () => {
    it('should update only the content of a post in the ticket', async () => {
      const { instance } = buildModel();
      const findOne = jest.spyOn(Post, 'findOne').mockResolvedValue(instance);
      const set = jest.spyOn(instance, 'set');

      const result = await repo.update(TICKET_ID, POST_ID, { content: 'Editado' });

      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: POST_ID, ticketId: TICKET_ID } }),
      );
      expect(set).toHaveBeenCalledWith({ content: 'Editado' });
      expect(instance.save).toHaveBeenCalled();
      expect(result).toMatchObject({ content: 'Editado' });
    });

    it('should return null when the post is not in the ticket', async () => {
      jest.spyOn(Post, 'findOne').mockResolvedValue(null);

      await expect(repo.update(TICKET_ID, POST_ID, { content: 'x' })).resolves.toBeNull();
    });
  });

  describe('delete', () => {
    it('should scope the deletion by ticket and report whether a row was affected', async () => {
      const destroy = jest.spyOn(Post, 'destroy').mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await expect(repo.delete(TICKET_ID, POST_ID)).resolves.toBe(true);
      await expect(repo.delete(TICKET_ID, POST_ID)).resolves.toBe(false);
      expect(destroy).toHaveBeenCalledWith({ where: { id: POST_ID, ticketId: TICKET_ID } });
    });
  });
});
