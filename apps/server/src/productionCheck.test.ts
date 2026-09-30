import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';
import { productionProblems } from './productionCheck';

const SECRET_A = 'a'.repeat(48);
const SECRET_B = 'b'.repeat(48);
const DB = 'postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const GOOD = {
  NODE_ENV: 'production',
  DATABASE_URL: DB,
  DIRECT_URL: DB.replace('-pooler', ''),
  JWT_SECRET: SECRET_A,
  PHOTO_LINK_SECRET: SECRET_B,
  BLOB_READ_WRITE_TOKEN: 'public-token',
  BLOB_PRIVATE_READ_WRITE_TOKEN: 'private-token',
  CLIENT_ORIGIN: 'https://play.zrutam.com',
};

const problems = (patch: Record<string, string | undefined>) => {
  const vars = { ...GOOD, ...patch };
  for (const k of Object.keys(vars))
    if (vars[k as keyof typeof vars] === undefined) delete vars[k as keyof typeof vars];
  return productionProblems(loadEnv(vars as NodeJS.ProcessEnv));
};

describe('the production start check', () => {
  it('passes a complete, safe setup', () => {
    expect(problems({})).toEqual([]);
  });

  it('does not apply outside production', () => {
    expect(
      problems({ NODE_ENV: 'development', ENABLE_DEV_TOOLS: 'true', JWT_SECRET: undefined }),
    ).toEqual([]);
  });

  it('refuses dev tools', () => {
    expect(problems({ ENABLE_DEV_TOOLS: 'true' })).toEqual([
      'ENABLE_DEV_TOOLS is "true". Dev tools must never be on for a live event.',
    ]);
  });

  it('lists every missing variable at once, by name only', () => {
    const list = problems({
      DIRECT_URL: undefined,
      BLOB_PRIVATE_READ_WRITE_TOKEN: undefined,
      PHOTO_LINK_SECRET: undefined,
    });
    expect(list).toEqual([
      'DIRECT_URL is missing.',
      'BLOB_PRIVATE_READ_WRITE_TOKEN is missing.',
      'PHOTO_LINK_SECRET is missing.',
    ]);
    expect(list.join(' ')).not.toContain(SECRET_A);
  });

  it('needs long, separate secrets', () => {
    expect(problems({ JWT_SECRET: 'x'.repeat(40) })).toEqual([
      'JWT_SECRET is too short: use at least 48 random characters.',
    ]);
    expect(problems({ PHOTO_LINK_SECRET: SECRET_A })).toEqual([
      'PHOTO_LINK_SECRET must be different from JWT_SECRET.',
    ]);
  });

  it('needs the live https web address for CORS', () => {
    expect(problems({ CLIENT_ORIGIN: 'http://localhost:5173' })).toEqual([
      'CLIENT_ORIGIN must be the live web address (not localhost).',
    ]);
    expect(problems({ CLIENT_ORIGIN: 'http://play.zrutam.com' })).toEqual([
      'CLIENT_ORIGIN must use https://.',
    ]);
    // The default (unset) is localhost.
    expect(problems({ CLIENT_ORIGIN: undefined })).toHaveLength(1);
  });

  it('needs the direct connection for migrations, not the pooled one', () => {
    expect(problems({ DIRECT_URL: DB })).toEqual([
      'DIRECT_URL is a pooled connection (-pooler). Use the direct one (Neon: Connection pooling off).',
    ]);
  });

  it('refuses an unencrypted database connection', () => {
    expect(problems({ DATABASE_URL: DB.replace('sslmode=require', 'sslmode=disable') })).toEqual([
      'DATABASE_URL has sslmode=disable. Use sslmode=require.',
    ]);
  });
});
