import { NO_HINT_TASK_KEYS, type FragmentKind, type TaskKey } from '@magic-potion/shared';
import type { GameEngine } from '../../src/engine/engine';
import { randInt, type Rng } from '../../src/engine/rng';
import { correctSubmissions, wrongSubmission } from '../../src/engine/solver';
import { openTask, runningAttempt, type TeamState } from '../../src/engine/state';

// Simulated teams and an admin. Bots act only through the engine's normal commands,
// exactly like real players would. They peek at secret content (through the solver)
// only to know what a right answer looks like.

const SEC = 1000;
const MIN = 60 * SEC;

const between = (rng: Rng, lo: number, hi: number) => lo + rng.next() * (hi - lo);

export interface BotProfile {
  // Chance of solving a task on a given try.
  skill: number;
  // How fast the team works: fraction of the task timer it needs.
  pace: [number, number];
  hintRate: number;
  // Chance of helping another team in a money check.
  generosity: number;
}

export function makeProfile(rng: Rng, fullPotion: boolean): BotProfile {
  if (fullPotion) {
    return { skill: 1, pace: [0.15, 0.4], hintRate: between(rng, 0, 0.4), generosity: 0.5 };
  }
  const skill = between(rng, 0.35, 0.95);
  return {
    skill,
    pace: skill > 0.7 ? [0.2, 0.6] : [0.35, 0.95],
    hintRate: between(rng, 0.1, 0.7),
    generosity: between(rng, 0, 0.8),
  };
}

interface Plan {
  taskId: string;
  key: TaskKey;
  willSolve: boolean;
  solveAt: number;
  giveUpAt: number | null;
  hintAt: number | null;
  wrongAt: number[];
}

const NEEDS_FRAGMENT: Partial<Record<TaskKey, FragmentKind>> = {
  vault: 'VAULT',
  find_code: 'FIND_CODE',
};

export class TeamBot {
  private plan: Plan | null = null;
  private nextStartAt = 0;
  private nextMoneyAt = 0;
  private readonly fragmentKnownAt: Record<FragmentKind, number>;
  private readonly inboxAt = new Map<string, number>();

  constructor(
    readonly teamId: string,
    private readonly engine: GameEngine,
    private readonly rng: Rng,
    readonly profile: BotProfile,
    startAt: number,
    private readonly fullPotion: boolean,
  ) {
    // Getting a fragment takes chat with the holder team. Some teams are quicker than others.
    const [lo, hi] = fullPotion ? [1, 6] : [2, 25];
    this.fragmentKnownAt = {
      VAULT: startAt + between(rng, lo, hi) * MIN,
      FIND_CODE: startAt + between(rng, lo, hi) * MIN,
    };
    this.nextStartAt = startAt + between(rng, 0.2, 2) * MIN;
    this.nextMoneyAt = startAt + between(rng, 2, 6) * MIN;
  }

  private get team(): TeamState | undefined {
    return this.engine.state.teams[this.teamId];
  }

  async act(now: number): Promise<void> {
    const team = this.team;
    if (!team || team.status !== 'ACTIVE') return;
    await this.answerRequests();
    await this.work(now, team);
    await this.inbox(now);
    await this.money(now);
  }

  private async work(now: number, team: TeamState): Promise<void> {
    const open = openTask(team);
    if (this.plan && open?.id !== this.plan.taskId) {
      // The task ended some other way (timer ran out, or play stopped it).
      this.plan = null;
      this.nextStartAt = now + between(this.rng, 0.3, 1.5) * MIN;
    }
    if (open && this.plan) return this.continuePlan(now);
    if (open || now < this.nextStartAt || team.taskFunds < 0) return;

    const tasks = Object.values(team.tasks);
    const next =
      tasks.find((t) => t.status === 'NOT_STARTED') ?? tasks.find((t) => t.status === 'FAILED');
    if (!next) return;
    const r = await this.engine.startTask(this.teamId, next.id);
    if (!r.ok) return;
    this.plan = this.makePlan(now, next.id, next.key);
  }

