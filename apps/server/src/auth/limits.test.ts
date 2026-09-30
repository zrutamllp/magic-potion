import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { FakeClock } from '../engine/clock';
import { memoryEngine } from '../engine/memoryGame';
import { createApiRouter } from '../http/api';
import { ADMIN, authFixture, teamPassword } from '../testSupport';
import { AuthService, DEFAULT_LOGIN_LIMITS } from './service';

// Login limits (Phase 7A). A whole room of teams can sit behind one office Wi-Fi address, so
// only the per-code limit is tight; the limit across all codes from one address only stops
// real attacks; staff can clear a game's limits at once.

const MIN = 60_000;
const ROOM = '10.0.0.1';

function limited(teams = 3) {
  const clock = new FakeClock(Date.UTC(2026, 8, 30, 9, 0, 0));
  const fx = authFixture(teams);
  const auth = new AuthService(fx.store, fx.tokens, DEFAULT_LOGIN_LIMITS, () => clock.now());
  const team = (i: number, password = teamPassword(i), ip = ROOM) =>
    auth.loginTeam({ code: `TEAM${i}`, password }, ip);
  const staff = (password: string, ip = ROOM) =>
    auth.loginStaff({ email: ADMIN.email, password }, ip);
  return { auth, clock, team, staff };
}

describe('team login limits', () => {
  it('blocks one team code after 10 wrong passwords from one address, for 5 minutes', async () => {
    const g = limited();
    for (let i = 0; i < 10; i++) {
      expect(await g.team(1, 'wrong')).toMatchObject({ status: 401 });
    }
    expect(await g.team(1)).toMatchObject({ status: 429, code: 'TOO_MANY_TRIES' });
    expect(await g.team(1)).toMatchObject({
      message: 'Too many tries. Please wait a few minutes and try again.',
    });
    // Other teams in the same room, and the same team elsewhere, are not blocked.
    expect((await g.team(2)).ok).toBe(true);
    expect((await g.team(1, teamPassword(1), '10.9.9.9')).ok).toBe(true);
    g.clock.advance(5 * MIN);
    expect((await g.team(1)).ok).toBe(true);
  });

  it('lets 20 teams behind one address all log in after each mistypes 3 times', async () => {
    const g = limited(20);
    for (let i = 1; i <= 20; i++) {
      for (let t = 0; t < 3; t++) expect(await g.team(i, 'typo')).toMatchObject({ status: 401 });
    }
    for (let i = 1; i <= 20; i++) expect((await g.team(i)).ok).toBe(true);
  });

  it('stops an attack trying code after code from one address at 200 failures', async () => {
    const g = limited(25);
    // 25 codes x 8 tries: no single code reaches its limit of 10.
    for (let i = 1; i <= 25; i++) {
      for (let t = 0; t < 8; t++) await g.team(i, 'guess');
    }
    expect(await g.team(1)).toMatchObject({ code: 'TOO_MANY_TRIES' });
    expect(await g.team(2)).toMatchObject({ code: 'TOO_MANY_TRIES' });
    // Only that address.
    expect((await g.team(1, teamPassword(1), '10.9.9.9')).ok).toBe(true);
    g.clock.advance(10 * MIN);
    expect((await g.team(1)).ok).toBe(true);
  });

  it('can be cleared at once by staff (Unblock logins)', async () => {
    const g = limited(25);
    for (let t = 0; t < 10; t++) await g.team(1, 'wrong');
    expect(await g.team(1)).toMatchObject({ code: 'TOO_MANY_TRIES' });
    expect(g.auth.unblockTeamLogins(['TEAM1', 'TEAM2'])).toBeGreaterThan(0);
    expect((await g.team(1)).ok).toBe(true);

    for (let i = 1; i <= 25; i++) for (let t = 0; t < 8; t++) await g.team(i, 'guess');
    expect(await g.team(3)).toMatchObject({ code: 'TOO_MANY_TRIES' });
    g.auth.unblockTeamLogins(['TEAM3']);
    expect((await g.team(3)).ok).toBe(true);
  });
});

describe('staff login limits', () => {
  it('blocks one staff email after 5 wrong passwords from anywhere, for 15 minutes', async () => {
    const g = limited();
    for (let i = 0; i < 5; i++) {
      expect(await g.staff('wrong', `10.0.0.${i + 10}`)).toMatchObject({ status: 401 });
    }
    expect(await g.staff(ADMIN.password, '10.8.8.8')).toMatchObject({ code: 'TOO_MANY_TRIES' });
    g.clock.advance(15 * MIN);
    expect((await g.staff(ADMIN.password)).ok).toBe(true);
  });

  it('forgets earlier mistakes after a good login', async () => {
    const g = limited();
    for (let i = 0; i < 4; i++) await g.staff('wrong');
    expect((await g.staff(ADMIN.password)).ok).toBe(true);
    for (let i = 0; i < 4; i++) await g.staff('wrong');
    expect((await g.staff(ADMIN.password)).ok).toBe(true);
  });
});

describe('behind the Render proxy', () => {
  it('counts each player’s own address, not the proxy’s', async () => {
    const fx = authFixture();
    const { engine } = memoryEngine({ teams: 3, clock: new FakeClock(Date.now()) });
    const api = createApiRouter({ auth: fx.auth, engine: async () => engine, devTools: false });
    const app = createApp({ clientOrigins: [], api });
    const login = (forwardedFor: string, password: string) =>
      request(app)
        .post('/api/team/login')
        .set('X-Forwarded-For', forwardedFor)
        .send({ code: 'TEAM1', password });
    for (let i = 0; i < 10; i++) await login('203.0.113.1', 'wrong');
    expect((await login('203.0.113.1', teamPassword(1))).status).toBe(429);
    expect((await login('198.51.100.7', teamPassword(1))).status).toBe(200);
  });
});
