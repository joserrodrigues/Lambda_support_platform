import { ConfigError, loadConfig } from '../../../src/config/env';

const validSecret = 'a'.repeat(32);

describe('loadConfig', () => {
  it('should apply secure defaults when only JWT_SECRET is provided', () => {
    const config = loadConfig({ JWT_SECRET: validSecret });

    expect(config.JWT_EXPIRES_IN_SECONDS).toBe(600);
    expect(config.SESSION_MAX_AGE_SECONDS).toBe(28_800);
    expect(config.DB_SSL).toBe(false);
    expect(config.CORS_ORIGINS).toEqual([]);
  });

  it('should parse booleans, numbers and comma separated origins', () => {
    const config = loadConfig({
      JWT_SECRET: validSecret,
      DB_SSL: 'true',
      DB_PORT: '3307',
      CORS_ORIGINS: 'https://a.com, https://b.com,,',
    });

    expect(config.DB_SSL).toBe(true);
    expect(config.DB_PORT).toBe(3307);
    expect(config.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });

  it('should reject a JWT_SECRET shorter than 32 characters', () => {
    expect(() => loadConfig({ JWT_SECRET: 'short' })).toThrow(ConfigError);
  });

  it('should not leak secret values in the error message', () => {
    const secret = 'my-leaky-secret';
    let message = '';
    try {
      loadConfig({ JWT_SECRET: secret, DB_SSL: 'yes' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/JWT_SECRET/);
    expect(message).not.toContain(secret);
  });

  it('should list the invalid variable names', () => {
    expect(() => loadConfig({ JWT_SECRET: validSecret, DB_PORT: 'abc' })).toThrow(/DB_PORT/);
  });
});
