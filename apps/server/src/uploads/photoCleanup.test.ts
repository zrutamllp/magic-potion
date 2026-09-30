import { describe, expect, it } from 'vitest';
import { FakeClock } from '../engine/clock';
import type { GameEngine } from '../engine/engine';
import { memoryEngine } from '../engine/memoryGame';
import type { PhotoStore } from './photos';
import {
  PhotoCleanup,
  dueGames,
  photosDueAt,
  type PhotoCleanupStore,
  type PhotoGame,
} from './photoCleanup';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 29, 9, 0, 0);
const MIN = 60_000;

function game(patch: Partial<PhotoGame> = {}): PhotoGame {
  return {
    id: 'game-1',
    phase: 'REVEAL',
    startedAt: T0,
    phaseStartedAt: T0 + 80 * MIN,
    endedAt: T0 + 90 * MIN,
    retentionDays: 30,
    ...patch,
  };
}

describe('when team photos are due for deletion', () => {
  it('counts the days from End game', () => {
    expect(photosDueAt(game())).toBe(T0 + 90 * MIN + 30 * DAY);
  });

  it('counts from the start of the Reveal if nobody pressed End game', () => {
    expect(photosDueAt(game({ endedAt: null }))).toBe(T0 + 80 * MIN + 30 * DAY);
  });

  it('counts from the game start if it never reached the Reveal', () => {
    expect(photosDueAt(game({ phase: 'ROUND2', endedAt: null }))).toBe(T0 + 30 * DAY);
  });

  it('never for a game that never started, and uses the days setting', () => {
    expect(photosDueAt(game({ startedAt: null }))).toBeNull();
    expect(photosDueAt(game({ retentionDays: 7 }))).toBe(T0 + 90 * MIN + 7 * DAY);
  });

  it('picks only games past their time', () => {
    const late = game({ id: 'late' });
    const early = game({ id: 'early', endedAt: T0 + 40 * DAY });
    expect(dueGames([late, early], T0 + 35 * DAY).map((g) => g.id)).toEqual(['late']);
  });
});

async function gameWithPhoto() {
  const clock = new FakeClock(T0);
  const { engine } = memoryEngine({ teams: 3, clock });
  await engine.startGame('admin-1');
  clock.set(T0 + 10 * MIN);
  await engine.tick();
  const url = 'team-photos/a.webp';
  expect((await engine.submitPhoto('team-1', 'inbox-1', url)).ok).toBe(true);
  return { clock, engine, url };
}

function fakes(engine: GameEngine, g: PhotoGame, opts: { failRemove?: boolean } = {}) {
  const removed: string[] = [];
  const marked: string[] = [];
  const files: PhotoStore = {
    save: async () => '',
    read: async () => null,
    remove: async (urls) => {
      if (opts.failRemove) throw new Error('blob down');
      removed.push(...urls);
    },
  };
  const store: PhotoCleanupStore = {
    gamesWithPhotos: async () => [g],
    photoUrls: async () =>
      Object.values(engine.state.teams).flatMap((t) =>
        Object.values(t.inbox).flatMap((r) => (r.photoUrl ? [r.photoUrl] : [])),
      ),
    markDeleted: async (_id, urls) => {
      marked.push(...urls);
    },
  };
  return { files, store, removed, marked };
}

describe('the photo clean-up job', () => {
  it('deletes the files, forgets the addresses and keeps the points', async () => {
    const { engine, url } = await gameWithPhoto();
    const inboxBefore = engine.leaderboard().entries.find((e) => e.teamId === 'team-1');
    const f = fakes(engine, game());
    const job = new PhotoCleanup({
      store: f.store,
      photos: f.files,
      now: () => T0 + 31 * DAY,
      loadedEngine: () => Promise.resolve(engine),
    });
    expect(await job.runOnce()).toBe(1);
    expect(f.removed).toEqual([url]);
    expect(engine.state.teams['team-1']?.inbox['inbox-1']).toMatchObject({
      photoUrl: null,
      photoStatus: 'ACCEPTED',
      photoDeletedAt: T0 + 10 * MIN,
    });
    const after = engine.leaderboard().entries.find((e) => e.teamId === 'team-1');
    expect(after?.inboxCompleted).toBe(inboxBefore?.inboxCompleted);
    expect(after?.score.total).toBe(inboxBefore?.score.total);
  });

  it('marks them in the database when the game is not in memory', async () => {
    const { engine, url } = await gameWithPhoto();
    const f = fakes(engine, game());
    const job = new PhotoCleanup({
      store: f.store,
      photos: f.files,
      now: () => T0 + 31 * DAY,
      loadedEngine: () => undefined,
    });
    await job.runOnce();
    expect(f.marked).toEqual([url]);
  });

  it('does nothing before the time', async () => {
    const { engine } = await gameWithPhoto();
    const f = fakes(engine, game());
    const job = new PhotoCleanup({
      store: f.store,
      photos: f.files,
      now: () => T0 + 29 * DAY,
      loadedEngine: () => Promise.resolve(engine),
    });
    expect(await job.runOnce()).toBe(0);
    expect(f.removed).toEqual([]);
  });

  it('marks nothing when the files cannot be deleted, so the next run tries again', async () => {
    const { engine, url } = await gameWithPhoto();
    const f = fakes(engine, game(), { failRemove: true });
    const job = new PhotoCleanup({
      store: f.store,
      photos: f.files,
      now: () => T0 + 31 * DAY,
      loadedEngine: () => Promise.resolve(engine),
    });
    await expect(job.runOnce()).rejects.toThrow('blob down');
    expect(engine.state.teams['team-1']?.inbox['inbox-1']?.photoUrl).toBe(url);
  });
});
