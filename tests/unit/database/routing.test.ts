import { loadConfig } from '../../../src/config/env';
import { connectionFor, resolveDatabaseTarget } from '../../../src/database/routing';

const secret = 'a'.repeat(32);

describe('resolveDatabaseTarget', () => {
  it.each(['localhost', 'localhost:3000', '127.0.0.1:3000', '[::1]:3000'])(
    'should keep %s on the local database even when Origin points at prod',
    (host) => {
      expect(
        resolveDatabaseTarget({ host, origin: 'https://suporte.schoolguardian.app' }),
      ).toBe('local');
    },
  );

  it('should map the public hosts', () => {
    expect(resolveDatabaseTarget({ host: 'suporte.schoolguardian.app' })).toBe('prod');
    expect(resolveDatabaseTarget({ host: 'Suporte-T.SchoolGuardian.app' })).toBe('hom');
  });

  it('should use Origin when the API host is not one of the three addresses', () => {
    expect(
      resolveDatabaseTarget({
        host: 'abc.execute-api.us-east-1.amazonaws.com',
        origin: 'https://suporte-t.schoolguardian.app',
      }),
    ).toBe('hom');
    expect(
      resolveDatabaseTarget({
        host: 'abc.execute-api.us-east-1.amazonaws.com',
        origin: 'https://suporte.schoolguardian.app/tickets',
      }),
    ).toBe('prod');
  });

  it('should use the test database when the address is not prod or local', () => {
    expect(resolveDatabaseTarget({ host: 'evil.example' })).toBe('hom');
    expect(resolveDatabaseTarget({ host: 'd3lr7l5hmg8swx.cloudfront.net' })).toBe('hom');
    expect(resolveDatabaseTarget({ origin: 'not a url' })).toBe('hom');
  });
});

describe('connectionFor', () => {
  const base = loadConfig({
    JWT_SECRET: secret,
    DB_HOST: '127.0.0.1',
    DB_NAME: 'BaseEscolas',
    DB_USER: 'root',
    DB_PASSWORD: 'password',
  });

  it('should use DB_* for local', () => {
    expect(connectionFor(base, 'local')).toMatchObject({ host: '127.0.0.1', name: 'BaseEscolas' });
  });

  it('should require HOM_DB_* for hom', () => {
    expect(connectionFor(base, 'hom')).toBeNull();
    const hom = loadConfig({
      JWT_SECRET: secret,
      NODE_ENV: 'development',
      HOM_DB_HOST: 'hom.internal',
      HOM_DB_NAME: 'BaseEscolas',
      HOM_DB_USER: 'app',
      HOM_DB_PASSWORD: 'secret',
      HOM_DB_PORT: '',
    });
    expect(connectionFor(hom, 'hom')).toMatchObject({
      host: 'hom.internal',
      port: 3306,
      ssl: true,
    });
  });

  it('should fall back to DB_* for prod only when NODE_ENV is production', () => {
    expect(connectionFor(base, 'prod')).toBeNull();
    const deployed = loadConfig({
      JWT_SECRET: secret,
      NODE_ENV: 'production',
      DB_HOST: 'prod.rds.internal',
      DB_NAME: 'BaseEscolas',
      DB_USER: 'app',
    });
    expect(connectionFor(deployed, 'prod')).toMatchObject({ host: 'prod.rds.internal' });
  });
});
