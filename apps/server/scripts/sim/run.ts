import { TASKS_PER_TEAM, type GamePhase, type LedgerKind, type Wallet } from '@magic-potion/shared';
import type { FakeClock } from '../../src/engine/clock';
import type { GameEngine } from '../../src/engine/engine';
import type { EngineEvent } from '../../src/engine/events';
import type { Leaderboard } from '../../src/engine/leaderboard';
import { playMsElapsed } from '../../src/engine/playClock';
import type { Potion } from '../../src/engine/potion';
import { seededRng, shuffle } from '../../src/engine/rng';
import { runningAttempt, tasksDone, type GameState } from '../../src/engine/state';
import { findBalanceMismatches, sumLedger } from '../../src/ledger/balances';
import { AdminBot, TeamBot, makeProfile } from './bots';

// Plays a full game with simulated teams on a fake clock, then checks the result.

export interface LedgerRow {
  teamId: string;
  wallet: Wallet;
  amount: number;
  kind: LedgerKind;
  balanceAfter: number;
}

export interface SimSetup {
  engine: GameEngine;
  clock: FakeClock;
  staffUserId: string;
  // Reads every ledger row written for the game (memory log or database).
  ledgerRows(): Promise<LedgerRow[]>;
}

export interface SimOptions {
  seed: number;
  fullPotion: boolean;
  removeTeams: number;
  stepMs?: number;
}

export interface TimelineEntry {
  playClock: string;
  wallClock: string;
  text: string;
}

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface SimResult {
  leaderboard: Leaderboard;
  halftime: Potion | undefined;
  final: Potion | undefined;
  timeline: TimelineEntry[];
  counts: Record<string, number>;
  checks: Check[];
  state: GameState;
}

const MIN = 60_000;

function mmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const PHASE_TEXT: Record<GamePhase, string> = {
  LOBBY: 'Lobby',
  ROUND1: 'Round 1 started',
  PAUSE: 'Pause started (halftime potion saved)',
  ROUND2: 'Round 2 started',
  REVEAL: 'Play ended, Reveal started',
};

