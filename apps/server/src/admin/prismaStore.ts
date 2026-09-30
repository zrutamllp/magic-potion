import {
  TEST_GAME_PREFIX,
  TEST_STAFF_EMAIL,
  type AdminInboxItem,
  type GameSettings,
  type StaffMember,
} from '@magic-potion/shared';
import { createSampleGame, type NewTeamRow } from '../engine/dbGame';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import type { AdminAuditEntry, AdminStore, StoredGame } from './store';

const json = (v: unknown) =>
  v === undefined || v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);

const STAFF_FIELDS = { id: true, name: true, email: true, role: true, active: true } as const;

export class PrismaAdminStore implements AdminStore {
  constructor(private readonly prisma: PrismaClient) {}

  createGame(name: string, settings: GameSettings, teams: NewTeamRow[]): Promise<string> {
    return createSampleGame(this.prisma, { name, settings, teams });
  }

  async game(gameId: string): Promise<StoredGame | null> {
    const g = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        name: true,
        phase: true,
        startedAt: true,
        endedAt: true,
        archivedAt: true,
        settings: { select: { data: true } },
        teams: {
          select: { id: true, code: true, name: true, status: true },
          // Teams made together share a time; cuid ids keep them in the order they were made.
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        staffAssignments: { select: { staffUserId: true, teamId: true } },
      },
    });
    if (!g) return null;
    return {
      id: g.id,
      name: g.name,
      phase: g.phase,
      startedAt: g.startedAt,
      endedAt: g.endedAt,
      archivedAt: g.archivedAt,
      settings: g.settings?.data ?? null,
      teams: g.teams,
      assignments: g.staffAssignments,
    };
  }

  async renameGame(gameId: string, name: string): Promise<void> {
    await this.prisma.game.update({ where: { id: gameId }, data: { name } });
  }

  async saveSettings(gameId: string, settings: GameSettings): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.gameSettings.update({
        where: { gameId },
        data: { data: settings as Prisma.InputJsonValue },
      });
      // The bonus tasks, in the order they were made, take the release times in order.
      const bonus = await tx.inboxItem.findMany({
        where: { gameId, kind: { in: ['PHOTO', 'QUESTION'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      for (const [i, item] of bonus.entries()) {
        await tx.inboxItem.update({
          where: { id: item.id },
          data: {
            releaseAtPlaySeconds: settings.inbox.releaseAtPlaySeconds[i] ?? null,
            reward: settings.inbox.reward,
          },
        });
      }
    });
  }

  async allTeamCodes(): Promise<string[]> {
    const rows = await this.prisma.team.findMany({ select: { code: true } });
    return rows.map((r) => r.code);
  }

  async addTeams(gameId: string, teams: NewTeamRow[]): Promise<void> {
    await this.prisma.team.createMany({ data: teams.map((t) => ({ ...t, gameId })) });
  }

  async renameTeam(teamId: string, name: string): Promise<void> {
    await this.prisma.team.update({ where: { id: teamId }, data: { name } });
  }

  async deleteTeam(teamId: string): Promise<void> {
    await this.prisma.team.delete({ where: { id: teamId } });
  }

  async setTeamPasswords(rows: { teamId: string; passwordHash: string }[]): Promise<void> {
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.team.update({
          where: { id: r.teamId },
          data: { passwordHash: r.passwordHash },
        }),
      ),
    );
  }

  staffList(): Promise<StaffMember[]> {
    return this.prisma.staffUser.findMany({
      select: STAFF_FIELDS,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  staffByEmail(email: string): Promise<StaffMember | null> {
    return this.prisma.staffUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: STAFF_FIELDS,
    });
  }

  staffById(id: string): Promise<StaffMember | null> {
    return this.prisma.staffUser.findUnique({ where: { id }, select: STAFF_FIELDS });
  }

  createStaff(row: { name: string; email: string; passwordHash: string }): Promise<StaffMember> {
    return this.prisma.staffUser.create({
      data: { ...row, role: 'CO_FACILITATOR' },
      select: STAFF_FIELDS,
    });
  }

  updateStaff(id: string, patch: { name?: string; active?: boolean }): Promise<StaffMember> {
    return this.prisma.staffUser.update({ where: { id }, data: patch, select: STAFF_FIELDS });
  }

  async setStaffPassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.staffUser.update({ where: { id }, data: { passwordHash } });
  }

  async setAssignments(gameId: string, staffUserId: string, teamIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.staffAssignment.deleteMany({ where: { gameId, staffUserId } }),
      this.prisma.staffAssignment.createMany({
        data: teamIds.map((teamId) => ({ gameId, staffUserId, teamId })),
      }),
    ]);
  }

  async inboxItems(gameId: string): Promise<AdminInboxItem[]> {
    const rows = await this.prisma.inboxItem.findMany({
      where: { gameId, kind: { in: ['PHOTO', 'QUESTION'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as AdminInboxItem['kind'],
      title: r.title,
      body: r.body,
      answers: Array.isArray(r.secretAnswer) ? (r.secretAnswer as string[]) : [],
      releaseAtPlaySeconds: r.releaseAtPlaySeconds,
    }));
  }

  async updateInboxItem(
    itemId: string,
    patch: { title: string; body: string; answers: string[] | null },
  ): Promise<void> {
    await this.prisma.inboxItem.update({
      where: { id: itemId },
      data: {
        title: patch.title,
        body: patch.body,
        ...(patch.answers ? { secretAnswer: patch.answers } : {}),
      },
    });
  }

  async setArchived(gameId: string, at: Date | null): Promise<void> {
    await this.prisma.game.update({ where: { id: gameId }, data: { archivedAt: at } });
  }

  async deleteGame(gameId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Checked again inside the transaction: a game that has started is never deleted.
      const g = await tx.game.findUnique({ where: { id: gameId }, select: { startedAt: true } });
      if (!g || g.startedAt) throw new Error('Only a game that never started can be deleted.');
      await tx.game.delete({ where: { id: gameId } });
    });
  }

  async deleteTestGame(gameId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Checked again inside the transaction: only a live-site test game is ever deleted here.
      const g = await tx.game.findUnique({ where: { id: gameId }, select: { name: true } });
      if (!g?.name.startsWith(TEST_GAME_PREFIX))
        throw new Error('Only a test game can be deleted.');
      await tx.game.delete({ where: { id: gameId } });
    });
  }

  staffGameCount(staffUserId: string): Promise<number> {
    return this.prisma.game.count({ where: { staffAssignments: { some: { staffUserId } } } });
  }

  async deleteTestStaff(staffUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const s = await tx.staffUser.findUnique({ where: { id: staffUserId } });
      if (!s || !TEST_STAFF_EMAIL.test(s.email)) throw new Error('Only test staff can be deleted.');
      // Their own lines outside any game (logins, for example); their game lines went with the
      // test game.
      await tx.auditLog.deleteMany({ where: { staffUserId } });
      await tx.staffUser.delete({ where: { id: staffUserId } });
    });
  }

  async audit(entry: AdminAuditEntry): Promise<void> {
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
