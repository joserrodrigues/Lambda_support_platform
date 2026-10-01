import { Errors } from '../../shared/errors';
import { hashPassword, verifyPassword } from '../../shared/password';
import type { UserRepository } from './user.repository';
import type { CreateUserBody, ListUsersQuery, PublicUser, UpdateUserBody } from './user.schemas';
import type { AuthenticatedUser, UpdateUserData, UserEntity } from './user.types';

export function toPublicUser(user: UserEntity): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    login: user.login,
    role: user.role,
    active: user.active,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export const defaultPasswordHasher: PasswordHasher = {
  hash: hashPassword,
  verify: verifyPassword,
};

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher = defaultPasswordHasher,
  ) {}

  async create(input: CreateUserBody): Promise<PublicUser> {
    if (await this.users.emailExists(input.email)) {
      throw Errors.conflict('E-mail já cadastrado');
    }
    if (await this.users.loginExists(input.login)) {
      throw Errors.conflict('Login já cadastrado');
    }
    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.users.create({
      name: input.name,
      email: input.email,
      login: input.login,
      passwordHash,
      role: input.role,
    });
    return toPublicUser(user);
  }

  async list(query: ListUsersQuery) {
    const { page, pageSize } = query;
    const { rows, count } = await this.users.list({
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { data: rows.map(toPublicUser), meta: { page, pageSize, total: count } };
  }

  async getById(id: string, actor: AuthenticatedUser): Promise<PublicUser> {
    this.assertCanAccess(id, actor);
    const user = await this.users.findById(id);
    if (!user) throw Errors.notFound('Usuário não encontrado');
    return toPublicUser(user);
  }

  async update(id: string, input: UpdateUserBody, actor: AuthenticatedUser): Promise<PublicUser> {
    this.assertCanAccess(id, actor);
    const isAdmin = actor.role === 'admin';
    const isSelf = actor.id === id;

    // Somente administradores podem alterar papel e status (OWASP API5 - BFLA).
    if (!isAdmin && (input.role !== undefined || input.active !== undefined)) {
      throw Errors.forbidden('Apenas administradores podem alterar papel ou status');
    }
    // Evita que um administrador remova o próprio acesso por engano.
    if (isSelf && isAdmin && (input.active === false || (input.role && input.role !== 'admin'))) {
      throw Errors.badRequest('Não é permitido rebaixar ou desativar o próprio usuário');
    }

    const current = await this.users.findByIdWithPassword(id);
    if (!current) throw Errors.notFound('Usuário não encontrado');

    const changes: UpdateUserData = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.role !== undefined) changes.role = input.role;

    if (input.email !== undefined && input.email !== current.email) {
      if (await this.users.emailExists(input.email, id)) {
        throw Errors.conflict('E-mail já cadastrado');
      }
      changes.email = input.email;
    }

    if (input.login !== undefined && input.login !== current.login) {
      if (await this.users.loginExists(input.login, id)) {
        throw Errors.conflict('Login já cadastrado');
      }
      changes.login = input.login;
    }

    if (input.active !== undefined) {
      changes.active = input.active;
      // Desativar o usuário invalida imediatamente todos os tokens dele.
      if (!input.active) changes.incrementTokenVersion = true;
    }

    if (input.password !== undefined) {
      // O próprio usuário precisa confirmar a senha atual (proteção contra sequestro de sessão).
      if (isSelf) {
        const valid =
          input.currentPassword !== undefined &&
          (await this.hasher.verify(input.currentPassword, current.passwordHash));
        if (!valid) throw Errors.badRequest('Senha atual inválida');
      }
      changes.passwordHash = await this.hasher.hash(input.password);
      changes.incrementTokenVersion = true;
    }

    const updated = await this.users.update(id, changes);
    if (!updated) throw Errors.notFound('Usuário não encontrado');
    return toPublicUser(updated);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.id === id) throw Errors.badRequest('Não é permitido excluir o próprio usuário');
    const deleted = await this.users.softDelete(id);
    if (!deleted) throw Errors.notFound('Usuário não encontrado');
  }

  /** Proteção contra BOLA (OWASP API1): não-admin só acessa o próprio registro. */
  private assertCanAccess(id: string, actor: AuthenticatedUser): void {
    if (actor.role !== 'admin' && actor.id !== id) {
      throw Errors.forbidden();
    }
  }
}
