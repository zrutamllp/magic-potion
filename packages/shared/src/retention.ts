import { z } from 'zod';

// Game data (teams, chat, answers, transfers, photos, the game's audit lines) is deleted a
// number of days after the game: settings.retention.gameDataDays, default 90. The days count
// from End game; for a game that was never ended, from its last activity. A game that never
// started is never deleted automatically. Every date comes from database times.

const DAY = 24 * 60 * 60 * 1000;

// No game is deleted within this many days of deletion being switched on, and the games list
// warns this many days ahead, so there is always time to download the exports.
export const DATA_DELETE_WARNING_DAYS = 7;

export const SetDataRetentionSchema = z.object({
  days: z.number().int().min(7).max(365),
});

export interface GameDataFacts {
  startedAt: number | null;
  endedAt: number | null;
  // The latest team action, chat message, staff change or game update. Null if none.
  lastActivityAt: number | null;
  days: number;
  // When this server first ran the deletion job (SystemFlag "gameDataDeletionSince").
  deletionSince: number;
}

export type GameDataDeleteFrom = 'ended' | 'last-activity';

export interface GameDataDue {
  at: number;
  from: GameDataDeleteFrom;
}

export function gameDataDueAt(f: GameDataFacts): GameDataDue | null {
  if (f.startedAt === null) return null;
  const from: GameDataDeleteFrom = f.endedAt !== null ? 'ended' : 'last-activity';
  const base = f.endedAt ?? Math.max(f.lastActivityAt ?? f.startedAt, f.startedAt);
  const at = Math.max(base + f.days * DAY, f.deletionSince + DATA_DELETE_WARNING_DAYS * DAY);
  return { at, from };
}
