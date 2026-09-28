import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  DEFAULT_SETTINGS,
  GameSettingsSchema,
  MAX_TEAMS,
  generateTeamCodes,
  generateTeamPassword,
  type AddTeams,
  type AdminGame,
  type CreateGame,
  type CreateStaff,
  type CreatedGame,
  type GameSettings,
  type StaffMember,
  type TeamLoginCard,
} from '@magic-potion/shared';
import type { AuthService } from '../auth/service';
import type { StaffAccount } from '../auth/store';
import type { NewTeamRow } from '../engine/dbGame';
import type { AdminStore, StoredGame } from './store';

// The admin panel's setup actions (Phase 6A). Main admin only; the routes check that.
// Every change is audited. Team passwords are returned once, when made, and stored hashed.

export const ADMIN_ERRORS = {
  GAME_NOT_FOUND: 'That game was not found.',
  GAME_STARTED: 'The game has started, so this can no longer change.',
  TOO_MANY_TEAMS: `A game can have at most ${MAX_TEAMS} teams.`,
  TEAM_NOT_FOUND: 'That team was not found in this game.',
  STAFF_NOT_FOUND: 'That staff member was not found.',
  EMAIL_TAKEN: 'Someone already uses that email.',
  NOT_A_FACILITATOR: 'Teams can only be given to an active co-facilitator.',
  OWN_ACCOUNT: 'You cannot switch off your own account.',
  MAIN_ADMIN: 'The main admin account cannot be changed here.',
} as const;
export type AdminErrorCode = keyof typeof ADMIN_ERRORS;

export type AdminResult<T> =
  { ok: true; value: T } | { ok: false; status: number; code: AdminErrorCode; message: string };

const fail = <T = never>(status: number, code: AdminErrorCode): AdminResult<T> => ({
  ok: false,
  status,
  code,
  message: ADMIN_ERRORS[code],
});
const ok = <T>(value: T): AdminResult<T> => ({ ok: true, value });

export interface AdminServiceOptions {
  store: AdminStore;
  // Ends team logins when their passwords change.
  auth: AuthService;
  // Called after a Lobby change to a game's settings or teams, so the running server drops its
  // cached copy of the game and connected browsers load it again.
  onLobbyChange?: (gameId: string) => void;
  // bcrypt cost for staff passwords (default 12) and team passwords (default 10). Team passwords
  // are made in batches of up to 25 and logins are rate-limited, so a lower cost keeps
  // "create game" quick. Tests pass a low number.
  bcryptRounds?: { staff: number; team: number };
  random?: (max: number) => number;
}

export class AdminService {
  private readonly store: AdminStore;
  private readonly rounds: { staff: number; team: number };
  private readonly random: (max: number) => number;

  constructor(private readonly opts: AdminServiceOptions) {
    this.store = opts.store;
    this.rounds = opts.bcryptRounds ?? { staff: 12, team: 10 };
    this.random = opts.random ?? ((max) => randomInt(max));
  }

  // ---------- Games ----------

  async createGame(staff: StaffAccount, input: CreateGame): Promise<AdminResult<CreatedGame>> {
    const settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
    settings.branding.clientName = input.clientName;
    const { rows, logins } = await this.newTeams(input.teamCount, [], 0);
    const gameId = await this.store.createGame(input.name, settings, rows);
    await this.store.audit({
      gameId,
      staffUserId: staff.id,
      action: 'CREATE_GAME',
      after: { name: input.name, clientName: input.clientName, teams: input.teamCount },
    });
    const game = await this.getGame(gameId);
    if (!game.ok) return game;
    return ok({ game: game.value, logins });
  }

  async getGame(gameId: string): Promise<AdminResult<AdminGame>> {
    const g = await this.store.game(gameId);
    return g ? ok(this.view(g)) : fail(404, 'GAME_NOT_FOUND');
  }

  async renameGame(
    staff: StaffAccount,
    gameId: string,
    name: string,
  ): Promise<AdminResult<AdminGame>> {
    const g = await this.store.game(gameId);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    await this.store.renameGame(gameId, name);
    await this.store.audit({
      gameId,
      staffUserId: staff.id,
      action: 'RENAME_GAME',
      before: { name: g.name },
      after: { name },
    });
    this.lobbyChanged(g);
    return this.getGame(gameId);
  }

