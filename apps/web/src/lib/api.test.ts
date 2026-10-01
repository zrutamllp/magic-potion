import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVER_BUSY, SERVER_BUSY_MESSAGE } from '@magic-potion/shared';
import { apiLogin } from './api';

// Logins during a storm (Phase 7C): "busy, try again" is retried by itself before any message.

const busy = () =>
  new Response(JSON.stringify({ code: SERVER_BUSY, message: SERVER_BUSY_MESSAGE }), {
    status: 503,
    headers: { 'Retry-After': '3' },
  });
const okReply = () => new Response(JSON.stringify({ token: 't' }), { status: 200 });
const wrong = () =>
  new Response(JSON.stringify({ code: 'BAD_TEAM_LOGIN', message: 'Not right.' }), { status: 401 });

function mockFetch(...replies: (() => Response)[]) {
  const fn = vi.fn();
  for (const r of replies) fn.mockImplementationOnce(async () => r());
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('logging in while the server is busy', () => {
  it('waits as asked and tries again by itself', async () => {
    const fetch = mockFetch(busy, busy, okReply);
    const waits: number[] = [];
    const wait = async (ms: number) => void waits.push(ms);
    await expect(apiLogin('/api/team/login', { code: 'A' }, { wait })).resolves.toEqual({
      token: 't',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    // Retry-After (3 s) plus up to 1.5 s, so a whole room does not come back at once.
    expect(waits).toHaveLength(2);
    for (const ms of waits) {
      expect(ms).toBeGreaterThanOrEqual(3_000);
      expect(ms).toBeLessThan(4_500);
    }
  });

  it('shows the busy message only after two retries', async () => {
    const fetch = mockFetch(busy, busy, busy);
    await expect(
      apiLogin('/api/team/login', { code: 'A' }, { wait: async () => {} }),
    ).rejects.toThrow(SERVER_BUSY_MESSAGE);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('never retries a wrong password', async () => {
    const fetch = mockFetch(wrong);
    await expect(
      apiLogin('/api/team/login', { code: 'A' }, { wait: async () => {} }),
    ).rejects.toThrow('Not right.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
