import type { Sequelize } from 'sequelize';
import { initSchoolModel, School } from '../modules/schools/school.model';
import { initPostModel, Post } from '../modules/tickets/post.model';
import { initTicketModel, Ticket } from '../modules/tickets/ticket.model';
import { initUserModel, User } from '../modules/users/user.model';

export function initModels(sequelize: Sequelize): void {
  initUserModel(sequelize);
  initSchoolModel(sequelize);
  initTicketModel(sequelize);
  initPostModel(sequelize);

  School.hasMany(Ticket, {
    as: 'tickets',
    foreignKey: 'schoolId',
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  });
  Ticket.belongsTo(School, { as: 'school', foreignKey: 'schoolId' });
  Ticket.hasMany(Post, { as: 'posts', foreignKey: 'ticketId', onDelete: 'CASCADE' });
  Post.belongsTo(Ticket, { as: 'ticket', foreignKey: 'ticketId' });
  Post.belongsTo(User, { as: 'author', foreignKey: 'userId' });
  User.hasMany(Post, { as: 'posts', foreignKey: 'userId' });
}
