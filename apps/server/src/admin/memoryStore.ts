import type { AdminInboxItem, GameSettings, StaffMember } from '@magic-potion/shared';
import type { MemoryAuthStore } from '../auth/memoryStore';
import type { NewTeamRow } from '../engine/dbGame';
import type { AdminAuditEntry, AdminStore, StoredGame } from './store';

// An in-memory AdminStore for tests. It shares teams, staff and assignments with a
// MemoryAuthStore, so a team made here can log in through the auth routes.

interface MemoryGame {
  id: string;
  name: string;
  phase: StoredGame['phase'];
  startedAt: Date | null;
  endedAt: Date | null;
  archivedAt: Date | null;
  contentPackId: string | null;
  dilemmaItemId: string | null;
  settings: unknown;
}

export class MemoryAdminStore implements AdminStore {
  games: MemoryGame[] = [];
  statuses = new Map<string, 'ACTIVE' | 'REMOVED'>();
  audits: AdminAuditEntry[] = [];
  inbox = new Map<string, AdminInboxItem[]>();
  private nextId = 1;

  constructor(private readonly auth: MemoryAuthStore) {}

  private id(prefix: string): string {
    return `${prefix}-new-${this.nextId++}`;
  }

  async createGame(name: string, settings: GameSettings, teams: NewTeamRow[]): Promise<string> {
    const id = this.id('game');
    this.games.push({
      id,
      name,
      phase: 'LOBBY',
      startedAt: null,
      endedAt: null,
      archivedAt: null,
      contentPackId: null,
      dilemmaItemId: null,
      settings,
    });
    // The sample inbox: the photo task and 2 questions.
    this.inbox.set(id, [
      {
        id: `${id}-photo`,
        kind: 'PHOTO',
        title: 'Team photo',
        body: 'Upload a photo.',
        answers: [],
        releaseAtPlaySeconds: 600,
      },
      {
        id: `${id}-q1`,
        kind: 'QUESTION',
        title: 'Quick maths',
        body: 'What is 7 x 8?',
        answers: ['56'],
        releaseAtPlaySeconds: 1800,
      },
      {
        id: `${id}-q2`,
        kind: 'QUESTION',
        title: 'Finish the saying',
        body: 'Many hands make light ____.',
        answers: ['work'],
        releaseAtPlaySeconds: 3300,
      },
    ]);
    this.auth.games.push({ id, name, phase: 'LOBBY' });
    await this.addTeams(id, teams);
    return id;
  }

  async game(gameId: string): Promise<StoredGame | null> {
    const g = this.games.find((x) => x.id === gameId);
    if (!g) return null;
    return {
      ...g,
      teams: this.auth.teams
        .filter((t) => t.gameId === gameId)
        .map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          status: this.statuses.get(t.id) ?? 'ACTIVE',
        })),
      assignments: this.auth.assignments
        .filter((a) => a.gameId === gameId)
        .map(({ staffUserId, teamId }) => ({ staffUserId, teamId })),
    };
  }

  async renameGame(gameId: string, name: string): Promise<void> {
    this.games.find((g) => g.id === gameId)!.name = name;
  }

  async saveSettings(gameId: string, settings: GameSettings): Promise<void> {
    this.games.find((g) => g.id === gameId)!.settings = settings;
  }

  async allTeamCodes(): Promise<string[]> {
    return this.auth.teams.map((t) => t.code);
  }

  async addTeams(gameId: string, teams: NewTeamRow[]): Promise<void> {
    for (const t of teams) this.auth.teams.push({ ...t, id: this.id('team'), gameId });
  }

  async renameTeam(teamId: string, name: string): Promise<void> {
    this.auth.teams.find((t) => t.id === teamId)!.name = name;
  }

  async deleteTeam(teamId: string): Promise<void> {
    this.auth.teams = this.auth.teams.filter((t) => t.id !== teamId);
    this.auth.assignments = this.auth.assignments.filter((a) => a.teamId !== teamId);
    this.auth.sessions = this.auth.sessions.filter((s) => s.teamId !== teamId);
  }

  async setTeamPasswords(rows: { teamId: string; passwordHash: string }[]): Promise<void> {
    for (const r of rows) {
      this.auth.teams.find((t) => t.id === r.teamId)!.passwordHash = r.passwordHash;
    }
  }

  private member(id: string): StaffMember | null {
    const s = this.auth.staff.find((x) => x.id === id);
    return s ? { id: s.id, name: s.name, email: s.email, role: s.role, active: s.active } : null;
  }

  async staffList(): Promise<StaffMember[]> {
    return this.auth.staff.map((s) => this.member(s.id)!);
  }

  async staffByEmail(email: string): Promise<StaffMember | null> {
    const s = this.auth.staff.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return s ? this.member(s.id) : null;
  }

  async staffById(id: string): Promise<StaffMember | null> {
    return this.member(id);
  }

  async createStaff(row: { name: string; email: string; passwordHash: string }) {
    const id = this.id('staff');
    this.auth.staff.push({ ...row, id, role: 'CO_FACILITATOR', active: true });
    return this.member(id)!;
  }

  async updateStaff(id: string, patch: { name?: string; active?: boolean }) {
    Object.assign(
      this.auth.staff.find((s) => s.id === id)!,
      patch,
    );
    return this.member(id)!;
  }

  async setStaffPassword(id: string, passwordHash: string): Promise<void> {
    this.auth.staff.find((s) => s.id === id)!.passwordHash = passwordHash;
  }

  async setAssignments(gameId: string, staffUserId: string, teamIds: string[]): Promise<void> {
    this.auth.assignments = [
      ...this.auth.assignments.filter((a) => a.gameId !== gameId || a.staffUserId !== staffUserId),
      ...teamIds.map((teamId) => ({ gameId, staffUserId, teamId })),
    ];
  }

  async inboxItems(gameId: string): Promise<AdminInboxItem[]> {
    return structuredClone(this.inbox.get(gameId) ?? []);
  }

  async updateInboxItem(
    itemId: string,
    patch: { title: string; body: string; answers: string[] | null },
  ): Promise<void> {
    for (const items of this.inbox.values()) {
      const item = items.find((i) => i.id === itemId);
      if (item) {
        item.title = patch.title;
        item.body = patch.body;
        if (patch.answers) item.answers = patch.answers;
      }
    }
  }

  async setArchived(gameId: string, at: Date | null): Promise<void> {
    this.games.find((g) => g.id === gameId)!.archivedAt = at;
  }

  async deleteGame(gameId: string): Promise<void> {
    const g = this.games.find((x) => x.id === gameId);
    if (!g || g.startedAt) throw new Error('Only a game that never started can be deleted.');
    this.games = this.games.filter((x) => x.id !== gameId);
    this.auth.games = this.auth.games.filter((x) => x.id !== gameId);
    this.auth.teams = this.auth.teams.filter((t) => t.gameId !== gameId);
    this.inbox.delete(gameId);
  }

  async audit(entry: AdminAuditEntry): Promise<void> {
    this.audits.push(entry);
  }
}
