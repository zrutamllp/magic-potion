import type { StaffGameSummary } from '@magic-potion/shared';
import type { AuditEntry, AuthStore, LoginTeam, StaffAccount, TeamSessionInfo } from './store';

// An in-memory AuthStore for tests.

interface MemoryTeam extends LoginTeam {
  code: string;
}

interface MemorySession {
  teamId: string;
  tokenId: string;
  endedAt: number | null;
  endReason: string | null;
  lastSeenAt: number;
}

export class MemoryAuthStore implements AuthStore {
  teams: MemoryTeam[] = [];
  staff: StaffAccount[] = [];
  games: (StaffGameSummary & { ended?: boolean })[] = [];
  assignments: { staffUserId: string; gameId: string; teamId: string }[] = [];
  sessions: MemorySession[] = [];
  audits: AuditEntry[] = [];

  async findLoginTeams(code: string): Promise<LoginTeam[]> {
    return this.teams.filter(
      (t) =>
        t.code.toLowerCase() === code.toLowerCase() &&
        !this.games.find((g) => g.id === t.gameId)?.ended,
    );
  }

  async openTeamSession(teamId: string, tokenId: string): Promise<{ endedTokenIds: string[] }> {
    const endedTokenIds = await this.endTeamSessions(teamId, 'REPLACED');
    this.sessions.push({ teamId, tokenId, endedAt: null, endReason: null, lastSeenAt: Date.now() });
    return { endedTokenIds };
  }

  async teamSession(tokenId: string): Promise<TeamSessionInfo | null> {
    const s = this.sessions.find((x) => x.tokenId === tokenId);
    const team = s && this.teams.find((t) => t.id === s.teamId);
    return s && team ? { teamId: s.teamId, gameId: team.gameId, open: s.endedAt === null } : null;
  }

  async touchTeamSession(tokenId: string): Promise<void> {
    const s = this.sessions.find((x) => x.tokenId === tokenId && x.endedAt === null);
    if (s) s.lastSeenAt = Date.now();
  }

  async endTeamSessions(teamId: string, reason: string): Promise<string[]> {
    const open = this.sessions.filter((s) => s.teamId === teamId && s.endedAt === null);
    for (const s of open) {
      s.endedAt = Date.now();
      s.endReason = reason;
    }
    return open.map((s) => s.tokenId);
  }

  async teamGameId(teamId: string): Promise<string | null> {
    return this.teams.find((t) => t.id === teamId)?.gameId ?? null;
  }

  async findStaffByEmail(email: string): Promise<StaffAccount | null> {
    return this.staff.find((s) => s.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async findStaff(id: string): Promise<StaffAccount | null> {
    return this.staff.find((s) => s.id === id) ?? null;
  }

  async assignedTeamIds(staffUserId: string, gameId: string): Promise<string[]> {
    return this.assignments
      .filter((a) => a.staffUserId === staffUserId && a.gameId === gameId)
      .map((a) => a.teamId);
  }

  async gamesFor(staff: StaffAccount): Promise<StaffGameSummary[]> {
    const games =
      staff.role === 'MAIN_ADMIN'
        ? this.games
        : this.games.filter((g) =>
            this.assignments.some((a) => a.staffUserId === staff.id && a.gameId === g.id),
          );
    return games.map(({ id, name, phase }) => ({ id, name, phase }));
  }

  async audit(entry: AuditEntry): Promise<void> {
    this.audits.push(entry);
  }
}
