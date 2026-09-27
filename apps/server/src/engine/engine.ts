import type { EngineResult } from '@magic-potion/shared';
import type { Clock } from './clock';
import { Draft } from './draft';
import type { EngineEvent, EngineListener } from './events';
import { buildLeaderboard, type Leaderboard } from './leaderboard';
import type { Persistence } from './persistence/types';
import type { Potion } from './potion';
import type { Rng } from './rng';
import {
  advancePhase,
  endPhase,
  extendPhase,
  freezeGame,
  removeTeam,
  resumeGame,
  startGame,
} from './rules/phases';
import { potionOf } from './rules/timers';
import { nextDue, type DueEvent } from './scheduler';
import { tasksDone, type GameContent, type GameState } from './state';

export interface EngineOptions {
  state: GameState;
  content: GameContent;
  persistence: Persistence;
  clock: Clock;
  rng: Rng;
  // On the server a timer fires tick() at the next due time. Tests and the simulation
  // turn this off and call tick() themselves after moving the fake clock.
  autoTick?: boolean;
}

// One engine per live game. Commands run one at a time. Each works on a private copy of the
// state, saves its changes in one transaction, and only then replaces the live state.
export class GameEngine {
  private current: GameState;
  private readonly content: GameContent;
  private readonly persistence: Persistence;
  private readonly clock: Clock;
  private readonly rng: Rng;
  private readonly autoTick: boolean;
  private queue: Promise<unknown> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<EngineListener>();

  constructor(opts: EngineOptions) {
    this.current = opts.state;
    this.content = opts.content;
    this.persistence = opts.persistence;
    this.clock = opts.clock;
    this.rng = opts.rng;
    this.autoTick = opts.autoTick ?? false;
  }

  get state(): Readonly<GameState> {
    return this.current;
  }

  get gameContent(): Readonly<GameContent> {
    return this.content;
  }

  onEvents(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------- Staff commands ----------

  startGame(staffUserId: string) {
    return this.run((d) => startGame(d, staffUserId));
  }

  freeze(staffUserId: string) {
    return this.run((d) => freezeGame(d, staffUserId));
  }

  resume(staffUserId: string) {
    return this.run((d) => resumeGame(d, staffUserId));
  }

  extendPhase(staffUserId: string, seconds: number) {
    return this.run((d) => extendPhase(d, staffUserId, seconds));
  }

  endPhase(staffUserId: string) {
    return this.run((d) => endPhase(d, staffUserId));
  }

  removeTeam(staffUserId: string, teamId: string, reason: string) {
    return this.run((d) => removeTeam(d, staffUserId, teamId, reason));
  }

  // ---------- Scheduler ----------

  // Handles every event that is due by now, each at its own due time.
  tick(): Promise<void> {
    return this.enqueue(() => this.processDue(this.clock.now()));
  }

  nextDueAt(): number | null {
    return nextDue(this.current)?.at ?? null;
  }

  // Waits for every queued command to finish.
  idle(): Promise<void> {
    return this.enqueue(async () => {});
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // ---------- Queries ----------

  potion(): Potion {
    return potionOf(this.current);
  }

  // The Full Potion Bonus is added only at the Reveal.
  leaderboard(): Leaderboard {
    const s = this.current;
    const given = new Map<string, number>();
    const received = new Map<string, number>();
    for (const t of Object.values(s.transfers)) {
      if (t.arrivedAt === null) continue;
      given.set(t.fromTeamId, (given.get(t.fromTeamId) ?? 0) + t.amount);
      received.set(t.toTeamId, (received.get(t.toTeamId) ?? 0) + t.amount);
    }
    const teams = Object.values(s.teams).map((team) => ({
      teamId: team.id,
      name: team.name,
      status: team.status,
      tasksCompleted: tasksDone(team),
      finishPlaySecondsRemaining: team.finishPlaySecondsRemaining,
      taskFunds: team.taskFunds,
      inboxCompleted: Object.values(team.inbox).filter((r) => {
        const item = s.inboxItems[r.inboxItemId];
        return item?.kind === 'PHOTO' ? r.photoStatus === 'ACCEPTED' : r.correct;
      }).length,
      fundsGiven: given.get(team.id) ?? 0,
      fundsReceived: received.get(team.id) ?? 0,
    }));
    return buildLeaderboard(teams, s.settings, potionOf(s), {
      includePotionBonus: s.phase === 'REVEAL',
    });
  }

  // ---------- Internals ----------

  protected run<T>(command: (d: Draft) => EngineResult<T>): Promise<EngineResult<T>> {
    return this.enqueue(async () => {
      const now = this.clock.now();
      await this.processDue(now);
      const d = this.draft(now);
      const result = command(d);
      if (result.ok) await this.commit(d);
      return result;
    });
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    // Keep the queue going even if a job fails; the caller still sees the error.
    this.queue = next.catch(() => {});
    return next;
  }

  private draft(now: number): Draft {
    return new Draft(structuredClone(this.current), this.content, now, this.rng);
  }

  private async commit(d: Draft): Promise<void> {
    if (d.changes.length > 0) await this.persistence.commit(this.current.id, d.changes);
    this.current = d.state;
    this.notify(d.events);
    this.arm();
  }

  private async processDue(now: number): Promise<void> {
    // Each handler removes its own event from the due list, so this always ends.
    for (let due = nextDue(this.current); due && due.at <= now; due = nextDue(this.current)) {
      const d = this.draft(due.at);
      handleDue(d, due);
      await this.commit(d);
    }
    this.arm();
  }

  private notify(events: readonly EngineEvent[]): void {
    if (events.length === 0) return;
    for (const listener of this.listeners) listener(events);
  }

  private arm(): void {
    if (!this.autoTick) return;
    this.stop();
    const at = this.nextDueAt();
    if (at === null) return;
    this.timer = setTimeout(() => void this.tick(), Math.max(0, at - this.clock.now()));
  }
}

function handleDue(d: Draft, due: DueEvent): void {
  switch (due.kind) {
    case 'phaseEnd':
      advancePhase(d);
      return;
    case 'inboxRelease':
      d.releaseInboxItem(due.itemId);
      d.emit({ type: 'inboxReleased', itemId: due.itemId });
      return;
    case 'transferArrival':
    case 'taskTimeout':
      // Added with the funds and task rules.
      throw new Error(`Unhandled due event ${due.kind}`);
  }
}