export async function runSimulation(setup: SimSetup, opts: SimOptions): Promise<SimResult> {
  const { engine, clock } = setup;
  const t0 = clock.now();
  const rng = seededRng(opts.seed);
  const stepMs = opts.stepMs ?? 5_000;
  const counts: Record<string, number> = {};
  const timeline: TimelineEntry[] = [];
  const bump = (key: string) => (counts[key] = (counts[key] ?? 0) + 1);

  engine.onEvents((events: readonly EngineEvent[]) => {
    for (const e of events) {
      const s = engine.state;
      const at = 'at' in e ? e.at : clock.now();
      const stamp = { playClock: mmss(playMsElapsed(s, at)), wallClock: mmss(at - t0) };
      switch (e.type) {
        case 'phaseChanged':
          timeline.push({ ...stamp, text: PHASE_TEXT[e.phase] });
          break;
        case 'frozen':
          timeline.push({ ...stamp, text: 'Admin paused the game' });
          break;
        case 'resumed':
          timeline.push({ ...stamp, text: 'Admin resumed the game' });
          break;
        case 'extended':
          timeline.push({ ...stamp, text: `Admin extended the phase by ${e.seconds} seconds` });
          break;
        case 'teamRemoved':
          timeline.push({ ...stamp, text: `Admin removed ${s.teams[e.teamId]?.name}` });
          break;
        case 'gameEnded':
          timeline.push({ ...stamp, text: 'Admin ended the game' });
          break;
        case 'teamFinished':
          bump('teams finished');
          break;
        case 'taskEnded':
          bump(`task ${e.result.toLowerCase().replace(/_/g, ' ')}`);
          break;
        case 'taskChecked':
          if (e.status === 'wrong') bump('wrong answers');
          break;
        case 'requestDecided': {
          const status = s.requests[e.requestId]?.status.toLowerCase();
          bump(`requests ${status}`);
          break;
        }
        default:
          bump(
            {
              taskStarted: 'tasks started',
              taskSolved: 'tasks solved',
              hintUsed: 'hints used',
              lockedOut: 'code lockouts',
              transferSent: 'transfers sent',
              transferArrived: 'transfers arrived',
              requestCreated: 'requests made',
              inboxReleased: 'inbox tasks released',
              inboxAnswered: 'inbox answers',
              photoReviewed: 'photos rejected',
              potionChanged: 'potion changes',
              chatSent: 'chat messages',
              alertPosted: 'game alerts',
            }[e.type] ?? e.type,
          );
      }
    }
  });

  const teamIds = Object.values(engine.state.teams)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((t) => t.id);
  const bots = teamIds.map(
    (id) => new TeamBot(id, engine, rng, makeProfile(rng, opts.fullPotion), t0, opts.fullPotion),
  );
  const admin = new AdminBot(engine, setup.staffUserId, t0, opts.removeTeams);

  let maxOpenTasks = 0;
  for (let now = t0; engine.state.endedAt === null; now += stepMs) {
    if (now > t0 + 6 * 60 * MIN) throw new Error('The simulated game did not end');
    clock.set(now);
    await engine.tick();
    await admin.act(now);
    for (const bot of shuffle(rng, bots)) await bot.act(now);
    for (const team of Object.values(engine.state.teams)) {
      const open = Object.values(team.tasks).filter((t) => runningAttempt(t)).length;
      maxOpenTasks = Math.max(maxOpenTasks, open);
    }
  }
  await engine.idle();

  const state = engine.state as GameState;
  const leaderboard = engine.leaderboard();
  const rows = await setup.ledgerRows();
  return {
    leaderboard,
    halftime: state.potionSnapshots.HALFTIME,
    final: state.potionSnapshots.FINAL,
    timeline,
    counts,
    checks: runChecks(state, leaderboard, rows, maxOpenTasks),
    state,
  };
}

