import type {
  AdminInboxItem,
  AdminTeam,
  GamePhase,
  GameSettings,
  StaffMember,
} from '@magic-potion/shared';
import type { NewTeamRow } from '../engine/dbGame';
import type { RetentionGame } from '../retention/prismaFacts';

// Everything the admin panel needs from the database, behind an interface so the route tests
// run without Postgres (same pattern as auth/store.ts).

export interface StoredGame {
  id: string;
  name: string;
  phase: GamePhase;
  startedAt: Date | null;
  endedAt: Date | null;
  archivedAt: Date | null;
  // Set while the admin has paused the game.
  frozenAt: Date | null;
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

// What was removed with a game, for its deletion record. Numbers only.
export interface GameDeletionCounts {
  teams: number;
  sessions: number;
  chatMessages: number;
  taskAttempts: number;
  transfers: number;
  fundTransactions: number;
  fundRequests: number;
  inboxResponses: number;
  auditEntries: number;
  photos: number;
}

export interface GameDeletionRecord {
  gameId: string;
  gameName: string;
  deletedAt: Date;
  // "auto" or the staff user id.
  deletedBy: string;
  counts: GameDeletionCounts;
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
  // Game data retention (see retention/prismaFacts.ts): the facts each deletion date is worked
  // out from, for every started game or exactly the games in `only`.
  retentionGames(only?: string[]): Promise<RetentionGame[]>;
  // When deletion was switched on; with `create`, the first call stores `now`.
  retentionSince(now: number, create: boolean): Promise<number>;
  // Changes only settings.retention.gameDataDays, even after the game has started.
  setDataRetentionDays(gameId: string, days: number): Promise<void>;
  // In one transaction: checks `eligible` again on the game as it is now, counts its rows,
  // writes the deletion record and deletes the game with every row that belongs to it.
  // Returns null, deleting nothing, when the game is gone or no longer eligible.
  deleteGameData(
    gameId: string,
    record: { deletedBy: string; at: Date; photos: number },
    eligible: (g: RetentionGame) => boolean,
  ): Promise<GameDeletionCounts | null>;
  // Deletes a live-site test game (Phase 7C), played or not. Checks the name again.
  deleteTestGame(gameId: string): Promise<void>;
  // How many games this staff member has teams in.
  staffGameCount(staffUserId: string): Promise<number>;
  // Deletes a test staff account and its own audit lines. Checks the email again.
  deleteTestStaff(staffUserId: string): Promise<void>;

  audit(entry: AdminAuditEntry): Promise<void>;
}
