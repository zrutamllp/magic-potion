// The audit log as the facilitator dashboard reads it (Phase 6C). The engine writes audit rows
// with each change; this reads them back, behind an interface so route tests run without
// Postgres (same pattern as auth/store.ts).

export interface StoredAuditRow {
  id: string;
  gameId: string | null;
  staffUserId: string;
  staffName: string;
  teamId: string | null;
  teamName: string | null;
  action: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: number;
  undoneAt: number | null;
  undoOfId: string | null;
}

export interface LiveStore {
  // Newest first. With a team list (co-facilitators), only rows about those teams.
  auditRows(gameId: string, teamIds: string[] | null, limit: number): Promise<StoredAuditRow[]>;
  auditRow(id: string): Promise<StoredAuditRow | null>;
}
