import { closeSequelize, getSequelize } from '../../../src/database/sequelize';
import { Post } from '../../../src/modules/tickets/post.model';
import { Ticket } from '../../../src/modules/tickets/ticket.model';
import { User } from '../../../src/modules/users/user.model';
import { testConfig } from '../../helpers/fakes';

// Apenas inicializa os models; nenhuma conexão com o banco é aberta.
beforeAll(() => {
  getSequelize(testConfig);
});

afterAll(async () => {
  await closeSequelize();
});

describe('initModels', () => {
  it('should map the ticket attributes to the snake_case columns of the migration', () => {
    const fields = Object.fromEntries(
      Object.entries(Ticket.getAttributes()).map(([name, attr]) => [name, attr.field]),
    );

    expect(fields).toEqual({
      id: 'id',
      schoolId: 'school_id',
      status: 'status',
      devStatus: 'dev_status',
      entryType: 'entry_type',
      errorType: 'error_type',
      supportLevel2: 'support_level_2',
      priority: 'priority',
      slaType: 'sla_type',
      responseAt: 'response_at',
      technicalResponseAt: 'technical_response_at',
      schoolResponsible: 'school_responsible',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    });
    expect(Ticket.getTableName()).toBe('tickets');
  });

  it('should default supportLevel2 to 0', () => {
    const ticket = Ticket.build({
      schoolId: 1,
      status: 'aguardando',
      entryType: 'email',
      priority: false,
      devStatus: null,
      errorType: null,
      slaType: null,
      responseAt: null,
      technicalResponseAt: null,
      schoolResponsible: null,
    });

    expect(ticket.supportLevel2).toBe(0);
  });

  it('should map the post attributes and table', () => {
    expect(Post.getTableName()).toBe('posts');
    expect(Post.getAttributes().ticketId.field).toBe('ticket_id');
    expect(Post.getAttributes().userId.field).toBe('user_id');
  });

  it('should map the user login column', () => {
    expect(User.getAttributes().login).toMatchObject({
      field: 'login',
      allowNull: false,
      unique: true,
    });
  });

  it('should link tickets, posts and users', () => {
    expect(Ticket.associations.posts).toMatchObject({
      associationType: 'HasMany',
      foreignKey: 'ticketId',
    });
    expect(Post.associations.ticket).toMatchObject({
      associationType: 'BelongsTo',
      foreignKey: 'ticketId',
    });
    expect(Post.associations.author).toMatchObject({
      associationType: 'BelongsTo',
      foreignKey: 'userId',
    });
    expect(User.associations.posts).toMatchObject({
      associationType: 'HasMany',
      foreignKey: 'userId',
    });
  });
});
