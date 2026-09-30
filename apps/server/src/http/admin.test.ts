import sharp from 'sharp';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  TEAM_CODE_ALPHABET,
  TEST_GAME_PREFIX,
  type AdminGame,
} from '@magic-potion/shared';
import { MemoryAdminStore } from '../admin/memoryStore';
import { AdminService } from '../admin/service';
import { createApp } from '../app';
import type { FileStore } from '../uploads/blob';
import { FakeClock } from '../engine/clock';
import { memoryEngine } from '../engine/memoryGame';
import { ADMIN, COFAC, authFixture } from '../testSupport';
import { createApiRouter } from './api';

const T0 = Date.UTC(2026, 8, 28, 9, 0, 0);

function setup(opts: { uploads?: boolean; engineStillPlaying?: boolean } = {}) {
  const fx = authFixture();
  const store = new MemoryAdminStore(fx.store);
  const reloaded: string[] = [];
  const ended: string[][] = [];
  fx.auth.onSessionsEnded((tokenIds) => ended.push(tokenIds));
  const forgotten: string[] = [];
  const admin = new AdminService({
    store,
    auth: fx.auth,
    onLobbyChange: (id) => reloaded.push(id),
    bcryptRounds: { staff: 4, team: 4 },
    forgetGame: async (id) => {
      if (opts.engineStillPlaying) return false;
      forgotten.push(id);
      return true;
    },
    removeGamePhotos: async () => 2,
  });
  const saved: { folder: string; contentType: string; bytes: number }[] = [];
  // Stands in for Vercel Blob: tests never use the real store or its token.
  const files: FileStore = {
    save: async (folder, data, contentType, extension) => {
      saved.push({ folder, contentType, bytes: data.length });
      return `https://blob.example.com/${folder}/random-${saved.length}.${extension}`;
    },
    remove: async () => {},
  };
  const { engine } = memoryEngine({ teams: 3, clock: new FakeClock(T0) });
  const api = createApiRouter({
    auth: fx.auth,
    engine: async () => engine,
    admin,
    files: opts.uploads === false ? undefined : files,
    devTools: false,
  });
  const app = createApp({ clientOrigins: [], api });
  return { ...fx, authStore: fx.store, store, app, reloaded, ended, saved, forgotten };
}

type Setup = ReturnType<typeof setup>;

