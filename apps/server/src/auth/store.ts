import type { StaffGameSummary, StaffRole } from '@magic-potion/shared';

// Everything auth needs from the database, behind an interface so the HTTP and socket
// tests can run without Postgres.

export interface LoginTeam {
  id: string;
  gameId: string;
  name: string;
  passwordHash: string;
}

export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  passwordHash: string;
}

export interface TeamSessionInfo {
  teamId: string;
  gameId: string;
  open: boolean;
}

export interface AuditEntry {
  gameId: string;
  staffUserId: string;
  teamId?: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export interface AuthStore {
  // Teams with this code (any case) in games that have not ended.
  findLoginTeams(code: string): Promise<LoginTeam[]>;
  // Ends the team's open sessions and opens a new one, all at once, so a team never has two.
  openTeamSession(teamId: string, tokenId: string): Promise<{ endedTokenIds: string[] }>;
  teamSession(tokenId: string): Promise<TeamSessionInfo | null>;
  touchTeamSession(tokenId: string): Promise<void>;
  endTeamSessions(teamId: string, reason: string): Promise<string[]>;
  teamGameId(teamId: string): Promise<string | null>;

  findStaffByEmail(email: string): Promise<StaffAccount | null>;
  findStaff(id: string): Promise<StaffAccount | null>;
  assignedTeamIds(staffUserId: string, gameId: string): Promise<string[]>;
  // Main admin: every game. Co-facilitator: games with teams assigned to them.
  gamesFor(staff: StaffAccount): Promise<StaffGameSummary[]>;

  audit(entry: AuditEntry): Promise<void>;
}
