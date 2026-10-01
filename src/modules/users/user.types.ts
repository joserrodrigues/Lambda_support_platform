import type { UserRole } from './user.model';

/** Representação do usuário dentro da aplicação (nunca contém o hash da senha). */
export interface UserEntity {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  tokenVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithPassword extends UserEntity {
  passwordHash: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export type UpdateUserData = Partial<
  Pick<UserWithPassword, 'name' | 'email' | 'passwordHash' | 'role' | 'active' | 'lastLoginAt'>
> & { incrementTokenVersion?: boolean };

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}