  // Every setting locks when Round 1 starts (GAME_RULES section 12). Live changes to names,
  // funds and timing are separate staff actions.
  async saveSettings(
    staff: StaffAccount,
    gameId: string,
    settings: GameSettings,
  ): Promise<AdminResult<AdminGame>> {
    const g = await this.store.game(gameId);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    if (g.startedAt) return fail(409, 'GAME_STARTED');
    const before = GameSettingsSchema.parse(g.settings);
    await this.store.saveSettings(gameId, settings);
    const changed = changedPaths(before, settings);
    await this.store.audit({
      gameId,
      staffUserId: staff.id,
      action: 'SAVE_SETTINGS',
      before: pick(before, changed),
      after: pick(settings, changed),
    });
    this.lobbyChanged(g);
    return this.getGame(gameId);
  }

  // ---------- Teams ----------

  async addTeams(
    staff: StaffAccount,
    gameId: string,
    input: AddTeams,
  ): Promise<AdminResult<{ game: AdminGame; logins: TeamLoginCard[] }>> {
    const g = await this.store.game(gameId);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    if (g.startedAt) return fail(409, 'GAME_STARTED');
    if (g.teams.length + input.count > MAX_TEAMS) return fail(400, 'TOO_MANY_TEAMS');
    const { rows, logins } = await this.newTeams(input.count, input.names, g.teams.length);
    await this.store.addTeams(gameId, rows);
    await this.store.audit({
      gameId,
      staffUserId: staff.id,
      action: 'ADD_TEAMS',
      after: { teams: rows.map((r) => ({ code: r.code, name: r.name })) },
    });
    this.lobbyChanged(g);
    const game = await this.getGame(gameId);
    return game.ok ? ok({ game: game.value, logins }) : game;
  }

  async renameTeam(
    staff: StaffAccount,
    gameId: string,
    teamId: string,
    name: string,
  ): Promise<AdminResult<AdminGame>> {
    const found = await this.lobbyTeam(gameId, teamId);
    if (!found.ok) return found;
    const { game, team } = found.value;
    await this.store.renameTeam(teamId, name);
    await this.store.audit({
      gameId,
      staffUserId: staff.id,
      teamId,
      action: 'RENAME_TEAM',
      before: { name: team.name },
      after: { name },
    });
    this.lobbyChanged(game);
    return this.getGame(gameId);
  }

  async deleteTeam(
    staff: StaffAccount,
    gameId: string,
    teamId: string,
  ): Promise<AdminResult<AdminGame>> {
    const found = await this.lobbyTeam(gameId, teamId);
    if (!found.ok) return found;
    const { game, team } = found.value;
    await this.store.deleteTeam(teamId);
    // The team row is gone, so the audit line keeps its code and name instead of a link.
    await this.store.audit({
      gameId,
      staffUserId: staff.id,
      action: 'DELETE_TEAM',
      before: { id: team.id, code: team.code, name: team.name },
    });
    this.lobbyChanged(game);
    return this.getGame(gameId);
  }

  // New passwords for the chosen teams (all when none are chosen). Their logins end.
  // Allowed in any phase: a team that forgot its password gets a new one.
  async resetPasswords(
    staff: StaffAccount,
    gameId: string,
    teamIds: string[] | undefined,
  ): Promise<AdminResult<TeamLoginCard[]>> {
    const g = await this.store.game(gameId);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    const teams = teamIds ? g.teams.filter((t) => teamIds.includes(t.id)) : g.teams;
    if (teamIds && teams.length !== new Set(teamIds).size) return fail(404, 'TEAM_NOT_FOUND');
    const logins: TeamLoginCard[] = [];
    const rows: { teamId: string; passwordHash: string }[] = [];
    for (const t of teams) {
      const password = generateTeamPassword(this.random);
      logins.push({ code: t.code, name: t.name, password });
      rows.push({ teamId: t.id, passwordHash: await bcrypt.hash(password, this.rounds.team) });
    }
    await this.store.setTeamPasswords(rows);
    for (const t of teams) {
      await this.store.audit({
        gameId,
        staffUserId: staff.id,
        teamId: t.id,
        action: 'RESET_TEAM_PASSWORD',
      });
    }
    for (const t of teams) await this.opts.auth.endSessions(t.id, 'PASSWORD_RESET');
    return ok(logins);
  }

  // ---------- Staff ----------

  staffList(): Promise<StaffMember[]> {
    return this.store.staffList();
  }

