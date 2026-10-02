import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import {
  DATA_DELETE_WARNING_DAYS,
  DEFAULT_SETTINGS,
  GameSettingsSchema,
  INTRO_VIDEO_REFUSED,
  MAX_TEAMS,
  TEST_GAME_PREFIX,
  TEST_STAFF_EMAIL,
  generateTeamCodes,
  gameDataDueAt,
  generateTeamPassword,
  parseIntroVideo,
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
import type { RetentionGame } from '../retention/prismaFacts';
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
  NOT_FINISHED: 'Only a finished game can be archived.',
  NOT_ENDED: 'End the game first. A game being played or paused cannot be deleted.',
  RETENTION_TOO_SOON:
    'That would delete the data within 7 days. Use Delete played game now instead.',
  PHOTOS_NOT_REMOVED:
    'The team photos could not be deleted just now, so nothing was deleted. Try again.',
  INTRO_VIDEO_NOT_ALLOWED: INTRO_VIDEO_REFUSED,
  NAME_MISMATCH: 'Type the game name exactly as shown to delete it.',
  INBOX_ITEM_NOT_FOUND: 'That bonus task was not found in this game.',
  NO_ANSWERS: 'A question needs at least one accepted answer.',
  NOT_A_TEST_GAME: 'Only a test game (named "LOADTEST – …") can be deleted this way.',
  TEST_GAME_RUNNING: 'The test game is still running. End it first.',
  NOT_TEST_STAFF: 'Only a test co-facilitator (loadtest-N@zrutam.invalid) can be deleted.',
  TEST_STAFF_IN_GAME: 'This test co-facilitator still has teams in a game. Delete that game first.',
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
  // Runs after a game is created, to give it the default content pack.
  afterCreate?: (gameId: string) => Promise<void>;
  random?: (max: number) => number;
  // Before a game is deleted: drops it from the running server and closes its browsers (false
  // while it is still being played, unless `force`: an abandoned game, see deleteDueGameData),
  // and deletes its team photos (returns how many).
  forgetGame?: (gameId: string, force?: boolean) => Promise<boolean>;
  removeGamePhotos?: (gameId: string) => Promise<number>;
  // The public picture store's host. Intro video files must come from it; null refuses files.
  publicBlobHost?: string | null;
  now?: () => number;
}

const DAY = 24 * 60 * 60 * 1000;

// "Delete played game now": a game that never started, or one in the Reveal or ended and not
// paused. Never a game in Round 1, the Pause or Round 2.
const deletableByHand = (g: RetentionGame) =>
  g.startedAt === null || ((g.phase === 'REVEAL' || g.endedAt !== null) && g.frozenAt === null);

export class AdminService {
  private readonly store: AdminStore;
  private readonly rounds: { staff: number; team: number };
  private readonly random: (max: number) => number;
  private readonly now: () => number;

  constructor(private readonly opts: AdminServiceOptions) {
    this.store = opts.store;
    this.rounds = opts.bcryptRounds ?? { staff: 12, team: 10 };
    this.random = opts.random ?? ((max) => randomInt(max));
    this.now = opts.now ?? (() => Date.now());
  }

  // ---------- Games ----------

