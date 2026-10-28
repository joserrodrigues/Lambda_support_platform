import { Op, type WhereOptions } from 'sequelize';
import { activeModels } from '../../database/context';
import { Errors } from '../../shared/errors';
import { isActiveTipo, roleFromTipo, type User } from './user.model';
import type { CreateUserData, UpdateUserData, UserEntity, UserWithPassword } from './user.types';

export interface UserRepository {
  findById(id: number): Promise<UserEntity | null>;
  findByIdWithPassword(id: number): Promise<UserWithPassword | null>;
  findByEmailWithPassword(email: string): Promise<UserWithPassword | null>;
  /** E-mail já usado em `fsfadm_Usuarios`. */
  emailExists(email: string, excludeId?: number): Promise<boolean>;
  /**
   * A tabela legada não tem coluna de login. A implementação em memória ainda
   * valida unicidade; a do Sequelize não consulta coluna inexistente.
   */
  loginExists(login: string, excludeId?: number): Promise<boolean>;
  list(params: { limit: number; offset: number }): Promise<{ rows: UserEntity[]; count: number }>;
  create(data: CreateUserData): Promise<UserEntity>;
  update(id: number, data: UpdateUserData): Promise<UserEntity | null>;
  softDelete(id: number): Promise<boolean>;
}

function toEntity(user: User): UserEntity {
  const createdAt = user.createdAt;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    // Não há coluna de login: a API espelha o e-mail para manter o contrato.
    login: user.email,
    role: roleFromTipo(user.tipo),
    active: isActiveTipo(user.tipo),
    // `fsfadm_Usuarios` não tem versão de token; a revogação não persiste nesta tabela.
    tokenVersion: 0,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}

function toEntityWithPassword(user: User): UserWithPassword {
  return { ...toEntity(user), passwordHash: user.passwordHash };
}

const SHARED_USER_TABLE =
  'fsfadm_Usuarios é usada por outro sistema e esta API não grava nela';

function userModel(): typeof User {
  return activeModels().User;
}

function writesSharedUser(data: UpdateUserData): boolean {
  return (
    data.name !== undefined ||
    data.email !== undefined ||
    data.login !== undefined ||
    data.passwordHash !== undefined ||
    data.role !== undefined ||
    data.active !== undefined
  );
}

export class SequelizeUserRepository implements UserRepository {
  async findById(id: number): Promise<UserEntity | null> {
    const user = await userModel().findByPk(id);
    return user ? toEntity(user) : null;
  }

  async findByIdWithPassword(id: number): Promise<UserWithPassword | null> {
    const user = await userModel().scope('withPassword').findByPk(id);
    return user ? toEntityWithPassword(user) : null;
  }

  async findByEmailWithPassword(email: string): Promise<UserWithPassword | null> {
    const user = await userModel().scope('withPassword').findOne({ where: { email } });
    return user ? toEntityWithPassword(user) : null;
  }

  async emailExists(email: string, excludeId?: number): Promise<boolean> {
    const where: WhereOptions<User> = excludeId ? { email, id: { [Op.ne]: excludeId } } : { email };
    const count = await userModel().count({ where });
    return count > 0;
  }

  async loginExists(_login: string, _excludeId?: number): Promise<boolean> {
    return false;
  }

  async list({ limit, offset }: { limit: number; offset: number }) {
    const { rows, count } = await userModel().findAndCountAll({
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });
    return { rows: rows.map(toEntity), count };
  }

  async create(_data: CreateUserData): Promise<UserEntity> {
    throw Errors.forbidden(SHARED_USER_TABLE);
  }

  async update(id: number, data: UpdateUserData): Promise<UserEntity | null> {
    if (writesSharedUser(data)) throw Errors.forbidden(SHARED_USER_TABLE);
    // Login e logout pedem lastLoginAt / tokenVersion. Não há onde gravar isso
    // sem alterar uma coluna do outro sistema, então a leitura segue intacta.
    const user = await userModel().findByPk(id);
    return user ? toEntity(user) : null;
  }

  async softDelete(_id: number): Promise<boolean> {
    throw Errors.forbidden(SHARED_USER_TABLE);
  }
}
