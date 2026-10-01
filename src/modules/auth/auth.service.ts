import { randomUUID } from 'node:crypto';
import { Errors } from '../../shared/errors';
import { getDummyHash } from '../../shared/password';
import type { UserRepository } from '../users/user.repository';
import { defaultPasswordHasher, toPublicUser, type PasswordHasher } from '../users/user.service';
import type { UserEntity } from '../users/user.types';
import type { LoginBody, LoginResponse } from './auth.schemas';
import type { AccessTokenPayload, TokenSigner } from './auth.types';

export interface AuthServiceOptions {
  expiresInSeconds: number;
  sessionMaxAgeSeconds: number;
  now?: () => number;
}

const INVALID_CREDENTIALS = 'Credenciais inválidas';
const INVALID_TOKEN = 'Token inválido ou expirado';

export class AuthService {
  private readonly now: () => number;

  constructor(
    private readonly users: UserRepository,
    private readonly signer: TokenSigner,
    private readonly options: AuthServiceOptions,
    private readonly hasher: PasswordHasher = defaultPasswordHasher,
  ) {
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  async login({ email, password }: LoginBody): Promise<LoginResponse> {
    const user = await this.users.findByEmailWithPassword(email);

    // Sempre executa a verificação de hash para manter o tempo de resposta constante
    // e não revelar se o e-mail existe (OWASP A07:2025 - Authentication Failures).
    const hash = user?.passwordHash ?? (await getDummyHash());
    const passwordOk = await this.hasher.verify(password, hash);

    if (!user || !passwordOk || !user.active) {
      throw Errors.unauthorized(INVALID_CREDENTIALS);
    }

    const updated = (await this.users.update(user.id, { lastLoginAt: new Date() })) ?? user;
    const accessToken = await this.issueToken(updated, this.now());
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.options.expiresInSeconds,
      user: toPublicUser(updated),
    };
  }

  /**
   * Valida as claims de um token já verificado criptograficamente e confirma no banco
   * que o usuário continua ativo e que o token não foi revogado.
   */
  async validateSession(payload: AccessTokenPayload): Promise<UserEntity> {
    if (typeof payload.auth_time !== 'number' || typeof payload.ver !== 'number') {
      throw Errors.unauthorized(INVALID_TOKEN);
    }
    if (this.now() - payload.auth_time > this.options.sessionMaxAgeSeconds) {
      throw Errors.unauthorized('Sessão expirada, faça login novamente');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || !user.active || user.tokenVersion !== payload.ver) {
      throw Errors.unauthorized(INVALID_TOKEN);
    }
    return user;
  }

  /** Emite um novo token com validade renovada, preservando o momento do login original. */
  refresh(user: UserEntity, payload: AccessTokenPayload): Promise<string> {
    return this.issueToken(user, payload.auth_time);
  }

  /** Revoga todos os tokens do usuário incrementando a versão. */
  async logout(userId: string): Promise<void> {
    await this.users.update(userId, { incrementTokenVersion: true });
  }

  private issueToken(user: UserEntity, authTime: number): Promise<string> {
    return this.signer.sign({
      sub: user.id,
      role: user.role,
      ver: user.tokenVersion,
      auth_time: authTime,
      jti: randomUUID(),
    });
  }
}