  private makePlan(now: number, taskId: string, key: TaskKey): Plan {
    const rng = this.rng;
    const timer = (this.engine.state.settings.tasks.timerSeconds[key] ?? 600) * SEC;
    const [lo, hi] = this.profile.pace;
    const willSolve = rng.next() < this.profile.skill;
    const solveAt = now + timer * Math.min(0.95, between(rng, lo, hi));
    const giveUpAt = !willSolve && rng.next() < 0.35 ? now + timer * between(rng, 0.3, 0.8) : null;
    const hintAt =
      !NO_HINT_TASK_KEYS.includes(key) && rng.next() < this.profile.hintRate
        ? now + timer * between(rng, 0.05, 0.3)
        : null;
    const maxWrong = this.fullPotion || key === 'ethical_dilemma' ? 0 : key === 'hangman' ? 2 : 4;
    const wrongAt = Array.from({ length: randInt(rng, maxWrong + 1) }, () =>
      between(rng, now, Math.max(now + 1, solveAt - 5 * SEC)),
    ).sort((a, b) => a - b);
    return { taskId, key, willSolve, solveAt, giveUpAt, hintAt, wrongAt };
  }

  private async continuePlan(now: number): Promise<void> {
    const plan = this.plan as Plan;
    const state = this.engine.state;
    const content = this.engine.gameContent;

    while (plan.wrongAt.length > 0 && (plan.wrongAt[0] as number) <= now) {
      plan.wrongAt.shift();
      const wrong = wrongSubmission(state, content, this.teamId, plan.taskId);
      if (wrong !== null) await this.engine.submit(this.teamId, plan.taskId, wrong);
    }
    // A wrong letter can end Hangman.
    if (!openTask(this.team as TeamState)) return;

    if (plan.hintAt !== null && plan.hintAt <= now) {
      plan.hintAt = null;
      await this.engine.useHint(this.teamId, plan.taskId);
    }

    if (plan.giveUpAt !== null && plan.giveUpAt <= now) {
      await this.engine.giveUp(this.teamId, plan.taskId);
      this.plan = null;
      this.nextStartAt = now + between(this.rng, 0.5, 2) * MIN;
      return;
    }

    if (!plan.willSolve || plan.solveAt > now) return;
    const kind = NEEDS_FRAGMENT[plan.key];
    if (kind && now < this.fragmentKnownAt[kind]) {
      // Still waiting for the other team to share the fragment in chat.
      plan.solveAt = now + 30 * SEC;
      return;
    }
    const task = this.team?.tasks[plan.taskId];
    const attempt = task && runningAttempt(task);
    if (attempt?.lockedUntil && attempt.lockedUntil > now) {
      plan.solveAt = attempt.lockedUntil;
      return;
    }
    for (const s of correctSubmissions(state, content, this.teamId, plan.taskId)) {
      const r = await this.engine.submit(this.teamId, plan.taskId, s);
      if (!r.ok) return;
    }
    this.plan = null;
    this.nextStartAt = now + between(this.rng, 0.3, 1.5) * MIN;
  }

  private async inbox(now: number): Promise<void> {
    const team = this.team as TeamState;
    for (const item of Object.values(this.engine.state.inboxItems)) {
      if (item.releasedAt === null || item.kind === 'ALERT') continue;
      const response = team.inbox[item.id];
      const done = item.kind === 'PHOTO' ? response?.photoStatus === 'ACCEPTED' : response?.correct;
      if (done) continue;
      if (item.kind === 'QUESTION' && (response?.attempts ?? 0) >= 3) continue;
      // A rejected photo gets a new upload a little later.
      const key = `${item.id}:${response?.photoStatus ?? ''}:${response?.attempts ?? 0}`;
      let at = this.inboxAt.get(key);
      if (at === undefined) {
        at = now + between(this.rng, 0.5, 6) * MIN;
        this.inboxAt.set(key, at);
      }
      if (now < at) continue;
      if (item.kind === 'PHOTO') {
        if (this.fullPotion || this.rng.next() < 0.9) {
          await this.engine.submitPhoto(
            this.teamId,
            item.id,
            `https://example.com/${this.teamId}.jpg`,
          );
        } else {
          this.inboxAt.set(key, Infinity); // this team never sends a photo
        }
      } else {
        const right = this.fullPotion || this.rng.next() < this.profile.skill;
        const answer = right ? (item.secretAnswer?.[0] ?? '') : 'no idea';
        await this.engine.answerInbox(this.teamId, item.id, answer);
      }
    }
  }

