import { closeSequelize, getSequelize } from '../../../../src/database/sequelize';
import { Ticket } from '../../../../src/modules/tickets/ticket.model';
import { SequelizeTicketRepository } from '../../../../src/modules/tickets/ticket.repository';
import type { TicketEntity } from '../../../../src/modules/tickets/ticket.types';
import { makeTicket } from '../../../helpers/factories';
import { testConfig } from '../../../helpers/fakes';

// Nenhuma conexão é aberta: os métodos estáticos do model são substituídos por mocks.
beforeAll(() => {
  getSequelize(testConfig);
});

afterAll(async () => {
  await closeSequelize();
});

function buildModel(overrides: Partial<TicketEntity> = {}) {
  const { supportLevel2, ...data } = makeTicket(overrides);
  const instance = Ticket.build(
    { ...data, supportLevel2: supportLevel2 ? 1 : 0 },
    { isNewRecord: false, raw: true },
  );
  jest.spyOn(instance, 'save').mockResolvedValue(instance);
  return { data: { ...data, supportLevel2 }, instance };
}

describe('SequelizeTicketRepository', () => {
  const repo = new SequelizeTicketRepository();

  describe('findById', () => {
    it('should map the model to a plain entity converting TINYINT to boolean', async () => {
      const { data, instance } = buildModel({ supportLevel2: true, priority: true });
      const findByPk = jest.spyOn(Ticket, 'findByPk').mockResolvedValue(instance);

      const result = await repo.findById(data.id);

      expect(findByPk).toHaveBeenCalledWith(data.id);
      expect(result).toEqual(data);
      expect(result).not.toBeInstanceOf(Ticket);
    });

    it('should normalize undefined optional columns to null', async () => {
      const instance = Ticket.build({ id: 'id-1', schoolId: 1, entryType: 'email' } as never, {
        isNewRecord: false,
        raw: true,
      });
      jest.spyOn(Ticket, 'findByPk').mockResolvedValue(instance);

      const result = await repo.findById('id-1');

      expect(result).toMatchObject({
        devStatus: null,
        errorType: null,
        slaType: null,
        responseAt: null,
        technicalResponseAt: null,
        schoolResponsible: null,
        supportLevel2: false,
        priority: false,
      });
    });

    it('should return null when not found', async () => {
      jest.spyOn(Ticket, 'findByPk').mockResolvedValue(null);

      await expect(repo.findById('x')).resolves.toBeNull();
    });
  });

  describe('list', () => {
    it('should use limit, offset and a deterministic order without filters', async () => {
      const { data, instance } = buildModel();
      const findAndCountAll = jest
        .spyOn(Ticket, 'findAndCountAll')
        .mockResolvedValue({ rows: [instance], count: 7 } as never);

      const result = await repo.list({ limit: 10, offset: 20, filters: {} });

      expect(findAndCountAll).toHaveBeenCalledWith({
        where: {},
        limit: 10,
        offset: 20,
        order: [
          ['createdAt', 'DESC'],
          ['id', 'ASC'],
        ],
      });
      expect(result).toEqual({ rows: [data], count: 7 });
    });

    it('should translate every filter to the where clause', async () => {
      const findAndCountAll = jest
        .spyOn(Ticket, 'findAndCountAll')
        .mockResolvedValue({ rows: [], count: 0 } as never);

      await repo.list({
        limit: 20,
        offset: 0,
        filters: {
          schoolId: 3,
          status: 'done',
          devStatus: 'concluido',
          entryType: 'cms',
          slaType: 'baixo',
          priority: false,
          supportLevel2: true,
        },
      });

      expect(findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            schoolId: 3,
            status: 'done',
            devStatus: 'concluido',
            entryType: 'cms',
            slaType: 'baixo',
            priority: false,
            supportLevel2: 1,
          },
        }),
      );
    });

    it('should map supportLevel2=false to 0', async () => {
      const findAndCountAll = jest
        .spyOn(Ticket, 'findAndCountAll')
        .mockResolvedValue({ rows: [], count: 0 } as never);

      await repo.list({ limit: 20, offset: 0, filters: { supportLevel2: false } });

      expect(findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { supportLevel2: 0 } }),
      );
    });
  });

  describe('create', () => {
    it.each([
      [true, 1],
      [false, 0],
    ])('should persist supportLevel2=%s as %i', async (supportLevel2, column) => {
      const { data, instance } = buildModel({ supportLevel2 });
      const create = jest.spyOn(Ticket, 'create').mockResolvedValue(instance);
      const { id: _id, createdAt: _c, updatedAt: _u, ...input } = data;

      const result = await repo.create(input);

      expect(create).toHaveBeenCalledWith({ ...input, supportLevel2: column });
      expect(result).toEqual(data);
    });
  });

  describe('update', () => {
    it('should set only the provided fields and save', async () => {
      const { data, instance } = buildModel({ errorType: 'login' });
      jest.spyOn(Ticket, 'findByPk').mockResolvedValue(instance);
      const set = jest.spyOn(instance, 'set');

      const result = await repo.update(data.id, { status: 'done', slaType: null });

      expect(set).toHaveBeenCalledWith({ status: 'done', slaType: null });
      expect(instance.save).toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'done', slaType: null, errorType: 'login' });
    });

    it.each([
      [true, 1],
      [false, 0],
    ])('should convert supportLevel2=%s to %i', async (supportLevel2, column) => {
      const { data, instance } = buildModel({ supportLevel2: !supportLevel2 });
      jest.spyOn(Ticket, 'findByPk').mockResolvedValue(instance);
      const set = jest.spyOn(instance, 'set');

      const result = await repo.update(data.id, { supportLevel2 });

      expect(set).toHaveBeenCalledWith({ supportLevel2: column });
      expect(result?.supportLevel2).toBe(supportLevel2);
    });

    it('should return null when not found', async () => {
      jest.spyOn(Ticket, 'findByPk').mockResolvedValue(null);

      await expect(repo.update('x', { status: 'done' })).resolves.toBeNull();
    });
  });

  describe('delete', () => {
    it('should report whether a row was affected', async () => {
      const destroy = jest
        .spyOn(Ticket, 'destroy')
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      await expect(repo.delete('id-1')).resolves.toBe(true);
      await expect(repo.delete('id-2')).resolves.toBe(false);
      expect(destroy).toHaveBeenCalledWith({ where: { id: 'id-1' } });
    });
  });
});
