import { AuthService } from '../../../../src/modules/auth/auth.service';
import type { AccessTokenPayload, TokenSigner } from '../../../../src/modules/auth/auth.types';
import { fakeHasher, InMemoryUserRepository } from '../../../helpers/fakes';

const NOW = 1_800_000_000;

describe('AuthService', () => {
  let repo: InMemoryUserRepository;
  let signer: jest.Mocked<TokenSigner>;
  let service: AuthService;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    signer = { sign: jest.fn().mockResolvedValue('signed.jwt.token') };
    service = new AuthService(
      repo,
      signer,
      { expiresInSeconds: 600, sessionMaxAgeSeconds: 3600, now: () => NOW },
      fakeHasher,
    );
  });

  const payloadFor = (overrides: Partial<AccessTokenPayload> = {}): AccessTokenPayload => ({
    sub: 'id',
    role: 'requester',
    ver: 0,
    auth_time: NOW - 60,
    jti: 'jti',
    iat: NOW - 60,
    exp: NOW + 540,
    iss: 'iss',
    aud: 'aud',
    ...overrides,
  });

  describe('login', () => {
    it('should return a Bearer token with 600s expiration', async () => {
      const user = repo.seed({ email: 'ana@escola.com', passwordHash: 'hashed:senha-super-forte' });

      const result = await service.login({
        email: 'ana@escola.com',
        password: 'senha-super-forte',
      });

      expect(result).toMatchObject({
        accessToken: 'signed.jwt.token',
        tokenType: 'Bearer',
        expiresIn: 600,
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(signer.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: user.id, role: 'requester', ver: 0, auth_time: NOW }),
      );
    });

    it('should record lastLoginAt', async () => {
      const user = repo.seed({ email: 'ana@escola.com', passwordHash: 'hashed:senha-super-forte' });
      await service.login({ email: 'ana@escola.com', password: 'senha-super-forte' });
      expect(repo.users.get(user.id)?.lastLoginAt).toBeInstanceOf(Date);
    });

    it('should use a unique jti per token', async () => {
      repo.seed({ email: 'ana@escola.com', passwordHash: 'hashed:senha-super-forte' });
      await service.login({ email: 'ana@escola.com', password: 'senha-super-forte' });
      await service.login({ email: 'ana@escola.com', password: 'senha-super-forte' });

      const [first, second] = signer.sign.mock.calls.map(([claims]) => claims.jti);
      expect(first).not.toBe(second);
    });

    it.each([
      ['unknown e-mail', 'nobody@escola.com', 'senha-super-forte', true],
      ['wrong password', 'ana@escola.com', 'senha-errada', true],
      ['inactive user', 'ana@escola.com', 'senha-super-forte', false],
    ])(
      'should fail with the same generic message for %s',
      async (_case, email, password, active) => {
        repo.seed({ email: 'ana@escola.com', passwordHash: 'hashed:senha-super-forte', active });

        await expect(service.login({ email, password })).rejects.toMatchObject({
          statusCode: 401,
          message: 'Credenciais inválidas',
        });
        expect(signer.sign).not.toHaveBeenCalled();
      },
    );

    it('should still verify a hash when the user does not exist (timing attack)', async () => {
      const verify = jest.spyOn(fakeHasher, 'verify');
      await expect(service.login({ email: 'nobody@escola.com', password: 'x' })).rejects.toThrow();
      expect(verify).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateSession', () => {
    it('should return the user when the session is valid', async () => {
      const user = repo.seed();
      await expect(service.validateSession(payloadFor({ sub: user.id }))).resolves.toMatchObject({
        id: user.id,
      });
    });

    it('should reject when the absolute session lifetime is exceeded', async () => {
      const user = repo.seed();
      await expect(
        service.validateSession(payloadFor({ sub: user.id, auth_time: NOW - 3601 })),
      ).rejects.toMatchObject({
        statusCode: 401,
        message: expect.stringContaining('Sessão expirada') as string,
      });
    });

    it('should reject a revoked token (tokenVersion mismatch)', async () => {
      const user = repo.seed({ tokenVersion: 2 });
      await expect(
        service.validateSession(payloadFor({ sub: user.id, ver: 1 })),
      ).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('should reject an inactive or missing user', async () => {
      const inactive = repo.seed({ active: false });
      await expect(service.validateSession(payloadFor({ sub: inactive.id }))).rejects.toMatchObject(
        {
          statusCode: 401,
        },
      );
      await expect(service.validateSession(payloadFor({ sub: 'missing' }))).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('should reject tokens without the custom claims', async () => {
      const user = repo.seed();
      const payload = {
        ...payloadFor({ sub: user.id }),
        ver: undefined,
      } as unknown as AccessTokenPayload;
      await expect(service.validateSession(payload)).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('refresh', () => {
    it('should keep the original auth_time and use the current role/version', async () => {
      const user = repo.seed({ role: 'agent', tokenVersion: 3 });
      await service.refresh(
        user,
        payloadFor({ sub: user.id, auth_time: NOW - 100, role: 'requester' }),
      );

      expect(signer.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: user.id, role: 'agent', ver: 3, auth_time: NOW - 100 }),
      );
    });
  });

  describe('logout', () => {
    it('should increment tokenVersion revoking every token', async () => {
      const user = repo.seed();
      await service.logout(user.id);
      expect(repo.users.get(user.id)?.tokenVersion).toBe(1);
    });
  });

  it('should default to the real clock when now is not provided', async () => {
    const real = new AuthService(
      repo,
      signer,
      { expiresInSeconds: 600, sessionMaxAgeSeconds: 60 },
      fakeHasher,
    );
    const user = repo.seed();
    const authTime = Math.floor(Date.now() / 1000);
    await expect(
      real.validateSession(payloadFor({ sub: user.id, auth_time: authTime })),
    ).resolves.toBeDefined();
  });
});
