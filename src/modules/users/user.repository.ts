import { Op, type WhereOptions } from 'sequelize';
import { User } from './user.model';
import type { CreateUserData, UpdateUserData, UserEntity, UserWithPassword } from './user.types';

export interface UserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByIdWithPassword(id: string): Promise<UserWithPassword | null>;
  findByEmailWithPassword(email: string): Promise<UserWithPassword | null>;
  /** Considera também registros excluídos logicamente, para manter o e-mail único. */
  emailExists(email: string, excludeId?: string): Promise<boolean>;
  list(params: { limit: number; offset: number }): Promise<{ rows: UserEntity[]; count: number }>;
  create(data: CreateUserData): Promise<UserEntity>;
  update(id: string, data: UpdateUserData): Promise<UserEntity | null>;
  softDelete(id: string): Promise<boolean>;
}

function toEntity(user: User): UserEntity {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    tokenVersion: user.tokenVersion,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toEntityWithPassword(user: User): UserWithPassword {
  return { ...toEntity(user), passwordHash: user.passwordHash };
}

export class SequelizeUserRepository implements UserRepository {
  async findById(id: string): Promise<UserEntity | null> {
    const user = await User.findByPk(id);
    return user ? toEntity(user) : null;
  }

  async findByIdWithPassword(id: string): Promise<UserWithPassword | null> {
    const user = await User.scope('withPassword').findByPk(id);
    return user ? toEntityWithPassword(user) : null;
  }

  async findByEmailWithPassword(email: string): Promise<UserWithPassword | null> {
    const user = await User.scope('withPassword').findOne({ where: { email } });
    return user ? toEntityWithPassword(user) : null;
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const where: WhereOptions<User> = excludeId ? { email, id: { [Op.ne]: excludeId } } : { email };
    const count = await User.count({ where, paranoid: false });
    return count > 0;
  }

  async list({ limit, offset }: { limit: number; offset: number }) {
    const { rows, count } = await User.findAndCountAll({
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });
    return { rows: rows.map(toEntity), count };
  }

  async create(data: CreateUserData): Promise<UserEntity> {
    const user = await User.create(data);
    return toEntity(user);
  }

  async update(id: string, data: UpdateUserData): Promise<UserEntity | null> {
    const user = await User.findByPk(id);
    if (!user) return null;
    const { incrementTokenVersion, ...fields } = data;
    user.set(fields);
    if (incrementTokenVersion) user.tokenVersion += 1;
    await user.save();
    return toEntity(user);
  }

  async softDelete(id: string): Promise<boolean> {
    const deleted = await User.destroy({ where: { id } });
    return deleted > 0;
  }
}
