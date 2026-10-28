import { Model, type Sequelize } from 'sequelize';
import type { AppModels } from './context';
import { initSchoolModel, type School } from '../modules/schools/school.model';
import { initPostModel, type Post } from '../modules/tickets/post.model';
import { initTicketModel, type Ticket } from '../modules/tickets/ticket.model';
import { initUserModel, type User } from '../modules/users/user.model';

function associateModels(models: AppModels): void {
  models.School.hasMany(models.Ticket, { as: 'tickets', foreignKey: 'schoolId' });
  models.Ticket.belongsTo(models.School, { as: 'school', foreignKey: 'schoolId' });
  models.Ticket.hasMany(models.Post, { as: 'posts', foreignKey: 'ticketId', onDelete: 'CASCADE' });
  models.Post.belongsTo(models.Ticket, { as: 'ticket', foreignKey: 'ticketId' });
  models.Post.belongsTo(models.User, { as: 'author', foreignKey: 'userId' });
  models.User.hasMany(models.Post, { as: 'posts', foreignKey: 'userId' });
}

export function initModels(sequelize: Sequelize): void {
  const models: AppModels = {
    User: initUserModel(sequelize),
    School: initSchoolModel(sequelize),
    Ticket: initTicketModel(sequelize),
    Post: initPostModel(sequelize),
  };
  associateModels(models);
}

/** Classes novas, presas a outra conexão. Não reutiliza os models de `DB_*`. */
export function bindModels(sequelize: Sequelize): AppModels {
  const models: AppModels = {
    User: initUserModel(sequelize, class BoundUser extends Model {} as typeof User),
    School: initSchoolModel(sequelize, class BoundSchool extends Model {} as typeof School),
    Ticket: initTicketModel(sequelize, class BoundTicket extends Model {} as typeof Ticket),
    Post: initPostModel(sequelize, class BoundPost extends Model {} as typeof Post),
  };
  associateModels(models);
  return models;
}
