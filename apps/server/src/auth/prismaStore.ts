import type { StaffGameSummary } from '@magic-potion/shared';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import type { AuditEntry, AuthStore, LoginTeam, StaffAccount, TeamSessionInfo } from './store';

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
    return this.prisma.$transaction(async (tx) => {
      // Lock the team row so two logins at the same moment cannot both stay open.
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
      const open = await tx.teamSession.findMany({
        where: { teamId, endedAt: null },
        select: { tokenId: true },
      });
      const now = new Date();
      await tx.teamSession.updateMany({
        where: { teamId, endedAt: null },
        data: { endedAt: now, endReason: 'REPLACED' },
      });
      await tx.teamSession.create({ data: { teamId, tokenId, createdAt: now, lastSeenAt: now } });
      return { endedTokenIds: open.map((s) => s.tokenId) };
    });
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
    return games.map((g) => ({
      id: g.id,
      name: g.name,
      phase: g.phase,
      archived: g.archivedAt !== null,
      started: g.startedAt !== null,
      finished: g.phase === 'REVEAL' || g.endedAt !== null,
    }));
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
