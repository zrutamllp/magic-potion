import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withVerifyFullSsl } from './db';

const BASE = 'postgresql://user:p%40ss@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb';

describe('withVerifyFullSsl', () => {
  it.each(['prefer', 'require', 'verify-ca'])('turns sslmode=%s into verify-full', (mode) => {
    const out = withVerifyFullSsl(`${BASE}?sslmode=${mode}&channel_binding=require`);
    const url = new URL(out);
    expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(url.searchParams.get('channel_binding')).toBe('require');
    expect(url.password).toBe('p%40ss');
    expect(url.pathname).toBe('/neondb');
  });

  it('adds verify-full when no sslmode is given', () => {
    expect(new URL(withVerifyFullSsl(BASE)).searchParams.get('sslmode')).toBe('verify-full');
  });

  it('leaves verify-full, disable and a local database alone', () => {
    for (const s of [
      `${BASE}?sslmode=verify-full`,
      `${BASE}?sslmode=disable`,
      'postgresql://localhost/test',
      'postgresql://127.0.0.1:5432/test',
      'not a url',
    ]) {
      expect(withVerifyFullSsl(s)).toBe(s);
    }
  });
});

// Every way this project connects to Postgres goes through withVerifyFullSsl (Phase 7A).
describe('database connections', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return e.name === 'generated' ? [] : files(path);
      return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [path] : [];
    });

  it('are only opened by createPrisma, which forces verify-full', () => {
    const openers = [...files('src'), ...files('scripts'), ...files('prisma')].filter((f) =>
      /new PrismaPg\(|new PrismaClient\(|new Pool\(|new Client\(/.test(readFileSync(f, 'utf8')),
    );
    expect(openers.map((f) => f.split('\\').join('/'))).toEqual(['src/db.ts']);
    expect(readFileSync('src/db.ts', 'utf8')).toContain(
      'connectionString: withVerifyFullSsl(databaseUrl)',
    );
  });

  it('use verify-full for migrations too', () => {
    expect(readFileSync('prisma.config.ts', 'utf8')).toMatch(/withVerifyFullSsl\(process\.env/);
  });
});
