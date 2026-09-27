import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { LoginRateLimiter } from '../auth/rateLimit';
import { AuthService } from '../auth/service';
import { FakeClock } from '../engine/clock';
import { memoryEngine } from '../engine/memoryGame';
import { ADMIN, COFAC, authFixture, teamPassword } from '../testSupport';
import { createApiRouter } from './api';

const T0 = Date.UTC(2026, 8, 27, 9, 0, 0);

function setup(opts: { devTools?: boolean } = {}) {
  const fx = authFixture();
  const { engine } = memoryEngine({ teams: 3, clock: new FakeClock(T0) });
  const ended: { tokenIds: string[]; code: string }[] = [];
  fx.auth.onSessionsEnded((tokenIds, code) => ended.push({ tokenIds, code }));
  const api = createApiRouter({
    auth: fx.auth,
    engine: async (gameId) => {
      if (gameId !== 'game-1') throw new Error('no such game');
      return engine;
    },
    devTools: opts.devTools ?? false,
  });
  const app = createApp({ clientOrigins: [], api });
  return { ...fx, app, engine, ended };
}

async function staffToken(app: ReturnType<typeof setup>['app'], who = ADMIN) {
  const res = await request(app)
    .post('/api/staff/login')
    .send({ email: who.email, password: who.password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

describe('team login', () => {
  it('logs in with code and password and opens one session', async () => {
    const g = setup();
    const res = await request(g.app)
      .post('/api/team/login')
      .send({ code: 'team1', password: teamPassword(1) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ teamId: 'team-1', teamName: 'Team 1', gameId: 'game-1' });
    expect(res.body).not.toHaveProperty('passwordHash');
    const verified = await g.auth.verifyTeam(res.body.token);
    expect(verified).toMatchObject({ ok: true, value: { teamId: 'team-1' } });
  });

  it('refuses a wrong password or code with the same message', async () => {
    const g = setup();
    const wrongPw = await request(g.app)
      .post('/api/team/login')
      .send({ code: 'TEAM1', password: 'nope' });
    const wrongCode = await request(g.app)
      .post('/api/team/login')
      .send({ code: 'TEAM9', password: 'nope' });
    expect(wrongPw.status).toBe(401);
    expect(wrongCode.status).toBe(401);
    expect(wrongPw.body.message).toBe(wrongCode.body.message);
  });

  it('refuses a malformed body', async () => {
    const g = setup();
    const res = await request(g.app).post('/api/team/login').send({ code: '' });
    expect(res.status).toBe(400);
  });

  it('ends the older session when the team logs in again', async () => {
    const g = setup();
    const login = () =>
      request(g.app)
        .post('/api/team/login')
        .send({ code: 'TEAM1', password: teamPassword(1) });
    const first = await login();
    const second = await login();
    expect(await g.auth.verifyTeam(first.body.token)).toMatchObject({
      ok: false,
      code: 'SESSION_ENDED',
    });
    expect((await g.auth.verifyTeam(second.body.token)).ok).toBe(true);
    expect(g.ended).toHaveLength(1);
    expect(g.ended[0]?.code).toBe('SESSION_REPLACED');
    expect(g.store.sessions.filter((s) => s.endedAt === null)).toHaveLength(1);
  });

  it('refuses a code shared by two live games', async () => {
    const g = setup();
    g.store.games.push({ id: 'game-2', name: 'Other', phase: 'LOBBY' });
    g.store.teams.push({ ...g.store.teams[0]!, id: 'other-team', gameId: 'game-2' });
    const res = await request(g.app)
      .post('/api/team/login')
      .send({ code: 'TEAM1', password: teamPassword(1) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('AMBIGUOUS_TEAM_CODE');
  });

  it('ignores teams in games that have ended', async () => {
    const g = setup();
    g.store.games[0]!.ended = true;
    const res = await request(g.app)
      .post('/api/team/login')
      .send({ code: 'TEAM1', password: teamPassword(1) });
    expect(res.status).toBe(401);
  });

  it('refuses tokens that are forged or for staff', async () => {
    const g = setup();
    expect((await g.auth.verifyTeam('not-a-token')).ok).toBe(false);
    const staff = g.tokens.signStaff({ staffUserId: ADMIN.id });
    expect((await g.auth.verifyTeam(staff)).ok).toBe(false);
    const unknownSession = g.tokens.signTeam({
      teamId: 'team-1',
      gameId: 'game-1',
      tokenId: 'made-up',
    });
    expect((await g.auth.verifyTeam(unknownSession)).ok).toBe(false);
  });
});

describe('login rate limit', () => {
  it('blocks after too many failures, then allows again after the window', async () => {
    let now = T0;
    const fx = authFixture();
    const auth = new AuthService(
      fx.store,
      fx.tokens,
      new LoginRateLimiter({ maxFailures: 3, windowMs: 60_000, now: () => now }),
    );
    const bad = { code: 'TEAM1', password: 'wrong' };
    for (let i = 0; i < 3; i++)
      expect(await auth.loginTeam(bad, '1.2.3.4')).toMatchObject({ status: 401 });
    const good = { code: 'TEAM1', password: teamPassword(1) };
    expect(await auth.loginTeam(good, '1.2.3.4')).toMatchObject({ code: 'TOO_MANY_TRIES' });
    // Another address is not blocked.
    expect((await auth.loginTeam(good, '5.6.7.8')).ok).toBe(true);
    now += 60_000;
    expect((await auth.loginTeam(good, '1.2.3.4')).ok).toBe(true);
  });
});

describe('staff', () => {
  it('logs in and reads its own account', async () => {
    const g = setup({ devTools: true });
    const token = await staffToken(g.app);
    const me = await request(g.app).get('/api/staff/me').set('Authorization', `Bearer ${token}`);
    expect(me.body).toEqual({
      id: ADMIN.id,
      name: 'Main admin',
      role: 'MAIN_ADMIN',
      devTools: true,
    });
  });

  it('refuses a wrong password and an inactive account', async () => {
    const g = setup();
    const wrong = await request(g.app)
      .post('/api/staff/login')
      .send({ email: ADMIN.email, password: 'nope' });
    expect(wrong.status).toBe(401);
    g.store.staff[0]!.active = false;
    const inactive = await request(g.app)
      .post('/api/staff/login')
      .send({ email: ADMIN.email, password: ADMIN.password });
    expect(inactive.status).toBe(401);
  });

  it('needs a staff token for staff routes', async () => {
    const g = setup();
    expect((await request(g.app).get('/api/staff/games')).status).toBe(401);
    const team = await request(g.app)
      .post('/api/team/login')
      .send({ code: 'TEAM1', password: teamPassword(1) });
    const res = await request(g.app)
      .get('/api/staff/games')
      .set('Authorization', `Bearer ${team.body.token}`);
    expect(res.status).toBe(401);
  });

  it('lets the main admin start, pause, resume and extend the game', async () => {
    const g = setup();
    const auth = { Authorization: `Bearer ${await staffToken(g.app)}` };
    const post = (path: string, body?: object) =>
      request(g.app).post(`/api/staff/games/game-1/${path}`).set(auth).send(body);
    expect((await post('start')).body).toMatchObject({ ok: true });
    expect(g.engine.state.phase).toBe('ROUND1');
    expect((await post('freeze')).status).toBe(200);
    expect(g.engine.state.frozenAt).not.toBeNull();
    const again = await post('freeze');
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('The game is already paused.');
    await post('resume');
    expect((await post('extend', { seconds: 60 })).status).toBe(200);
    expect(g.engine.state.extensionSeconds).toBe(60);
    expect((await post('end-phase')).status).toBe(200);
    expect(g.engine.state.phase).toBe('PAUSE');
    // The engine audits staff actions with the staff account id.
    expect((await request(g.app).post('/api/staff/games/nope/start').set(auth)).status).toBe(404);
  });

  it('does not let a co-facilitator control the game', async () => {
    const g = setup();
    const token = await staffToken(g.app, COFAC);
    const res = await request(g.app)
      .post('/api/staff/games/game-1/start')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(g.engine.state.phase).toBe('LOBBY');
  });

  it('lists games by role', async () => {
    const g = setup();
    g.store.games.push({ id: 'game-2', name: 'Other', phase: 'LOBBY' });
    const admin = await request(g.app)
      .get('/api/staff/games')
      .set('Authorization', `Bearer ${await staffToken(g.app)}`);
    expect(admin.body).toHaveLength(2);
    const cofac = await request(g.app)
      .get('/api/staff/games')
      .set('Authorization', `Bearer ${await staffToken(g.app, COFAC)}`);
    expect(cofac.body.map((x: { id: string }) => x.id)).toEqual(['game-1']);
  });

  it('ends a team session for assigned teams only, and audits it', async () => {
    const g = setup();
    const team = await request(g.app)
      .post('/api/team/login')
      .send({ code: 'TEAM2', password: teamPassword(2) });
    const cofac = { Authorization: `Bearer ${await staffToken(g.app, COFAC)}` };
    const blocked = await request(g.app).post('/api/staff/teams/team-2/end-session').set(cofac);
    expect(blocked.status).toBe(403);
    const admin = { Authorization: `Bearer ${await staffToken(g.app)}` };
    const ok = await request(g.app).post('/api/staff/teams/team-2/end-session').set(admin);
    expect(ok.status).toBe(200);
    expect(await g.auth.verifyTeam(team.body.token)).toMatchObject({ code: 'SESSION_ENDED' });
    expect(g.store.audits).toEqual([
      expect.objectContaining({
        action: 'END_TEAM_SESSION',
        teamId: 'team-2',
        staffUserId: ADMIN.id,
      }),
    ]);
    expect(g.ended.at(-1)).toMatchObject({ code: 'SESSION_ENDED' });
  });

  it('has the dev route only when dev tools are on', async () => {
    const off = setup();
    const offAuth = { Authorization: `Bearer ${await staffToken(off.app)}` };
    await request(off.app).post('/api/staff/games/game-1/start').set(offAuth);
    const missing = await request(off.app)
      .post('/api/staff/games/game-1/dev/finish-tasks/team-1')
      .set(offAuth);
    expect(missing.status).toBe(404);

    const on = setup({ devTools: true });
    const onAuth = { Authorization: `Bearer ${await staffToken(on.app)}` };
    await request(on.app).post('/api/staff/games/game-1/start').set(onAuth);
    const res = await request(on.app)
      .post('/api/staff/games/game-1/dev/finish-tasks/team-1')
      .set(onAuth);
    expect(res.body).toMatchObject({ ok: true, value: { solved: 5 } });
    expect(on.engine.potion().completedTeams).toBe(1);
  });
});
