import type { UserRole } from '../users/user.model';

/** Claims customizadas do access token (iss, aud, exp, iat são adicionadas na assinatura). */
export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  /** Versão do token do usuário; tokens com versão antiga são rejeitados. */
  ver: number;
  /** Momento (epoch em segundos) do login original, para limitar a duração total da sessão. */
  auth_time: number;
  jti: string;
}

export interface AccessTokenPayload extends AccessTokenClaims {
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface TokenSigner {
  sign(claims: AccessTokenClaims): Promise<string>;
}
