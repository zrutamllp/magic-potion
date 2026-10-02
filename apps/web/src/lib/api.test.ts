import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVER_BUSY, SERVER_BUSY_MESSAGE } from '@magic-potion/shared';
import { apiGet, apiLogin, apiPost, apiPostWithWait } from './api';

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

describe('staff changes are safe to repeat (Phase 7C)', () => {
  const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  const key = (call: unknown[]) =>
    new Headers((call[1] as RequestInit).headers).get('Idempotency-Key');

  it('sends a key with every change and none with a read', async () => {
    const fetch = mockFetch(ok, ok);
    await apiPost('/api/staff/games/g/end-phase', {}, 't');
    await apiGet('/api/staff/games', 't');
    expect(key(fetch.mock.calls[0]!)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(key(fetch.mock.calls[1]!)).toBeNull();
  });

  it('after a network drop sends the same change once more with the same key', async () => {
    const fetch = vi.fn();
    fetch.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch');
    });
    fetch.mockImplementationOnce(async () => ok());
    vi.stubGlobal('fetch', fetch);
    const waits: number[] = [];
    await apiPostWithWait('/api/staff/games/g/end-phase', {}, 't', async (ms) => {
      waits.push(ms);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(key(fetch.mock.calls[1]!)).toBe(key(fetch.mock.calls[0]!));
    expect(waits).toEqual([2_000]);
  });

  it('never resends an import or an upload by itself', async () => {
    for (const path of ['/api/staff/packs/p/import?task=riddle', '/api/staff/packs/p/items/bulk']) {
      const fetch = vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      });
      vi.stubGlobal('fetch', fetch);
      await expect(apiPostWithWait(path, {}, 't', async () => {})).rejects.toThrow(
        'Cannot reach the server',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
});
