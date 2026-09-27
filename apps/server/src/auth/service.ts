import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
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
let dummyHash: string | undefined;
function getDummyHash(): string {
  dummyHash ??= bcrypt.hashSync('not-a-real-password', 12);
  return dummyHash;
}

async function passwordMatches(password: string, hash: string | undefined): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash ?? getDummyHash());
  } catch {
    // Not a bcrypt hash (for example a simulated team): nobody can log in with it.
    return false;
  }
}

export type SessionsEndedListener = (tokenIds: string[], code: AuthErrorCode) => void;

export class AuthService {
  private readonly listeners = new Set<SessionsEndedListener>();

  constructor(
    readonly store: AuthStore,
    private readonly tokens: Tokens,
    private readonly limiter = new LoginRateLimiter({ maxFailures: 10, windowMs: 5 * 60_000 }),
  ) {}

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
    if (this.limiter.blocked(key)) return authFail(429, 'TOO_MANY_TRIES');
    const teams = await this.store.findLoginTeams(input.code);
    if (teams.length > 1) {
      await passwordMatches(input.password, undefined);
      return authFail(409, 'AMBIGUOUS_TEAM_CODE');
    }
    const team = teams[0];
    if (!(await passwordMatches(input.password, team?.passwordHash)) || !team) {
      this.limiter.fail(key);
      return authFail(401, 'BAD_TEAM_LOGIN');
    }
    this.limiter.reset(key);
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
    const key = `staff|${ip}|${input.email.toLowerCase()}`;
    if (this.limiter.blocked(key)) return authFail(429, 'TOO_MANY_TRIES');
    const staff = await this.store.findStaffByEmail(input.email);
    const matches = await passwordMatches(input.password, staff?.passwordHash);
    if (!staff || !matches || !staff.active) {
      this.limiter.fail(key);
      return authFail(401, 'BAD_STAFF_LOGIN');
    }
    this.limiter.reset(key);
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
