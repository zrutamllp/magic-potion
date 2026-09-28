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

  it('leaves other strings alone', () => {
    for (const s of [
      `${BASE}?sslmode=verify-full`,
      `${BASE}?sslmode=disable`,
      BASE,
      'postgresql://localhost/test',
      'not a url',
    ]) {
      expect(withVerifyFullSsl(s)).toBe(s);
    }
  });
});
