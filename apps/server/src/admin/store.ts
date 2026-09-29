import type {
  AdminInboxItem,
  AdminTeam,
  GamePhase,
  GameSettings,
  StaffMember,
} from '@magic-potion/shared';
import type { NewTeamRow } from '../engine/dbGame';

// Everything the admin panel needs from the database, behind an interface so the route tests
// run without Postgres (same pattern as auth/store.ts).

export interface StoredGame {
  id: string;
  name: string;
  phase: GamePhase;
  startedAt: Date | null;
  endedAt: Date | null;
  archivedAt: Date | null;
  // Raw JSON as saved; the service parses it with GameSettingsSchema.
  settings: unknown;
  teams: AdminTeam[];
  assignments: { staffUserId: string; teamId: string }[];
}

export interface AdminAuditEntry {
  // Null for staff account changes, which belong to no game.
  gameId: string | null;
  staffUserId: string;
  teamId?: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export interface AdminStore {
  // New lobby game with its teams, settings and the sample content pack. Returns its id.
  createGame(name: string, settings: GameSettings, teams: NewTeamRow[]): Promise<string>;
  game(gameId: string): Promise<StoredGame | null>;
  renameGame(gameId: string, name: string): Promise<void>;
  // Also moves the inbox bonus tasks to the new release times and reward.
  saveSettings(gameId: string, settings: GameSettings): Promise<void>;

  // Every team code in every game, so a new code never clashes with one in use.
  allTeamCodes(): Promise<string[]>;
  addTeams(gameId: string, teams: NewTeamRow[]): Promise<void>;
  renameTeam(teamId: string, name: string): Promise<void>;
  deleteTeam(teamId: string): Promise<void>;
  setTeamPasswords(rows: { teamId: string; passwordHash: string }[]): Promise<void>;

  staffList(): Promise<StaffMember[]>;
  staffByEmail(email: string): Promise<StaffMember | null>;
  staffById(id: string): Promise<StaffMember | null>;
  createStaff(row: { name: string; email: string; passwordHash: string }): Promise<StaffMember>;
  updateStaff(id: string, patch: { name?: string; active?: boolean }): Promise<StaffMember>;
  setStaffPassword(id: string, passwordHash: string): Promise<void>;
  // Replaces the teams this person looks after in this game.
  setAssignments(gameId: string, staffUserId: string, teamIds: string[]): Promise<void>;

  // The photo task and bonus questions (not alerts), in release order.
  inboxItems(gameId: string): Promise<AdminInboxItem[]>;
  updateInboxItem(
    itemId: string,
    patch: { title: string; body: string; answers: string[] | null },
  ): Promise<void>;
  setArchived(gameId: string, at: Date | null): Promise<void>;
  // Deletes the game and every row that belongs to it. Only for games that never started.
  deleteGame(gameId: string): Promise<void>;

  audit(entry: AdminAuditEntry): Promise<void>;
}
