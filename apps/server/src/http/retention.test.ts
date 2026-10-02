import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AdminGame } from '@magic-potion/shared';
import { MemoryAdminStore } from '../admin/memoryStore';
import { AdminService } from '../admin/service';
import { createApp } from '../app';
import { FakeClock } from '../engine/clock';
import { memoryEngine } from '../engine/memoryGame';
import { ADMIN, COFAC, authFixture } from '../testSupport';
import { createApiRouter } from './api';

// Game data is deleted a number of days after the game (default 90), or at once with
// "Delete played game now". Both use the same deletion and leave the same record.

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1, 9, 0, 0);

function setup(opts: { photosFail?: boolean } = {}) {
  const fx = authFixture();
  const store = new MemoryAdminStore(fx.store);
  // Deletion was switched on long ago, so the first-run floor plays no part here.
  store.retentionSinceAt = T0 - 1000 * DAY;
  const clock = { now: T0 };
  const forgotten: { gameId: string; force: boolean }[] = [];
  const photosRemoved: string[] = [];
  const admin = new AdminService({
    store,
    auth: fx.auth,
    bcryptRounds: { staff: 4, team: 4 },
    now: () => clock.now,
    forgetGame: async (gameId, force = false) => {
      forgotten.push({ gameId, force });
      return true;
    },
    removeGamePhotos: async (gameId) => {
      if (opts.photosFail) throw new Error('Blob store is down');
      photosRemoved.push(gameId);
      return 2;
    },
  });
  const { engine } = memoryEngine({ teams: 3, clock: new FakeClock(T0) });
  const api = createApiRouter({
    auth: fx.auth,
    engine: async () => engine,
    admin,
    devTools: false,
  });
  const app = createApp({ clientOrigins: [], api });
  return { ...fx, authStore: fx.store, store, admin, app, clock, forgotten, photosRemoved };
}

type Setup = ReturnType<typeof setup>;

async function call(
  g: Setup,
  method: 'get' | 'put' | 'post' | 'delete',
  path: string,
  body?: object,
  who = ADMIN,
) {
  const login = await request(g.app)
    .post('/api/staff/login')
    .send({ email: who.email, password: who.password });
  const req = request(g.app)
    [method](`/api/staff${path}`)
    .set('Authorization', `Bearer ${login.body.token as string}`);
  return body ? req.send(body) : req;
}

async function newGame(g: Setup, name: string) {
  const res = await call(g, 'post', '/games', { name, clientName: 'Acme', teamCount: 3 });
  expect(res.status).toBe(200);
  return (res.body as { game: AdminGame }).game;
}

// Puts a game into a phase. "ended" presses End game at that time.
function play(
  g: Setup,
  gameId: string,
  phase: AdminGame['phase'],
  opts: { endedAt?: number; frozen?: boolean; lastActivityAt?: number } = {},
) {
  const stored = g.store.games.find((x) => x.id === gameId)!;
  stored.phase = phase;
  stored.startedAt = new Date(T0);
  stored.endedAt = opts.endedAt === undefined ? null : new Date(opts.endedAt);
  stored.frozenAt = opts.frozen ? new Date(T0) : null;
  stored.lastActivityAt = opts.lastActivityAt ?? T0;
}

const exists = (g: Setup, gameId: string) => g.store.games.some((x) => x.id === gameId);

