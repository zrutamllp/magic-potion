import { describe, expect, it } from 'vitest';
import { devToolsEnabled, loadEnv, parseOrigins } from './env';

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(4000);
    expect(env.CLIENT_ORIGIN).toBe('http://localhost:5173');
  });

  it('treats empty values as unset', () => {
    const env = loadEnv({ DATABASE_URL: '', JWT_SECRET: '' });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.JWT_SECRET).toBeUndefined();
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadEnv({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});

describe('devToolsEnabled', () => {
  it('is on only when asked for and not in production', () => {
    expect(devToolsEnabled(loadEnv({}))).toBe(false);
    expect(devToolsEnabled(loadEnv({ ENABLE_DEV_TOOLS: 'true' }))).toBe(true);
    expect(devToolsEnabled(loadEnv({ ENABLE_DEV_TOOLS: 'true', NODE_ENV: 'production' }))).toBe(
      false,
    );
  });
});

describe('parseOrigins', () => {
  it('splits and trims a comma-separated list', () => {
    expect(parseOrigins('https://a.com, https://b.com ,')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});