  async createStaff(staff: StaffAccount, input: CreateStaff): Promise<AdminResult<StaffMember>> {
    if (await this.store.staffByEmail(input.email)) return fail(409, 'EMAIL_TAKEN');
    const member = await this.store.createStaff({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, this.rounds.staff),
    });
    await this.store.audit({
      gameId: null,
      staffUserId: staff.id,
      action: 'CREATE_STAFF',
      after: { id: member.id, name: member.name, email: member.email, role: member.role },
    });
    return ok(member);
  }

  async updateStaff(
    staff: StaffAccount,
    id: string,
    patch: { name?: string; active?: boolean },
  ): Promise<AdminResult<StaffMember>> {
    const member = await this.store.staffById(id);
    if (!member) return fail(404, 'STAFF_NOT_FOUND');
    if (id === staff.id && patch.active === false) return fail(400, 'OWN_ACCOUNT');
    if (member.role === 'MAIN_ADMIN' && id !== staff.id) return fail(400, 'MAIN_ADMIN');
    const updated = await this.store.updateStaff(id, patch);
    await this.store.audit({
      gameId: null,
      staffUserId: staff.id,
      action: 'UPDATE_STAFF',
      before: { id, name: member.name, active: member.active },
      after: { id, name: updated.name, active: updated.active },
    });
    return ok(updated);
  }

  async resetStaffPassword(
    staff: StaffAccount,
    id: string,
    password: string,
  ): Promise<AdminResult<null>> {
    const member = await this.store.staffById(id);
    if (!member) return fail(404, 'STAFF_NOT_FOUND');
    if (member.role === 'MAIN_ADMIN' && id !== staff.id) return fail(400, 'MAIN_ADMIN');
    await this.store.setStaffPassword(id, await bcrypt.hash(password, this.rounds.staff));
    await this.store.audit({
      gameId: null,
      staffUserId: staff.id,
      action: 'RESET_STAFF_PASSWORD',
      after: { id },
    });
    return ok(null);
  }

  async setAssignments(
    staff: StaffAccount,
    gameId: string,
    staffUserId: string,
    teamIds: string[],
  ): Promise<AdminResult<AdminGame>> {
    const g = await this.store.game(gameId);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    const member = await this.store.staffById(staffUserId);
    if (!member || member.role !== 'CO_FACILITATOR' || !member.active) {
      return fail(400, 'NOT_A_FACILITATOR');
    }
    const unique = [...new Set(teamIds)];
    if (!unique.every((id) => g.teams.some((t) => t.id === id))) return fail(404, 'TEAM_NOT_FOUND');
    const before = g.assignments.filter((a) => a.staffUserId === staffUserId).map((a) => a.teamId);
    await this.store.setAssignments(gameId, staffUserId, unique);
    await this.store.audit({
      gameId,
      staffUserId: staff.id,
      action: 'SET_ASSIGNMENTS',
      before: { staffUserId, teamIds: before },
      after: { staffUserId, teamIds: unique },
    });
    return this.getGame(gameId);
  }

  // ---------- Helpers ----------

  private view(g: StoredGame): AdminGame {
    const assignments: Record<string, string[]> = {};
    for (const a of g.assignments) (assignments[a.staffUserId] ??= []).push(a.teamId);
    return {
      id: g.id,
      name: g.name,
      phase: g.phase,
      locked: g.startedAt !== null,
      settings: GameSettingsSchema.parse(g.settings),
      teams: g.teams,
      assignments,
    };
  }

  private async lobbyTeam(gameId: string, teamId: string) {
    const game = await this.store.game(gameId);
    if (!game) return fail(404, 'GAME_NOT_FOUND');
    if (game.startedAt) return fail(409, 'GAME_STARTED');
    const team = game.teams.find((t) => t.id === teamId);
    if (!team) return fail(404, 'TEAM_NOT_FOUND');
    return ok({ game, team });
  }

  private lobbyChanged(g: StoredGame): void {
    if (!g.startedAt) this.opts.onLobbyChange?.(g.id);
  }

  // Codes that clash with no other team in any game, and fresh passwords.
  private async newTeams(count: number, names: string[], already: number) {
    const codes = generateTeamCodes(count, await this.store.allTeamCodes(), this.random);
    const rows: NewTeamRow[] = [];
    const logins: TeamLoginCard[] = [];
    for (const [i, code] of codes.entries()) {
      const name = names[i]?.trim() || `Team ${already + i + 1}`;
      const password = generateTeamPassword(this.random);
      rows.push({ code, name, passwordHash: await bcrypt.hash(password, this.rounds.team) });
      logins.push({ code, name, password });
    }
    return { rows, logins };
  }
}

// Dotted paths of the numbers and text that differ, for a short audit line.
export function changedPaths(a: unknown, b: unknown, prefix = ''): string[] {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    if (Array.isArray(a) || Array.isArray(b)) {
      return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix];
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) =>
      changedPaths(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        prefix ? `${prefix}.${k}` : k,
      ),
    );
  }
  return a === b ? [] : [prefix];
}

function pick(settings: GameSettings, paths: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const path of paths) {
    let v: unknown = settings;
    for (const k of path.split('.')) v = (v as Record<string, unknown> | undefined)?.[k];
    out[path] = v ?? null;
  }
  return out;
}
