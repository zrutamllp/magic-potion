import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from './health';

describe('HealthResponseSchema', () => {
  it('accepts a valid health response', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'ok',
      db: 'ok',
      time: new Date().toISOString(),
    });
    expect(parsed.status).toBe('ok');
  });

  it('rejects an unknown db state', () => {
    expect(() => HealthResponseSchema.parse({ status: 'ok', db: 'maybe', time: 'x' })).toThrow();
  });
});
