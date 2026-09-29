import type { Prisma, PrismaClient } from '../generated/prisma/client';
import type { LiveStore, StoredAuditRow } from './store';

const include = {
  staffUser: { select: { name: true } },
  team: { select: { name: true } },
} as const;

type Row = Prisma.AuditLogGetPayload<{ include: typeof include }>;

function toStored(r: Row): StoredAuditRow {
  return {
    id: r.id,
    gameId: r.gameId,
    staffUserId: r.staffUserId,
    staffName: r.staffUser.name,
    teamId: r.teamId,
    teamName: r.team?.name ?? null,
    action: r.action,
    before: r.before,
    after: r.after,
    reason: r.reason,
    createdAt: r.createdAt.getTime(),
    undoneAt: r.undoneAt ? r.undoneAt.getTime() : null,
    undoOfId: r.undoOfId,
  };
}

export class PrismaLiveStore implements LiveStore {
  constructor(private readonly prisma: PrismaClient) {}

  async auditRows(gameId: string, teamIds: string[] | null, limit: number) {
    const rows = await this.prisma.auditLog.findMany({
      where: { gameId, ...(teamIds ? { teamId: { in: teamIds } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include,
    });
    return rows.map(toStored);
  }

  async auditRow(id: string) {
    const row = await this.prisma.auditLog.findUnique({ where: { id }, include });
    return row ? toStored(row) : null;
  }
}