  async createGame(staff: StaffAccount, input: CreateGame): Promise<AdminResult<CreatedGame>> {
    const settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
    settings.branding.clientName = input.clientName;
    const { rows, logins } = await this.newTeams(input.teamCount, [], 0);
    const gameId = await this.store.createGame(input.name, settings, rows);
    await this.opts.afterCreate?.(gameId);
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
    return g ? ok(await this.view(g)) : fail(404, 'GAME_NOT_FOUND');
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
    // Only a new link is checked, so an old one never blocks saving other settings (the admin
    // sees a warning for it instead).
    const video = settings.branding.introVideoUrl;
    if (video && video !== before.branding.introVideoUrl && this.introVideoProblem(video)) {
      return fail(400, 'INTRO_VIDEO_NOT_ALLOWED');
    }
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
    const logins: TeamLoginCard[] = teams.map((t) => ({
      code: t.code,
      name: t.name,
      password: generateTeamPassword(this.random),
    }));
    // Hashed in parallel on Node's worker threads, so the game server never stalls.
    const rows = await Promise.all(
      teams.map(async (t, i) => ({
        teamId: t.id,
        passwordHash: await bcrypt.hash(logins[i]!.password, this.rounds.team),
      })),
    );
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

  // ---------- Inbox bonus tasks ----------

  async inbox(gameId: string) {
    const g = await this.store.game(gameId);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    return ok({ locked: g.startedAt !== null, items: await this.store.inboxItems(gameId) });
  }

  // The photo task text and the bonus questions. Release times and the reward are settings.
  async saveInbox(
    staff: StaffAccount,
    gameId: string,
    items: { id: string; title: string; body: string; answers: string[] }[],
  ) {
    const g = await this.store.game(gameId);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    if (g.startedAt) return fail(409, 'GAME_STARTED');
    const current = await this.store.inboxItems(gameId);
    for (const item of items) {
      const was = current.find((c) => c.id === item.id);
      if (!was) return fail(404, 'INBOX_ITEM_NOT_FOUND');
      if (was.kind === 'QUESTION' && item.answers.length === 0) return fail(400, 'NO_ANSWERS');
    }
    for (const item of items) {
      const was = current.find((c) => c.id === item.id)!;
      const answers = was.kind === 'QUESTION' ? item.answers : null;
      if (
        was.title === item.title &&
        was.body === item.body &&
        (!answers || same(was.answers, answers))
      ) {
        continue;
      }
      await this.store.updateInboxItem(item.id, { title: item.title, body: item.body, answers });
      await this.store.audit({
        gameId,
        staffUserId: staff.id,
        action: 'UPDATE_INBOX_ITEM',
        before: { id: was.id, title: was.title, body: was.body, answers: was.answers },
        after: { id: item.id, title: item.title, body: item.body, answers: answers ?? [] },
      });
    }
    this.lobbyChanged(g);
    return this.inbox(gameId);
  }

  // ---------- Archive and delete ----------

  // Hides a finished game from the list. Every row is kept.
  async setArchived(staff: StaffAccount, gameId: string, archived: boolean) {
    const g = await this.store.game(gameId);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    if (archived && g.phase !== 'REVEAL' && !g.endedAt) return fail(400, 'NOT_FINISHED');
    await this.store.setArchived(gameId, archived ? new Date() : null);
    await this.store.audit({
      gameId,
      staffUserId: staff.id,
      action: archived ? 'ARCHIVE_GAME' : 'UNARCHIVE_GAME',
    });
    return ok(null);
  }

  // "Delete played game now" (and a game that never started), only when its name is typed
  // exactly. Uses the same deletion as the scheduled job.
  async deleteGame(staff: StaffAccount, gameId: string, confirmName: string) {
    const [g] = await this.store.retentionGames([gameId]);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    if (confirmName.trim() !== g.name) return fail(400, 'NAME_MISMATCH');
    if (!deletableByHand(g)) return fail(409, 'NOT_ENDED');
    const result = await this.removeGameData(g, staff.id, false, deletableByHand);
    if (!result.ok) return result;
    // The game's own audit lines went with it, so this line belongs to no game. No team names.
    await this.store.audit({
      gameId: null,
      staffUserId: staff.id,
      action: 'DELETE_GAME',
      before: { id: g.id, name: g.name, played: g.startedAt !== null },
    });
    return ok(result.value);
  }

  // ---------- Game data retention ----------

  // "Delete game data after (days)". Unlike every other setting it can change after the game
  // starts, until the data is deleted, but never to a date less than 7 days away.
  async setDataRetention(staff: StaffAccount, gameId: string, days: number) {
    const [g] = await this.store.retentionGames([gameId]);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    const now = this.now();
    const since = await this.store.retentionSince(now, false);
    const due = gameDataDueAt({ ...g, days, deletionSince: since });
    if (due && due.at < now + DATA_DELETE_WARNING_DAYS * DAY) {
      return fail(400, 'RETENTION_TOO_SOON');
    }
    await this.store.setDataRetentionDays(gameId, days);
    await this.store.audit({
      gameId,
      staffUserId: staff.id,
      action: 'SET_DATA_RETENTION',
      before: { gameDataDays: g.days },
      after: { gameDataDays: days },
    });
    return this.getGame(gameId);
  }

  // The scheduled job: deletes every game whose deletion date has passed. Every date is worked
  // out from database times, so a restart changes nothing. `only` limits it (database tests).
  // Returns the ids deleted.
  async deleteDueGameData(opts: { only?: string[] } = {}): Promise<string[]> {
    const now = this.now();
    const since = await this.store.retentionSince(now, true);
    const isDue = (g: RetentionGame) => {
      const due = gameDataDueAt({ ...g, deletionSince: since });
      return due !== null && due.at <= now;
    };
    const deleted: string[] = [];
    for (const g of (await this.store.retentionGames(opts.only)).filter(isDue)) {
      // A game left paused or mid-round with no activity for the whole time is abandoned: it
      // is dropped from the server too.
      const result = await this.removeGameData(g, 'auto', true, isDue);
      if (result.ok) {
        deleted.push(g.id);
        console.log(
          `Deleted the data of game ${g.id}, ${g.days} days after it ended or went quiet.`,
        );
      } else {
        console.error(`Could not delete the data of game ${g.id}: ${result.message}`);
      }
    }
    return deleted;
  }

  // The one deletion: team photos first (if that fails, nothing is deleted and the next run
  // tries again), then the game leaves the running server, then every row goes in one
  // transaction with the deletion record.
  private async removeGameData(
    g: RetentionGame,
    deletedBy: string,
    force: boolean,
    eligible: (g: RetentionGame) => boolean,
  ) {
    const photos = await this.opts.removeGamePhotos?.(g.id).then(
      (n) => n,
      () => null,
    );
    if (photos === null) return fail(503, 'PHOTOS_NOT_REMOVED');
    if (this.opts.forgetGame && !(await this.opts.forgetGame(g.id, force))) {
      return fail(409, 'NOT_ENDED');
    }
    const counts = await this.store.deleteGameData(
      g.id,
      { deletedBy, at: new Date(this.now()), photos: photos ?? 0 },
      eligible,
    );
    if (!counts) return fail(409, 'NOT_ENDED');
    return ok(counts);
  }

  // ---------- Live-site tests (Phase 7C) ----------

  // Deletes a test game, played or not, so the live-site tests leave nothing behind. Only a
  // game named "LOADTEST – …", typed exactly, that is finished or never started.
  async deleteTestGame(staff: StaffAccount, gameId: string, confirmName: string) {
    const g = await this.store.game(gameId);
    if (!g) return fail(404, 'GAME_NOT_FOUND');
    if (!g.name.startsWith(TEST_GAME_PREFIX)) return fail(400, 'NOT_A_TEST_GAME');
    if (confirmName.trim() !== g.name) return fail(400, 'NAME_MISMATCH');
    const finished = g.phase === 'REVEAL' || g.endedAt !== null;
    if (g.startedAt && !finished) return fail(409, 'TEST_GAME_RUNNING');
    if (this.opts.forgetGame && !(await this.opts.forgetGame(gameId))) {
      return fail(409, 'TEST_GAME_RUNNING');
    }
    const photos = (await this.opts.removeGamePhotos?.(gameId)) ?? 0;
    await this.store.deleteTestGame(gameId);
    await this.store.audit({
      gameId: null,
      staffUserId: staff.id,
      action: 'DELETE_TEST_GAME',
      before: {
        id: g.id,
        name: g.name,
        played: g.startedAt !== null,
        teams: g.teams.length,
        photos,
      },
    });
    return ok({ teams: g.teams.length, photos });
  }

  // Deletes a test co-facilitator once their test game is gone.
  async deleteTestStaff(staff: StaffAccount, id: string) {
    const member = await this.store.staffById(id);
    if (!member) return fail(404, 'STAFF_NOT_FOUND');
    if (member.role !== 'CO_FACILITATOR' || !TEST_STAFF_EMAIL.test(member.email)) {
      return fail(400, 'NOT_TEST_STAFF');
    }
    if ((await this.store.staffGameCount(id)) > 0) return fail(409, 'TEST_STAFF_IN_GAME');
    await this.store.deleteTestStaff(id);
    await this.store.audit({
      gameId: null,
      staffUserId: staff.id,
      action: 'DELETE_TEST_STAFF',
      before: { id, name: member.name, email: member.email },
    });
    return ok(null);
  }

  // ---------- Helpers ----------

  private async view(g: StoredGame): Promise<AdminGame> {
    const assignments: Record<string, string[]> = {};
    for (const a of g.assignments) (assignments[a.staffUserId] ??= []).push(a.teamId);
    const settings = GameSettingsSchema.parse(g.settings);
    const [facts] = await this.store.retentionGames([g.id]);
    const now = this.now();
    const due = facts
      ? gameDataDueAt({ ...facts, deletionSince: await this.store.retentionSince(now, false) })
      : null;
    const video = settings.branding.introVideoUrl;
    return {
      id: g.id,
      name: g.name,
      phase: g.phase,
      locked: g.startedAt !== null,
      settings,
      teams: g.teams,
      assignments,
      dataDeleteAt: due ? new Date(due.at).toISOString() : null,
      dataDeleteFrom: due?.from ?? null,
      introVideoProblem: video ? this.introVideoProblem(video) : null,
    };
  }

  private introVideoProblem(url: string): string | null {
    const video = parseIntroVideo(url, this.opts.publicBlobHost ?? null);
    return video.kind === 'refused' ? video.reason : null;
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
    const logins: TeamLoginCard[] = codes.map((code, i) => ({
      code,
      name: names[i]?.trim() || `Team ${already + i + 1}`,
      password: generateTeamPassword(this.random),
    }));
    // Hashed in parallel on Node's worker threads, so the game server never stalls.
    const rows: NewTeamRow[] = await Promise.all(
      logins.map(async ({ code, name, password }) => ({
        code,
        name,
        passwordHash: await bcrypt.hash(password, this.rounds.team),
      })),
    );
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

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
