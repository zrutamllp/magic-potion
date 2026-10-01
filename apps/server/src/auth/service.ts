import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import {
  AUTH_ERRORS,
  type AuthErrorCode,
  type StaffLogin,
  type StaffLoginResponse,
  type TeamLogin,
  type TeamLoginResponse,
} from '@magic-potion/shared';
import { LoginRateLimiter } from './rateLimit';
import type { AuthStore, StaffAccount } from './store';
import type { TeamClaims, Tokens } from './tokens';

export type AuthResult<T> =
  { ok: true; value: T } | { ok: false; status: number; code: AuthErrorCode; message: string };

export function authFail<T = never>(status: number, code: AuthErrorCode): AuthResult<T> {
  return { ok: false, status, code, message: AUTH_ERRORS[code] };
}

// Compared against when no account matches, so a wrong code takes as long as a wrong password.
// Native bcrypt hashes and compares on Node's worker threads, never on the main thread, so a
// room full of teams logging in at once does not freeze the live games (Phase 7C).
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('not-a-real-password', 12);
  return dummyHash;
}

async function passwordMatches(password: string, hash: string | undefined): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash ?? (await getDummyHash()));
  } catch {
    // Not a bcrypt hash (for example a simulated team): nobody can log in with it.
    return false;
  }
}

export type SessionsEndedListener = (tokenIds: string[], code: AuthErrorCode) => void;

// Login limits (Phase 7A). In-room events put every team behind one office Wi-Fi address and
// remote teams often share a VPN address, so the limit that counts all codes from one address
// is high: it only stops real attacks. Staff can clear a game's limits at once.
export interface LoginLimits {
  // Wrong passwords for one team code from one address.
  perCode: { maxFailures: number; windowMs: number };
  // Failed logins of any kind from one address (a setting: LOGIN_FAILURES_PER_ADDRESS).
  perAddress: { maxFailures: number; windowMs: number };
  // Wrong passwords for one staff email, from anywhere.
  perStaffEmail: { maxFailures: number; windowMs: number };
}

const MIN = 60_000;
export const DEFAULT_LOGIN_LIMITS: LoginLimits = {
  perCode: { maxFailures: 10, windowMs: 5 * MIN },
  perAddress: { maxFailures: 200, windowMs: 10 * MIN },
  perStaffEmail: { maxFailures: 5, windowMs: 15 * MIN },
};

export class AuthService {
  private readonly listeners = new Set<SessionsEndedListener>();

  private readonly perCode: LoginRateLimiter;
  private readonly perAddress: LoginRateLimiter;
  private readonly perStaffEmail: LoginRateLimiter;

  constructor(
    readonly store: AuthStore,
    private readonly tokens: Tokens,
    limits: LoginLimits = DEFAULT_LOGIN_LIMITS,
    now?: () => number,
  ) {
    this.perCode = new LoginRateLimiter({ ...limits.perCode, now });
    this.perAddress = new LoginRateLimiter({ ...limits.perAddress, now });
    this.perStaffEmail = new LoginRateLimiter({ ...limits.perStaffEmail, now });
  }

  // "Unblock logins" (main admin, audited by the caller): forgets the failed logins for these
  // team codes from every address, and every address count, so a room behind one Wi-Fi can log
  // in at once. Returns how many limits were cleared.
  unblockTeamLogins(codes: string[]): number {
    const lower = new Set(codes.map((c) => c.toLowerCase()));
    return (
      this.perCode.clear((key) => lower.has(key.slice(key.lastIndexOf('|') + 1))) +
      this.perAddress.clear(() => true)
    );
  }

  // The real-time layer listens, to tell and disconnect the browsers of ended sessions.
  onSessionsEnded(listener: SessionsEndedListener): void {
    this.listeners.add(listener);
  }

  private sessionsEnded(tokenIds: string[], code: AuthErrorCode): void {
    if (tokenIds.length === 0) return;
    for (const l of this.listeners) l(tokenIds, code);
  }

