import { gameDataDueAt, type StaffGameSummary } from '@magic-potion/shared';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import type { AuditEntry, AuthStore, LoginTeam, StaffAccount, TeamSessionInfo } from './store';
import { retentionGames, retentionSince } from '../retention/prismaFacts';

const json = (v: unknown) =>
  v === undefined || v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);

export class PrismaAuthStore implements AuthStore {
  constructor(private readonly prisma: PrismaClient) {}

  findLoginTeams(code: string): Promise<LoginTeam[]> {
    return this.prisma.team.findMany({
      where: { code: { equals: code, mode: 'insensitive' }, game: { endedAt: null } },
      select: { id: true, gameId: true, name: true, passwordHash: true },
    });
  }

  openTeamSession(teamId: string, tokenId: string): Promise<{ endedTokenIds: string[] }> {
    return this.prisma.$transaction(
      async (tx) => {
        // Lock the team row so two logins at the same moment cannot both stay open.
        await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
        const now = new Date();
        // Ends the open sessions and says which they were, in one step.
        const ended = await tx.$queryRaw<{ tokenId: string }[]>`
          UPDATE "TeamSession" SET "endedAt" = ${now}, "endReason" = 'REPLACED'
          WHERE "teamId" = ${teamId} AND "endedAt" IS NULL
          RETURNING "tokenId"`;
        await tx.teamSession.create({ data: { teamId, tokenId, createdAt: now, lastSeenAt: now } });
        return { endedTokenIds: ended.map((s) => s.tokenId) };
      },
      // Three small queries: a login never holds a connection for long. When the server is too
      // busy to start in 5 s, the login answers "busy, try again" (503).
      { maxWait: 5_000, timeout: 5_000 },
    );
  }

  async teamSession(tokenId: string): Promise<TeamSessionInfo | null> {
    const s = await this.prisma.teamSession.findUnique({
      where: { tokenId },
      select: { teamId: true, endedAt: true, team: { select: { gameId: true } } },
    });
    return s ? { teamId: s.teamId, gameId: s.team.gameId, open: s.endedAt === null } : null;
  }

  async touchTeamSession(tokenId: string): Promise<void> {
    await this.prisma.teamSession.updateMany({
      where: { tokenId, endedAt: null },
      data: { lastSeenAt: new Date() },
    });
  }

  endTeamSessions(teamId: string, reason: string): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const open = await tx.teamSession.findMany({
        where: { teamId, endedAt: null },
        select: { tokenId: true },
      });
      await tx.teamSession.updateMany({
        where: { teamId, endedAt: null },
        data: { endedAt: new Date(), endReason: reason },
      });
      return open.map((s) => s.tokenId);
    });
  }

  async teamGameId(teamId: string): Promise<string | null> {
    const t = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { gameId: true },
    });
    return t?.gameId ?? null;
  }

  findStaffByEmail(email: string): Promise<StaffAccount | null> {
    return this.prisma.staffUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
  }

  findStaff(id: string): Promise<StaffAccount | null> {
    return this.prisma.staffUser.findUnique({ where: { id } });
  }

  async assignedTeamIds(staffUserId: string, gameId: string): Promise<string[]> {
    const rows = await this.prisma.staffAssignment.findMany({
      where: { staffUserId, gameId },
      select: { teamId: true },
    });
    return rows.map((r) => r.teamId);
  }

  async gamesFor(staff: StaffAccount): Promise<StaffGameSummary[]> {
    const games = await this.prisma.game.findMany({
      where:
        staff.role === 'MAIN_ADMIN'
          ? {}
          : { staffAssignments: { some: { staffUserId: staff.id } } },
      select: {
        id: true,
        name: true,
        phase: true,
        startedAt: true,
        endedAt: true,
        archivedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    // When each game's data will be deleted (see packages/shared/src/retention.ts).
    const facts = new Map(
      (
        await retentionGames(
          this.prisma,
          games.map((g) => g.id),
        )
      ).map((f) => [f.id, f]),
    );
    const since = await retentionSince(this.prisma, Date.now(), false);
    return games.map((g) => {
      const f = facts.get(g.id);
      const due = f ? gameDataDueAt({ ...f, deletionSince: since }) : null;
      return {
        id: g.id,
        name: g.name,
        phase: g.phase,
        archived: g.archivedAt !== null,
        started: g.startedAt !== null,
        finished: g.phase === 'REVEAL' || g.endedAt !== null,
        dataDeleteAt: due ? new Date(due.at).toISOString() : null,
        dataDeleteFrom: due?.from ?? null,
        ...(f ? { dataDeleteDays: f.days } : {}),
      };
    });
  }

  async audit(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        gameId: entry.gameId,
        staffUserId: entry.staffUserId,
        teamId: entry.teamId ?? null,
        action: entry.action,
        before: json(entry.before),
        after: json(entry.after),
        reason: entry.reason ?? null,
      },
    });
  }
}