async function tokenFor(g: Setup, who = ADMIN) {
  const res = await request(g.app)
    .post('/api/staff/login')
    .send({ email: who.email, password: who.password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function call(
  g: Setup,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  body?: object,
  who = ADMIN,
) {
  const req = request(g.app)
    [method](`/api/staff${path}`)
    .set('Authorization', `Bearer ${await tokenFor(g, who)}`);
  return body ? req.send(body) : req;
}

async function newGame(g: Setup, teamCount = 4) {
  const res = await call(g, 'post', '/games', {
    name: 'Acme offsite',
    clientName: 'Acme',
    teamCount,
  });
  expect(res.status).toBe(200);
  return res.body as {
    game: AdminGame;
    logins: { code: string; name: string; password: string }[];
  };
}

describe('creating a game', () => {
  it('makes teams with unique codes and passwords shown once', async () => {
    const g = setup();
    const { game, logins } = await newGame(g, 5);
    expect(game).toMatchObject({ name: 'Acme offsite', phase: 'LOBBY', locked: false });
    expect(game.settings.branding.clientName).toBe('Acme');
    expect(game.settings.funds).toEqual(DEFAULT_SETTINGS.funds);
    expect(game.teams.map((t) => t.name)).toEqual([
      'Team 1',
      'Team 2',
      'Team 3',
      'Team 4',
      'Team 5',
    ]);
    expect(logins).toHaveLength(5);
    const codes = logins.map((l) => l.code);
    expect(new Set(codes).size).toBe(5);
    for (const code of codes) {
      expect([...code].every((c) => TEAM_CODE_ALPHABET.includes(c))).toBe(true);
    }
    // Never a hash, and passwords only in the create reply.
    expect(JSON.stringify(game)).not.toMatch(/passwordHash|\$2[aby]\$/);
    const again = await call(g, 'get', `/games/${game.id}`);
    expect(JSON.stringify(again.body)).not.toContain(logins[0]!.password);
    expect(g.store.audits.at(-1)).toMatchObject({ action: 'CREATE_GAME', staffUserId: ADMIN.id });
  });

  it('lets a new team log in with its code and password', async () => {
    const g = setup();
    const { logins } = await newGame(g);
    const login = logins[2]!;
    const res = await request(g.app)
      .post('/api/team/login')
      .send({ code: login.code.toLowerCase(), password: login.password });
    expect(res.status).toBe(200);
    expect(res.body.teamName).toBe('Team 3');
  });

  it('never repeats a code used in another game', async () => {
    const g = setup();
    const { logins } = await newGame(g, 25);
    const taken = new Set(['TEAM1', 'TEAM2', 'TEAM3']);
    for (const l of logins) expect(taken.has(l.code)).toBe(false);
  });

  it('refuses a team count outside 3 to 25', async () => {
    const g = setup();
    expect((await call(g, 'post', '/games', { name: 'X', teamCount: 2 })).status).toBe(400);
    expect((await call(g, 'post', '/games', { name: 'X', teamCount: 26 })).status).toBe(400);
  });
});

describe('main admin only', () => {
  it('refuses a co-facilitator and a missing login', async () => {
    const g = setup();
    const { game } = await newGame(g);
    const cofac = await call(
      g,
      'put',
      `/games/${game.id}/settings`,
      { settings: DEFAULT_SETTINGS },
      COFAC,
    );
    expect(cofac.status).toBe(403);
    expect((await call(g, 'get', '/users', undefined, COFAC)).status).toBe(403);
    const anon = await request(g.app).get(`/api/staff/games/${game.id}`);
    expect(anon.status).toBe(401);
  });
});

describe('settings', () => {
  it('saves in the Lobby, audits what changed, and reloads the game', async () => {
    const g = setup();
    const { game } = await newGame(g);
    const settings = structuredClone(game.settings);
    settings.phases.round1Seconds = 120;
    settings.branding.primaryColor = '#112233';
    const res = await call(g, 'put', `/games/${game.id}/settings`, { settings });
    expect(res.status).toBe(200);
    expect(res.body.settings.phases.round1Seconds).toBe(120);
    expect(g.reloaded).toEqual([game.id]);
    expect(g.store.audits.at(-1)).toEqual({
      gameId: game.id,
      staffUserId: ADMIN.id,
      action: 'SAVE_SETTINGS',
      before: { 'branding.primaryColor': '#7c3aed', 'phases.round1Seconds': 2100 },
      after: { 'branding.primaryColor': '#112233', 'phases.round1Seconds': 120 },
    });
  });

  it('refuses settings that break the rules', async () => {
    const g = setup();
    const { game } = await newGame(g);
    const settings = structuredClone(game.settings) as unknown as {
      funds: { taskFundsStart: number };
    };
    settings.funds.taskFundsStart = -1;
    expect((await call(g, 'put', `/games/${game.id}/settings`, { settings })).status).toBe(400);
  });

  it('locks every setting once Round 1 has started', async () => {
    const g = setup();
    const { game } = await newGame(g);
    g.store.games.find((x) => x.id === game.id)!.startedAt = new Date(T0);
    const res = await call(g, 'put', `/games/${game.id}/settings`, { settings: game.settings });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The game has started, so this can no longer change.');
    expect((await call(g, 'get', `/games/${game.id}`)).body.locked).toBe(true);
    expect(g.reloaded).toEqual([]);
  });
});

describe('teams', () => {
  it('adds named teams, renames and deletes them in the Lobby', async () => {
    const g = setup();
    const { game } = await newGame(g, 3);
    const added = await call(g, 'post', `/games/${game.id}/teams`, { count: 2, names: ['Owls'] });
    expect(added.status).toBe(200);
    expect(added.body.logins.map((l: { name: string }) => l.name)).toEqual(['Owls', 'Team 5']);
    const owls = (added.body.game as AdminGame).teams.find((t) => t.name === 'Owls')!;

    const renamed = await call(g, 'patch', `/games/${game.id}/teams/${owls.id}`, {
      name: 'Night Owls',
    });
    expect(renamed.body.teams.map((t: { name: string }) => t.name)).toContain('Night Owls');
    const deleted = await call(g, 'delete', `/games/${game.id}/teams/${owls.id}`);
    expect(deleted.body.teams).toHaveLength(4);
    expect(g.store.audits.map((a) => a.action).slice(-3)).toEqual([
      'ADD_TEAMS',
      'RENAME_TEAM',
      'DELETE_TEAM',
    ]);
    expect(g.reloaded).toHaveLength(3);
  });

  it('keeps a game at 25 teams or fewer', async () => {
    const g = setup();
    const { game } = await newGame(g, 24);
    const res = await call(g, 'post', `/games/${game.id}/teams`, { count: 2 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A game can have at most 25 teams.');
  });

  it('does not add or delete teams after the start', async () => {
    const g = setup();
    const { game } = await newGame(g);
    g.store.games.find((x) => x.id === game.id)!.startedAt = new Date(T0);
    expect((await call(g, 'post', `/games/${game.id}/teams`, { count: 1 })).status).toBe(409);
    const teamId = game.teams[0]!.id;
    expect((await call(g, 'delete', `/games/${game.id}/teams/${teamId}`)).status).toBe(409);
  });

  it('refuses a team from another game', async () => {
    const g = setup();
    const { game } = await newGame(g);
    const res = await call(g, 'patch', `/games/${game.id}/teams/team-1`, { name: 'X' });
    expect(res.status).toBe(404);
  });

  it('resets passwords: the old one stops working and open logins end', async () => {
    const g = setup();
    const { game, logins } = await newGame(g);
    const old = logins[0]!;
    const login = await request(g.app)
      .post('/api/team/login')
      .send({ code: old.code, password: old.password });
    expect(login.status).toBe(200);

    const res = await call(g, 'post', `/games/${game.id}/teams/reset-passwords`, {
      teamIds: [game.teams[0]!.id],
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].password).not.toBe(old.password);
    expect(g.ended.flat()).toHaveLength(1);
    expect(await g.auth.verifyTeam(login.body.token)).toMatchObject({ ok: false });

    const oldLogin = await request(g.app)
      .post('/api/team/login')
      .send({ code: old.code, password: old.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(g.app)
      .post('/api/team/login')
      .send({ code: old.code, password: res.body[0].password });
    expect(newLogin.status).toBe(200);
  });

  it('resets every team when none are chosen', async () => {
    const g = setup();
    const { game } = await newGame(g, 3);
    const res = await call(g, 'post', `/games/${game.id}/teams/reset-passwords`, {});
    expect(res.body).toHaveLength(3);
  });
});

describe('staff and assignments', () => {
  it('creates a co-facilitator who can log in, and assigns teams', async () => {
    const g = setup();
    const { game } = await newGame(g);
    const created = await call(g, 'post', '/users', {
      name: 'Priya',
      email: 'Priya@Example.com',
      password: 'start-pass-1',
    });
    expect(created.status).toBe(200);
    expect(created.body).toEqual({
      id: expect.any(String),
      name: 'Priya',
      email: 'priya@example.com',
      role: 'CO_FACILITATOR',
      active: true,
    });
    const priya = { id: created.body.id, email: 'priya@example.com', password: 'start-pass-1' };
    await tokenFor(g, priya);

    const teamIds = game.teams.slice(0, 2).map((t) => t.id);
    const assigned = await call(g, 'put', `/games/${game.id}/assignments`, {
      staffUserId: priya.id,
      teamIds,
    });
    expect(assigned.body.assignments[priya.id]).toEqual(teamIds);
    const games = await call(g, 'get', '/games', undefined, priya);
    expect(games.body.map((x: { id: string }) => x.id)).toEqual([game.id]);
  });

  it('refuses a duplicate email', async () => {
    const g = setup();
    const res = await call(g, 'post', '/users', {
      name: 'Again',
      email: COFAC.email.toUpperCase(),
      password: 'long-enough',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Someone already uses that email.');
  });

  it('switches a co-facilitator off and resets their password', async () => {
    const g = setup();
    const reset = await call(g, 'post', `/users/${COFAC.id}/password`, { password: 'new-pass-22' });
    expect(reset.status).toBe(200);
    await tokenFor(g, { ...COFAC, password: 'new-pass-22' });
    const off = await call(g, 'patch', `/users/${COFAC.id}`, { active: false });
    expect(off.body.active).toBe(false);
    const login = await request(g.app)
      .post('/api/staff/login')
      .send({ email: COFAC.email, password: 'new-pass-22' });
    expect(login.status).toBe(401);
  });

  it('does not let the admin switch off their own account', async () => {
    const g = setup();
    const res = await call(g, 'patch', `/users/${ADMIN.id}`, { active: false });
    expect(res.status).toBe(400);
  });

  it('only gives teams to an active co-facilitator, and only teams of this game', async () => {
    const g = setup();
    const { game } = await newGame(g);
    const toAdmin = await call(g, 'put', `/games/${game.id}/assignments`, {
      staffUserId: ADMIN.id,
      teamIds: [],
    });
    expect(toAdmin.status).toBe(400);
    const otherGame = await call(g, 'put', `/games/${game.id}/assignments`, {
      staffUserId: COFAC.id,
      teamIds: ['team-1'],
    });
    expect(otherGame.status).toBe(404);
  });
});

describe('live-site test clean-up (Phase 7C)', () => {
  const TEST_NAME = `${TEST_GAME_PREFIX}2026-10-01 10:00`;

  async function testGame(g: Setup, name = TEST_NAME) {
    const res = await call(g, 'post', '/games', { name, clientName: 'Test', teamCount: 3 });
    expect(res.status).toBe(200);
    return (res.body as { game: AdminGame }).game;
  }

  const play = (g: Setup, gameId: string, phase: AdminGame['phase'], ended = false) => {
    const stored = g.store.games.find((x) => x.id === gameId)!;
    stored.phase = phase;
    stored.startedAt = new Date(T0);
    stored.endedAt = ended ? new Date(T0 + 60_000) : null;
  };

  it('deletes a finished test game with its teams, photos and audit lines', async () => {
    const g = setup();
    const game = await testGame(g);
    play(g, game.id, 'REVEAL', true);
    const res = await call(g, 'post', `/games/${game.id}/delete-test-game`, {
      confirmName: TEST_NAME,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ teams: 3, photos: 2 });
    expect(g.forgotten).toEqual([game.id]);
    expect(g.store.games.some((x) => x.id === game.id)).toBe(false);
    expect(g.authStore.teams.some((t) => t.gameId === game.id)).toBe(false);
    expect(g.store.audits.some((a) => a.gameId === game.id)).toBe(false);
    expect(g.store.audits.at(-1)).toMatchObject({ gameId: null, action: 'DELETE_TEST_GAME' });
  });

  it('deletes a test game that never started', async () => {
    const g = setup();
    const game = await testGame(g);
    const res = await call(g, 'post', `/games/${game.id}/delete-test-game`, {
      confirmName: TEST_NAME,
    });
    expect(res.status).toBe(200);
  });

  it('never deletes a real game, even a finished one', async () => {
    const g = setup();
    const { game } = await newGame(g);
    play(g, game.id, 'REVEAL', true);
    const res = await call(g, 'post', `/games/${game.id}/delete-test-game`, {
      confirmName: 'Acme offsite',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_A_TEST_GAME');
    expect(g.store.games.some((x) => x.id === game.id)).toBe(true);
    expect(g.forgotten).toEqual([]);
  });

  it('refuses a similar name and a name typed wrongly', async () => {
    const g = setup();
    const lookalike = await testGame(g, 'LOADTEST 2026-10-01');
    const a = await call(g, 'post', `/games/${lookalike.id}/delete-test-game`, {
      confirmName: 'LOADTEST 2026-10-01',
    });
    expect(a.body.code).toBe('NOT_A_TEST_GAME');
    const game = await testGame(g);
    const b = await call(g, 'post', `/games/${game.id}/delete-test-game`, {
      confirmName: `${TEST_NAME}x`,
    });
    expect(b.body.code).toBe('NAME_MISMATCH');
    expect(g.store.games).toHaveLength(2);
  });

  it('refuses a test game that is still being played', async () => {
    const g = setup();
    const game = await testGame(g);
    play(g, game.id, 'ROUND1');
    const res = await call(g, 'post', `/games/${game.id}/delete-test-game`, {
      confirmName: TEST_NAME,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TEST_GAME_RUNNING');
    expect(g.store.games.some((x) => x.id === game.id)).toBe(true);
  });

  it('refuses when the running server still plays the game', async () => {
    const g = setup({ engineStillPlaying: true });
    const game = await testGame(g);
    play(g, game.id, 'REVEAL', true);
    const res = await call(g, 'post', `/games/${game.id}/delete-test-game`, {
      confirmName: TEST_NAME,
    });
    expect(res.body.code).toBe('TEST_GAME_RUNNING');
    expect(g.store.games.some((x) => x.id === game.id)).toBe(true);
  });

  it('is for the main admin only', async () => {
    const g = setup();
    const game = await testGame(g);
    const res = await call(
      g,
      'post',
      `/games/${game.id}/delete-test-game`,
      { confirmName: TEST_NAME },
      COFAC,
    );
    expect(res.status).toBe(403);
  });

  it('deletes a test co-facilitator once their test game is gone', async () => {
    const g = setup();
    const game = await testGame(g);
    const made = await call(g, 'post', '/users', {
      name: 'Load test 1',
      email: 'loadtest-1@zrutam.invalid',
      password: 'random-pass-1',
    });
    await call(g, 'put', `/games/${game.id}/assignments`, {
      staffUserId: made.body.id,
      teamIds: [game.teams[0]!.id],
    });
    const early = await call(g, 'delete', `/users/${made.body.id}`);
    expect(early.body.code).toBe('TEST_STAFF_IN_GAME');

    await call(g, 'post', `/games/${game.id}/delete-test-game`, { confirmName: TEST_NAME });
    const res = await call(g, 'delete', `/users/${made.body.id}`);
    expect(res.status).toBe(200);
    expect(g.authStore.staff.some((s) => s.id === made.body.id)).toBe(false);
    expect(g.store.audits.at(-1)).toMatchObject({ gameId: null, action: 'DELETE_TEST_STAFF' });
  });

  it('never deletes a real co-facilitator or the main admin', async () => {
    const g = setup();
    const real = await call(g, 'delete', `/users/${COFAC.id}`);
    expect(real.body.code).toBe('NOT_TEST_STAFF');
    const me = await call(g, 'delete', `/users/${ADMIN.id}`);
    expect(me.body.code).toBe('NOT_TEST_STAFF');
    const lookalike = await call(g, 'post', '/users', {
      name: 'Almost',
      email: 'loadtest-1@zrutam.com',
      password: 'random-pass-1',
    });
    const res = await call(g, 'delete', `/users/${lookalike.body.id}`);
    expect(res.body.code).toBe('NOT_TEST_STAFF');
    expect(g.authStore.staff).toHaveLength(3);
  });
});

describe('logo upload', () => {
  const png = () =>
    sharp({ create: { width: 64, height: 64, channels: 4, background: '#ff0000' } })
      .png()
      .toBuffer();

  async function upload(g: Setup, data: Buffer, who = ADMIN) {
    return request(g.app)
      .post('/api/staff/uploads/logo')
      .set('Authorization', `Bearer ${await tokenFor(g, who)}`)
      .set('Content-Type', 'image/png')
      .send(data);
  }

  it('saves a cleaned WebP under a random name', async () => {
    const g = setup();
    const res = await upload(g, await png());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      url: 'https://blob.example.com/logos/random-1.webp',
      width: 64,
      height: 64,
    });
    expect(g.saved).toEqual([
      { folder: 'logos', contentType: 'image/webp', bytes: expect.any(Number) },
    ]);
  });

  it('refuses a file that is not a picture', async () => {
    const g = setup();
    const res = await upload(g, Buffer.from('<svg></svg>'));
    expect(res.status).toBe(400);
    expect(g.saved).toEqual([]);
  });

  it('refuses a file over 5 MB', async () => {
    const g = setup();
    const res = await upload(g, Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
    expect(res.body.message).toBe('That picture is too big. The limit is 5 MB.');
  });

  it('is for the main admin only', async () => {
    const g = setup();
    expect((await upload(g, await png(), COFAC)).status).toBe(403);
  });

  it('says so when uploads are not set up', async () => {
    const g = setup({ uploads: false });
    const res = await upload(g, await png());
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Uploads are not set up on this server.');
  });
});