// Independent checks. The score is recomputed here from raw state with its own formula,
// not with the engine's scoring function, so a scoring bug would show up as a mismatch.
function runChecks(
  state: GameState,
  lb: Leaderboard,
  rows: LedgerRow[],
  maxOpenTasks: number,
): Check[] {
  const checks: Check[] = [];
  const s = state.settings;

  const mismatches = findBalanceMismatches(Object.values(state.teams), sumLedger(rows));
  checks.push({
    name: 'Ledger matches every team balance',
    ok: mismatches.length === 0,
    detail: mismatches.length
      ? JSON.stringify(mismatches.slice(0, 3))
      : `${rows.length} ledger rows`,
  });

  const sent = rows.filter((r) => r.kind === 'TRANSFER_OUT').reduce((a, r) => a - r.amount, 0);
  const arrived = rows.filter((r) => r.kind === 'TRANSFER_IN').reduce((a, r) => a + r.amount, 0);
  const inTransit = Object.values(state.transfers)
    .filter((t) => t.arrivedAt === null)
    .reduce((a, t) => a + t.amount, 0);
  checks.push({
    name: 'Money is conserved (sent = arrived + in transit)',
    ok: sent === arrived + inTransit,
    detail: `sent ${sent}, arrived ${arrived}, in transit ${inTransit}`,
  });

  const badNegatives = rows.filter(
    (r) =>
      r.wallet === 'TASK' &&
      r.balanceAfter < 0 &&
      r.amount < 0 &&
      r.kind !== 'FAIL_PENALTY' &&
      r.kind !== 'STAFF_ADJUST',
  );
  checks.push({
    name: 'Task Funds went below zero only through fail penalties',
    ok: badNegatives.length === 0,
    detail: badNegatives.length ? JSON.stringify(badNegatives.slice(0, 3)) : undefined,
  });

  const supportNegative = rows.filter((r) => r.wallet === 'SUPPORT' && r.balanceAfter < 0);
  checks.push({ name: 'Support Funds never went below zero', ok: supportNegative.length === 0 });

  checks.push({
    name: 'No team ever had 2 open tasks',
    ok: maxOpenTasks <= 1,
    detail: `most open at once: ${maxOpenTasks}`,
  });

  const noneRunning = Object.values(state.teams).every((t) =>
    Object.values(t.tasks).every((task) => !runningAttempt(task)),
  );
  checks.push({ name: 'No task is still running after play ended', ok: noneRunning });

  const active = Object.values(state.teams).filter((t) => t.status === 'ACTIVE');
  const completed = active.filter((t) => tasksDone(t) === TASKS_PER_TEAM).length;
  checks.push({
    name: 'Potion = teams with all 5 tasks / active teams',
    ok: lb.potion.completedTeams === completed && lb.potion.totalTeams === active.length,
    detail: `${completed} of ${active.length}`,
  });
  checks.push({
    name: 'Leaderboard is valid only if the potion is full',
    ok: lb.valid === (completed === active.length),
  });

  const given = new Map<string, number>();
  const received = new Map<string, number>();
  for (const t of Object.values(state.transfers)) {
    if (t.arrivedAt === null) continue;
    given.set(t.fromTeamId, (given.get(t.fromTeamId) ?? 0) + t.amount);
    received.set(t.toTeamId, (received.get(t.toTeamId) ?? 0) + t.amount);
  }
  const wrong: string[] = [];
  for (const e of lb.entries) {
    const team = state.teams[e.teamId];
    if (!team) continue;
    const done = Object.values(team.tasks).filter((t) => t.status === 'DONE').length;
    const inbox = Object.values(team.inbox).filter((r) =>
      state.inboxItems[r.inboxItemId]?.kind === 'PHOTO' ? r.photoStatus === 'ACCEPTED' : r.correct,
    ).length;
    const g = given.get(team.id) ?? 0;
    const expected =
      10_000 * done +
      (done === 5 ? 5 * (team.finishPlaySecondsRemaining ?? 0) : 0) +
      2 * team.taskFunds +
      1_000 * inbox +
      Math.min(Math.floor((3 * g) / 2), 10_000) -
      2 * (received.get(team.id) ?? 0) +
      (lb.valid ? 15_000 : 0);
    const parts = e.score;
    const sum =
      parts.taskPoints +
      parts.timeBonus +
      parts.taskFundsPoints +
      parts.inboxBonus +
      parts.collaborationBonus +
      parts.fundsReceivedPoints +
      parts.potionBonus;
    if (sum !== parts.total || expected !== parts.total || !Number.isInteger(parts.total)) {
      wrong.push(`${e.name}: engine ${parts.total}, columns ${sum}, recomputed ${expected}`);
    }
  }
  const usesDefaults =
    s.scoring.pointsPerTask === 10_000 &&
    s.scoring.timeBonusPerSecond === 5 &&
    s.scoring.taskFundsMultiplier === 2 &&
    s.scoring.collaborationMultiplier === 1.5 &&
    s.scoring.collaborationCap === 10_000 &&
    s.scoring.receivedMultiplier === 2 &&
    s.scoring.fullPotionBonus === 15_000 &&
    s.inbox.reward === 1_000;
  checks.push({
    name: 'Every score matches an independent recount (GAME_RULES section 9)',
    ok: usesDefaults && wrong.length === 0,
    detail: !usesDefaults
      ? 'the recount assumes default scoring settings'
      : wrong.slice(0, 3).join('; ') || undefined,
  });

  const ranksOk = lb.entries.every((e, i) => {
    const prev = lb.entries[i - 1];
    if (!prev) return e.rank === 1;
    return prev.score.total === e.score.total ? e.rank === prev.rank : e.rank === i + 1;
  });
  checks.push({ name: 'Ranks follow scores, ties share a rank', ok: ranksOk });

  return checks;
}