describe('Delete game data after (days)', () => {
  it('is 90 days by default and shows the date', async () => {
    const g = setup();
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, 'REVEAL', { endedAt: T0 });
    const res = await call(g, 'get', `/games/${game.id}`);
    expect(res.body.settings.retention.gameDataDays).toBe(90);
    expect(res.body.dataDeleteAt).toBe(new Date(T0 + 90 * DAY).toISOString());
    expect(res.body.dataDeleteFrom).toBe('ended');
  });

  it('can still be changed after the game has started, and is audited', async () => {
    const g = setup();
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, 'REVEAL', { endedAt: T0 });
    g.clock.now = T0 + DAY;
    const res = await call(g, 'put', `/games/${game.id}/data-retention`, { days: 120 });
    expect(res.status).toBe(200);
    expect(res.body.settings.retention.gameDataDays).toBe(120);
    expect(res.body.dataDeleteAt).toBe(new Date(T0 + 120 * DAY).toISOString());
    expect(g.store.audits.at(-1)).toMatchObject({
      gameId: game.id,
      staffUserId: ADMIN.id,
      action: 'SET_DATA_RETENTION',
      before: { gameDataDays: 90 },
      after: { gameDataDays: 120 },
    });
    // Every other setting stays locked.
    const settings = await call(g, 'put', `/games/${game.id}/settings`, {
      settings: res.body.settings,
    });
    expect(settings.status).toBe(409);
  });

  it('refuses a value that would delete the data within 7 days', async () => {
    const g = setup();
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, 'REVEAL', { endedAt: T0 });
    g.clock.now = T0 + 85 * DAY;
    const soon = await call(g, 'put', `/games/${game.id}/data-retention`, { days: 90 });
    expect(soon.status).toBe(400);
    expect(soon.body.code).toBe('RETENTION_TOO_SOON');
    expect(soon.body.message).toBe(
      'That would delete the data within 7 days. Use Delete played game now instead.',
    );
    const later = await call(g, 'put', `/games/${game.id}/data-retention`, { days: 100 });
    expect(later.status).toBe(200);
  });

  it('allows only 7 to 365 days, and only for the main admin', async () => {
    const g = setup();
    const game = await newGame(g, 'Acme offsite');
    expect((await call(g, 'put', `/games/${game.id}/data-retention`, { days: 6 })).status).toBe(
      400,
    );
    expect((await call(g, 'put', `/games/${game.id}/data-retention`, { days: 366 })).status).toBe(
      400,
    );
    const cofac = await call(g, 'put', `/games/${game.id}/data-retention`, { days: 30 }, COFAC);
    expect(cofac.status).toBe(403);
  });
});

describe('Delete played game now', () => {
  it.each([
    ['ROUND1', {}],
    ['PAUSE', {}],
    ['ROUND2', {}],
    ['ROUND2', { frozen: true }],
    ['REVEAL', { frozen: true }],
  ] as const)('never deletes a game in %s %o', async (phase, opts) => {
    const g = setup();
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, phase, opts);
    const res = await call(g, 'delete', `/games/${game.id}`, { confirmName: 'Acme offsite' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_ENDED');
    expect(res.body.message).toBe(
      'End the game first. A game being played or paused cannot be deleted.',
    );
    expect(exists(g, game.id)).toBe(true);
    expect(g.forgotten).toEqual([]);
    expect(g.photosRemoved).toEqual([]);
  });

  it('deletes a finished game, its teams, photos and audit lines, and nothing else', async () => {
    const g = setup();
    const keep = await newGame(g, 'Other game');
    play(g, keep.id, 'REVEAL', { endedAt: T0 });
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, 'REVEAL');
    const keepTeams = g.authStore.teams.filter((t) => t.gameId === keep.id).length;
    const keepAudits = g.store.audits.filter((a) => a.gameId === keep.id).length;

    const wrong = await call(g, 'delete', `/games/${game.id}`, { confirmName: 'acme offsite' });
    expect(wrong.status).toBe(400);
    expect(exists(g, game.id)).toBe(true);

    const res = await call(g, 'delete', `/games/${game.id}`, { confirmName: 'Acme offsite' });
    expect(res.status).toBe(200);
    expect(exists(g, game.id)).toBe(false);
    expect(g.authStore.teams.some((t) => t.gameId === game.id)).toBe(false);
    expect(g.store.audits.some((a) => a.gameId === game.id)).toBe(false);
    expect(g.photosRemoved).toEqual([game.id]);
    expect(g.forgotten).toEqual([{ gameId: game.id, force: false }]);
    // The other game is untouched.
    expect(exists(g, keep.id)).toBe(true);
    expect(g.authStore.teams.filter((t) => t.gameId === keep.id)).toHaveLength(keepTeams);
    expect(g.store.audits.filter((a) => a.gameId === keep.id)).toHaveLength(keepAudits);
  });

  it('deletes an ended game too', async () => {
    const g = setup();
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, 'REVEAL', { endedAt: T0 });
    const res = await call(g, 'delete', `/games/${game.id}`, { confirmName: 'Acme offsite' });
    expect(res.status).toBe(200);
    expect(exists(g, game.id)).toBe(false);
  });

  it('leaves a deletion record and an audit line with no personal data', async () => {
    const g = setup();
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, 'REVEAL', { endedAt: T0 });
    const teams = g.authStore.teams.filter((t) => t.gameId === game.id);
    g.clock.now = T0 + 2 * DAY;
    await call(g, 'delete', `/games/${game.id}`, { confirmName: 'Acme offsite' });

    expect(g.store.deletions).toEqual([
      {
        gameId: game.id,
        gameName: 'Acme offsite',
        deletedAt: new Date(T0 + 2 * DAY),
        deletedBy: ADMIN.id,
        counts: expect.objectContaining({ teams: 3, photos: 2 }),
      },
    ]);
    const audit = g.store.audits.at(-1)!;
    expect(audit).toEqual({
      gameId: null,
      staffUserId: ADMIN.id,
      action: 'DELETE_GAME',
      before: { id: game.id, name: 'Acme offsite', played: true },
    });
    const kept = JSON.stringify([g.store.deletions, audit]);
    for (const t of teams) {
      expect(kept).not.toContain(t.code);
      expect(kept).not.toContain(t.name);
    }
  });

  it('deletes nothing when the photos cannot be removed', async () => {
    const g = setup({ photosFail: true });
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, 'REVEAL', { endedAt: T0 });
    const res = await call(g, 'delete', `/games/${game.id}`, { confirmName: 'Acme offsite' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PHOTOS_NOT_REMOVED');
    expect(exists(g, game.id)).toBe(true);
    expect(g.store.deletions).toEqual([]);
  });

  it('is for the main admin only', async () => {
    const g = setup();
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, 'REVEAL', { endedAt: T0 });
    const res = await call(
      g,
      'delete',
      `/games/${game.id}`,
      { confirmName: 'Acme offsite' },
      COFAC,
    );
    expect(res.status).toBe(403);
    expect(exists(g, game.id)).toBe(true);
  });
});

