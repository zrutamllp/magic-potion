import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaultSettings';
import {
  DATA_DELETE_WARNING_DAYS,
  SetDataRetentionSchema,
  gameDataDueAt,
  type GameDataFacts,
} from './retention';
import { GameSettingsSchema } from './settings';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1, 9, 0, 0);
// Deletion was switched on long before these games, so the first-run floor plays no part.
const LONG_AGO = T0 - 1000 * DAY;

const facts = (over: Partial<GameDataFacts> = {}): GameDataFacts => ({
  startedAt: T0,
  endedAt: null,
  lastActivityAt: T0,
  days: 90,
  deletionSince: LONG_AGO,
  ...over,
});

describe('game data retention setting', () => {
  it('defaults to 90 days', () => {
    expect(DEFAULT_SETTINGS.retention.gameDataDays).toBe(90);
  });

  it('loads settings saved before game data was auto-deleted with 90 days', () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Record<string, unknown>;
    delete old.retention;
    expect(GameSettingsSchema.parse(old).retention.gameDataDays).toBe(90);
  });

  it('allows 7 to 365 days', () => {
    const at = (gameDataDays: number) =>
      GameSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, retention: { gameDataDays } }).success;
    expect([at(6), at(7), at(365), at(366), at(30.5)]).toEqual([false, true, true, false, false]);
    expect(SetDataRetentionSchema.safeParse({ days: 6 }).success).toBe(false);
    expect(SetDataRetentionSchema.safeParse({ days: 7 }).success).toBe(true);
    expect(SetDataRetentionSchema.safeParse({ days: 366 }).success).toBe(false);
  });
});

describe('gameDataDueAt', () => {
  it('never schedules a game that never started', () => {
    expect(gameDataDueAt(facts({ startedAt: null, lastActivityAt: null }))).toBeNull();
  });

  it('counts the days from End game', () => {
    const ended = T0 + 2 * 60 * 60 * 1000;
    expect(gameDataDueAt(facts({ endedAt: ended, lastActivityAt: ended + DAY }))).toEqual({
      at: ended + 90 * DAY,
      from: 'ended',
    });
  });

  it('counts the days from the last activity when the game was never ended', () => {
    const last = T0 + 5 * DAY;
    expect(gameDataDueAt(facts({ lastActivityAt: last, days: 30 }))).toEqual({
      at: last + 30 * DAY,
      from: 'last-activity',
    });
  });

  it('uses the start when nothing has happened since', () => {
    expect(gameDataDueAt(facts({ lastActivityAt: null }))).toEqual({
      at: T0 + 90 * DAY,
      from: 'last-activity',
    });
  });

  it(`never falls due within ${DATA_DELETE_WARNING_DAYS} days of deletion being switched on`, () => {
    // A game that ended long ago, on a server that just got this feature.
    const since = T0 + 200 * DAY;
    const due = gameDataDueAt(facts({ endedAt: T0, deletionSince: since }));
    expect(due).toEqual({ at: since + DATA_DELETE_WARNING_DAYS * DAY, from: 'ended' });
  });
});