  // One login per team: a new login ends the older session (GAME_RULES section 1).
  async loginTeam(input: TeamLogin, ip: string): Promise<AuthResult<TeamLoginResponse>> {
    const key = `team|${ip}|${input.code.toLowerCase()}`;
    const address = `address|${ip}`;
    if (this.perCode.blocked(key) || this.perAddress.blocked(address)) {
      return authFail(429, 'TOO_MANY_TRIES');
    }
    const teams = await this.store.findLoginTeams(input.code);
    if (teams.length > 1) {
      await passwordMatches(input.password, undefined);
      return authFail(409, 'AMBIGUOUS_TEAM_CODE');
    }
    const team = teams[0];
    if (!(await passwordMatches(input.password, team?.passwordHash)) || !team) {
      this.perCode.fail(key);
      this.perAddress.fail(address);
      return authFail(401, 'BAD_TEAM_LOGIN');
    }
    this.perCode.reset(key);
    const tokenId = randomUUID();
    const { endedTokenIds } = await this.store.openTeamSession(team.id, tokenId);
    this.sessionsEnded(endedTokenIds, 'SESSION_REPLACED');
    return {
      ok: true,
      value: {
        token: this.tokens.signTeam({ teamId: team.id, gameId: team.gameId, tokenId }),
        teamId: team.id,
        teamName: team.name,
        gameId: team.gameId,
      },
    };
  }

  async loginStaff(input: StaffLogin, ip: string): Promise<AuthResult<StaffLoginResponse>> {
    // Staff: counted per email from anywhere, so guessing one account from many addresses
    // stops too.
    const key = `staff|${input.email.toLowerCase()}`;
    const address = `address|${ip}`;
    if (this.perStaffEmail.blocked(key) || this.perAddress.blocked(address)) {
      return authFail(429, 'TOO_MANY_TRIES');
    }
    const staff = await this.store.findStaffByEmail(input.email);
    const matches = await passwordMatches(input.password, staff?.passwordHash);
    if (!staff || !matches || !staff.active) {
      this.perStaffEmail.fail(key);
      this.perAddress.fail(address);
      return authFail(401, 'BAD_STAFF_LOGIN');
    }
    this.perStaffEmail.reset(key);
    return {
      ok: true,
      value: {
        token: this.tokens.signStaff({ staffUserId: staff.id }),
        staff: { id: staff.id, name: staff.name, role: staff.role },
      },
    };
  }

  // A team token is good only while its session is open.
  async verifyTeam(token: unknown): Promise<AuthResult<TeamClaims>> {
    const claims = this.tokens.verify(token);
    if (!claims || claims.kind !== 'team') return authFail(401, 'NOT_LOGGED_IN');
    const session = await this.store.teamSession(claims.tokenId);
    if (!session || session.teamId !== claims.teamId) return authFail(401, 'NOT_LOGGED_IN');
    if (!session.open) return authFail(401, 'SESSION_ENDED');
    return { ok: true, value: claims };
  }

  async verifyStaff(token: unknown): Promise<AuthResult<StaffAccount>> {
    const claims = this.tokens.verify(token);
    if (!claims || claims.kind !== 'staff') return authFail(401, 'NOT_LOGGED_IN');
    const staff = await this.store.findStaff(claims.staffUserId);
    if (!staff || !staff.active) return authFail(401, 'NOT_LOGGED_IN');
    return { ok: true, value: staff };
  }

  // Main admin: any team. Co-facilitator: assigned teams only (GAME_RULES section 11).
  async canManageTeam(staff: StaffAccount, gameId: string, teamId: string): Promise<boolean> {
    if (staff.role === 'MAIN_ADMIN') return true;
    return (await this.store.assignedTeamIds(staff.id, gameId)).includes(teamId);
  }

  // Ends a team's open logins and tells their browsers. The caller audits the reason.
  async endSessions(teamId: string, reason: string): Promise<void> {
    this.sessionsEnded(await this.store.endTeamSessions(teamId, reason), 'SESSION_ENDED');
  }

  // Staff "reset session": the team must log in again. Audited.
  async endTeamSession(staff: StaffAccount, teamId: string): Promise<AuthResult<null>> {
    const gameId = await this.store.teamGameId(teamId);
    if (!gameId) return authFail(404, 'GAME_NOT_FOUND');
    if (!(await this.canManageTeam(staff, gameId, teamId))) return authFail(403, 'NOT_ALLOWED');
    const ended = await this.store.endTeamSessions(teamId, 'STAFF_RESET');
    await this.store.audit({
      gameId,
      staffUserId: staff.id,
      teamId,
      action: 'END_TEAM_SESSION',
      before: { openSessions: ended.length },
      after: { openSessions: 0 },
    });
    this.sessionsEnded(ended, 'SESSION_ENDED');
    return { ok: true, value: null };
  }
}