describe('automatic deletion', () => {
  it('deletes an ended game once its days have passed, and not a moment before', async () => {
    const g = setup();
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, 'REVEAL', { endedAt: T0 });
    g.clock.now = T0 + 90 * DAY - 1;
    expect(await g.admin.deleteDueGameData()).toEqual([]);
    expect(exists(g, game.id)).toBe(true);
    g.clock.now = T0 + 90 * DAY;
    expect(await g.admin.deleteDueGameData()).toEqual([game.id]);
    expect(exists(g, game.id)).toBe(false);
    expect(g.store.deletions[0]).toMatchObject({ gameId: game.id, deletedBy: 'auto' });
    expect(g.photosRemoved).toEqual([game.id]);
  });

  it('never deletes a game that never started', async () => {
    const g = setup();
    const game = await newGame(g, 'Acme offsite');
    g.clock.now = T0 + 1000 * DAY;
    expect(await g.admin.deleteDueGameData()).toEqual([]);
    expect(exists(g, game.id)).toBe(true);
  });

  it.each([
    ['ROUND2', false],
    ['ROUND2', true],
    ['REVEAL', false],
  ] as const)(
    'keeps an un-ended game in %s (paused: %s) while it is active, and deletes it after the days pass with no activity',
    async (phase, frozen) => {
      const g = setup();
      const game = await newGame(g, 'Acme offsite');
      const last = T0 + 10 * DAY;
      play(g, game.id, phase, { frozen, lastActivityAt: last });
      g.clock.now = T0 + 95 * DAY;
      expect(await g.admin.deleteDueGameData()).toEqual([]);
      expect(exists(g, game.id)).toBe(true);
      g.clock.now = last + 90 * DAY;
      expect(await g.admin.deleteDueGameData()).toEqual([game.id]);
      expect(exists(g, game.id)).toBe(false);
      // An abandoned game is dropped from the server even mid-round.
      expect(g.forgotten).toEqual([{ gameId: game.id, force: true }]);
    },
  );

  it('waits at least 7 days after deletion is first switched on', async () => {
    const g = setup();
    g.store.retentionSinceAt = null;
    const game = await newGame(g, 'Acme offsite');
    play(g, game.id, 'REVEAL', { endedAt: T0 });
    g.clock.now = T0 + 400 * DAY;
    expect(await g.admin.deleteDueGameData()).toEqual([]);
    expect(g.store.retentionSinceAt).toBe(T0 + 400 * DAY);
    g.clock.now = T0 + 407 * DAY;
    expect(await g.admin.deleteDueGameData()).toEqual([game.id]);
  });

  it('deletes only the due game and keeps the rest', async () => {
    const g = setup();
    const a = await newGame(g, 'Old game');
    const b = await newGame(g, 'Recent game');
    const c = await newGame(g, 'Lobby game');
    play(g, a.id, 'REVEAL', { endedAt: T0 });
    play(g, b.id, 'REVEAL', { endedAt: T0 + 60 * DAY });
    g.clock.now = T0 + 100 * DAY;
    expect(await g.admin.deleteDueGameData()).toEqual([a.id]);
    expect([exists(g, a.id), exists(g, b.id), exists(g, c.id)]).toEqual([false, true, true]);
  });
});