  private async answerRequests(): Promise<void> {
    const team = this.team as TeamState;
    for (const r of Object.values(this.engine.state.requests)) {
      if (r.payerTeamId !== this.teamId || r.status !== 'PENDING') continue;
      const canPay = team.taskFunds - r.amount >= 2_000;
      if (canPay && this.rng.next() < 0.5 + this.profile.generosity / 2) {
        await this.engine.acceptRequest(this.teamId, r.id);
      } else {
        await this.engine.declineRequest(this.teamId, r.id);
      }
    }
  }

  private async money(now: number): Promise<void> {
    if (now < this.nextMoneyAt) return;
    this.nextMoneyAt = now + between(this.rng, 1.5, 5) * MIN;
    const team = this.team as TeamState;
    const others = Object.values(this.engine.state.teams)
      .filter((t) => t.id !== this.teamId && t.status === 'ACTIVE')
      .sort((a, b) => a.code.localeCompare(b.code));

    if (team.taskFunds < 0) {
      // Ask a team with plenty of funds for help.
      const rich = others.filter((t) => t.taskFunds > 6_000);
      const payer = rich[randInt(this.rng, rich.length)];
      if (payer) await this.engine.requestFunds(this.teamId, payer.id, -team.taskFunds + 500);
      return;
    }
    if (this.rng.next() >= this.profile.generosity) return;
    const inNeed = others.filter((t) => t.taskFunds < 0);
    const target = inNeed[0] ?? others[randInt(this.rng, others.length)];
    if (!target) return;
    const amount =
      target.taskFunds < 0
        ? Math.min(-target.taskFunds + 500, 3_000)
        : 100 * (1 + randInt(this.rng, 15));
    if (team.taskFunds - amount >= 3_000)
      await this.engine.sendFunds(this.teamId, target.id, amount);
  }
}

// The admin: starts the game, pauses and resumes once, rejects a photo, extends Round 2,
// optionally removes teams, and ends the game after the Reveal.
export class AdminBot {
  private frozeAt: number | null = null;
  private didFreeze = false;
  private didExtend = false;
  private didReject = false;
  private removed = 0;

  constructor(
    private readonly engine: GameEngine,
    private readonly staffUserId: string,
    private readonly t0: number,
    private readonly removeTeams: number,
  ) {}

  async act(now: number): Promise<void> {
    const s = this.engine.state;
    if (s.phase === 'LOBBY') {
      const r = await this.engine.startGame(this.staffUserId);
      if (!r.ok) throw new Error(`Could not start the game: ${r.message}`);
      return;
    }
    if (!this.didFreeze && s.phase === 'ROUND1' && now >= this.t0 + 20 * MIN) {
      this.didFreeze = true;
      this.frozeAt = now;
      await this.engine.freeze(this.staffUserId);
      return;
    }
    if (this.frozeAt !== null && now >= this.frozeAt + 90 * SEC) {
      this.frozeAt = null;
      await this.engine.resume(this.staffUserId);
      return;
    }
    if (!this.didReject && now >= this.t0 + 16 * MIN) {
      const team = Object.values(s.teams)
        .sort((a, b) => a.code.localeCompare(b.code))
        .find((t) => Object.values(t.inbox).some((r) => r.photoStatus === 'ACCEPTED'));
      const photo = team && Object.values(team.inbox).find((r) => r.photoStatus === 'ACCEPTED');
      if (team && photo) {
        this.didReject = true;
        await this.engine.rejectPhoto(
          this.staffUserId,
          team.id,
          photo.inboxItemId,
          'Not the whole team',
        );
      }
    }
    if (this.removed < this.removeTeams && s.phase === 'ROUND2') {
      const team = Object.values(s.teams)
        .filter((t) => t.status === 'ACTIVE')
        .sort((a, b) => b.code.localeCompare(a.code))[0];
      if (team) {
        this.removed++;
        await this.engine.removeTeam(this.staffUserId, team.id, 'Team left the event');
      }
    }
    if (
      !this.didExtend &&
      s.phase === 'ROUND2' &&
      s.phaseEndsAt !== null &&
      s.phaseEndsAt - now <= 5 * MIN
    ) {
      this.didExtend = true;
      await this.engine.extendPhase(this.staffUserId, 60);
      return;
    }
    // Transfers still in transit arrive within the delay after play ends; then end the game.
    const delay = s.settings.transfers.delaySeconds * SEC;
    if (
      s.phase === 'REVEAL' &&
      s.endedAt === null &&
      now >= (s.phaseStartedAt ?? now) + delay + 5 * SEC
    ) {
      await this.engine.endPhase(this.staffUserId);
    }
  }
}
