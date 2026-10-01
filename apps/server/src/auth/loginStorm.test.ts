import bcrypt from 'bcrypt';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SERVER_BUSY, SERVER_BUSY_MESSAGE } from '@magic-potion/shared';
import { createApp } from '../app';
import { FakeClock } from '../engine/clock';
import { memoryEngine } from '../engine/memoryGame';
import { createApiRouter } from '../http/api';
import { authFixture, teamPassword } from '../testSupport';

// A whole room logs in at the same moment (Phase 7C, Round B). Team passwords use the real
// cost (10), as on the live server.

const TEAMS = 25;
const TEAM_COST = 10;

// The longest time the event loop could not run anything while `work` ran.
async function longestStall(work: () => Promise<unknown>): Promise<number> {
  let longest = 0;
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    longest = Math.max(longest, now - last - 5);
    last = now;
  }, 5);
  try {
    await work();
  } finally {
    clearInterval(timer);
  }
  return longest;
}

describe('a login storm', () => {
  it('logs in 25 teams at once without freezing the server', { timeout: 60_000 }, async () => {
    const fx = authFixture(TEAMS);
    await Promise.all(
      fx.store.teams.map(async (t, i) => {
        t.passwordHash = await bcrypt.hash(teamPassword(i + 1), TEAM_COST);
      }),
    );
    let results: { ok: boolean }[] = [];
    const stall = await longestStall(async () => {
      results = await Promise.all(
        fx.store.teams.map((t, i) =>
          fx.auth.loginTeam({ code: t.code, password: teamPassword(i + 1) }, '10.0.0.1'),
        ),
      );
    });
    expect(results.every((r) => r.ok)).toBe(true);
    // Live games, sockets and database answers keep running while passwords are checked.
    // With a JavaScript bcrypt this was about 2 s on a fast PC (much more on the server).
    expect(stall).toBeLessThan(200);
  });
});

describe('when the database is too busy', () => {
  function setup(error: Error & { code?: string }) {
    const fx = authFixture();
    fx.store.findLoginTeams = async () => {
      throw error;
    };
    const { engine } = memoryEngine({ teams: 3, clock: new FakeClock(0) });
    const api = createApiRouter({ auth: fx.auth, engine: async () => engine, devTools: false });
    return createApp({ clientOrigins: [], api });
  }

  it('answers 503 "busy, try again" with Retry-After, never 500', async () => {
    const busy = Object.assign(new Error('Transaction API error: Unable to start a transaction'), {
      code: 'P2028',
    });
    const res = await request(setup(busy))
      .post('/api/team/login')
      .send({ code: 'TEAM1', password: teamPassword(1) });
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('3');
    expect(res.body).toEqual({ code: SERVER_BUSY, message: SERVER_BUSY_MESSAGE });
  });

  it('also when the connection pool times out', async () => {
    const res = await request(setup(new Error('timeout exceeded when trying to connect')))
      .post('/api/team/login')
      .send({ code: 'TEAM1', password: teamPassword(1) });
    expect(res.status).toBe(503);
  });

  it('keeps 500 for real errors', async () => {
    const res = await request(setup(new Error('column does not exist')))
      .post('/api/team/login')
      .send({ code: 'TEAM1', password: teamPassword(1) });
    expect(res.status).toBe(500);
  });
});
