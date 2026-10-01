import type { Sequelize } from 'sequelize';
import { initUserModel } from '../modules/users/user.model';

export function initModels(sequelize: Sequelize): void {
  initUserModel(sequelize);
}
