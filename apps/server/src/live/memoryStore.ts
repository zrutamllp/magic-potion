import type { Change } from '../engine/draft';
import type { LiveStore, StoredAuditRow } from './store';

// Reads the audit rows an in-memory engine saved (MemoryPersistence.log). For tests only.
export class MemoryLiveStore implements LiveStore {
  constructor(
    private readonly log: () => readonly Change[],
    private readonly names: { staff: (id: string) => string; team: (id: string) => string },
  ) {}

  private rows(): StoredAuditRow[] {
    const rows = new Map<string, StoredAuditRow>();
    for (const c of this.log()) {
      if ((c.kind !== 'create' && c.kind !== 'update') || c.model !== 'auditLog') continue;
      if (c.kind === 'create') {
        const d = c.data as Record<string, unknown>;
        const teamId = (d.teamId as string | null) ?? null;
        rows.set(c.data.id, {
          id: c.data.id,
          gameId: (d.gameId as string | null) ?? null,
          staffUserId: d.staffUserId as string,
          staffName: this.names.staff(d.staffUserId as string),
          teamId,
          teamName: teamId ? this.names.team(teamId) : null,
          action: d.action as string,
          before: d.before ?? null,
          after: d.after ?? null,
          reason: (d.reason as string | null) ?? null,
          createdAt: d.createdAt as number,
          undoneAt: null,
          undoOfId: (d.undoOfId as string | null) ?? null,
        });
      } else {
        const row = rows.get(c.id);
        if (row && typeof c.data.undoneAt === 'number') row.undoneAt = c.data.undoneAt;
      }
    }
    return [...rows.values()];
  }

  async auditRows(gameId: string, teamIds: string[] | null, limit: number) {
    return this.rows()
      .filter((r) => r.gameId === gameId && (!teamIds || (r.teamId && teamIds.includes(r.teamId))))
      .reverse()
      .slice(0, limit);
  }

  async auditRow(id: string) {
    return this.rows().find((r) => r.id === id) ?? null;
  }
}
