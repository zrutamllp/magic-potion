import { GameSettingsSchema, type GamePhase } from '@magic-potion/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client';

// What a game's data deletion date is worked out from, read straight from the database, so the
// date is the same after any restart (see packages/shared/src/retention.ts).

// When this server first ran the deletion job. No game falls due within 7 days of it.
export const RETENTION_SINCE_FLAG = 'gameDataDeletionSince';

type Db = PrismaClient | Prisma.TransactionClient;

export interface RetentionGame {
  id: string;
  name: string;
  phase: GamePhase;
  frozenAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  lastActivityAt: number | null;
  days: number;
}

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);
const latest = (...times: (number | null)[]) => {
  const known = times.filter((t): t is number => t !== null);
  return known.length > 0 ? Math.max(...known) : null;
};

// Every started game, or exactly the games in `only` (started or not).
export async function retentionGames(db: Db, only?: string[]): Promise<RetentionGame[]> {
  const where = only ? { id: { in: only } } : { startedAt: { not: null } };
  const games = await db.game.findMany({
    where,
    select: {
      id: true,
      name: true,
      phase: true,
      frozenAt: true,
      startedAt: true,
      endedAt: true,
      updatedAt: true,
      settings: { select: { data: true } },
    },
  });
  if (games.length === 0) return [];
  const ids = games.map((g) => g.id);
  // The last team action, chat message and staff change of each game.
  const [teams, chat, audit] = await Promise.all([
    db.team.groupBy({
      by: ['gameId'],
      where: { gameId: { in: ids } },
      _max: { lastActionAt: true },
    }),
    db.chatMessage.groupBy({
      by: ['gameId'],
      where: { gameId: { in: ids } },
      _max: { createdAt: true },
    }),
    db.auditLog.groupBy({
      by: ['gameId'],
      where: { gameId: { in: ids } },
      _max: { createdAt: true },
    }),
  ]);
  const byGame = <T extends { gameId: string | null }>(rows: T[]) =>
    new Map(rows.map((r) => [r.gameId, r]));
  const teamMax = byGame(teams);
  const chatMax = byGame(chat);
  const auditMax = byGame(audit);
  return games.map((g) => ({
    id: g.id,
    name: g.name,
    phase: g.phase,
    frozenAt: ms(g.frozenAt),
    startedAt: ms(g.startedAt),
    endedAt: ms(g.endedAt),
    lastActivityAt: latest(
      ms(g.updatedAt),
      ms(teamMax.get(g.id)?._max.lastActionAt),
      ms(chatMax.get(g.id)?._max.createdAt),
      ms(auditMax.get(g.id)?._max.createdAt),
    ),
    days: GameSettingsSchema.parse(g.settings?.data).retention.gameDataDays,
  }));
}

// When deletion was switched on. With `create`, the first call stores `now`.
export async function retentionSince(db: Db, now: number, create: boolean): Promise<number> {
  const flag = await db.systemFlag.findUnique({ where: { key: RETENTION_SINCE_FLAG } });
  const stored = flag ? Date.parse(flag.value) : NaN;
  if (!Number.isNaN(stored)) return stored;
  if (create) {
    await db.systemFlag.upsert({
      where: { key: RETENTION_SINCE_FLAG },
      create: { key: RETENTION_SINCE_FLAG, value: new Date(now).toISOString() },
      update: { value: new Date(now).toISOString() },
    });
  }
  return now;
}
