import { TASKS_PER_TEAM, type GameSettings } from '@magic-potion/shared';

// The scoring engine (GAME_RULES section 9). Pure: no I/O, no clock.
// Never change this without updating scoring.test.ts.

export interface ScoreInput {
  tasksCompleted: number;
  // Play seconds left when the team completed its 5th task, or null if it has not.
  finishPlaySecondsRemaining: number | null;
  taskFunds: number;
  // Inbox tasks completed and still accepted (a rejected photo does not count).
  inboxCompleted: number;
  // Only transfers that have arrived. Staff adjustments are not included.
  fundsGiven: number;
  fundsReceived: number;
}

export interface ScoreOptions {
  potionFull: boolean;
  // The Full Potion Bonus is added only at the Reveal.
  includePotionBonus: boolean;
}

export interface ScoreBreakdown {
  taskPoints: number;
  timeBonus: number;
  taskFundsPoints: number;
  inboxBonus: number;
  collaborationBonus: number;
  // Shown as "Funds received". Zero or negative.
  fundsReceivedPoints: number;
  potionBonus: number;
  total: number;
}

export type ScoringSettings = Pick<GameSettings, 'scoring' | 'inbox'>;

// Rounds down, ignoring floating-point noise such as 1.15 x 100 = 114.99999999999999.
function floorMoney(x: number): number {
  return Math.floor(x + 1e-9);
}

export function scoreTeam(
  input: ScoreInput,
  settings: ScoringSettings,
  opts: ScoreOptions,
): ScoreBreakdown {
  const s = settings.scoring;
  const finished =
    input.tasksCompleted >= TASKS_PER_TEAM && input.finishPlaySecondsRemaining !== null;
  const taskPoints = s.pointsPerTask * input.tasksCompleted;
  const timeBonus = finished
    ? s.timeBonusPerSecond * Math.max(0, input.finishPlaySecondsRemaining ?? 0)
    : 0;
  const taskFundsPoints = s.taskFundsMultiplier * input.taskFunds;
  const inboxBonus = settings.inbox.reward * input.inboxCompleted;
  const collaborationBonus = Math.min(
    floorMoney(s.collaborationMultiplier * input.fundsGiven),
    s.collaborationCap,
  );
  // `|| 0` avoids -0 when nothing was received.
  const fundsReceivedPoints = -s.receivedMultiplier * input.fundsReceived || 0;
  const potionBonus = opts.includePotionBonus && opts.potionFull ? s.fullPotionBonus : 0;
  return {
    taskPoints,
    timeBonus,
    taskFundsPoints,
    inboxBonus,
    collaborationBonus,
    fundsReceivedPoints,
    potionBonus,
    total:
      taskPoints +
      timeBonus +
      taskFundsPoints +
      inboxBonus +
      collaborationBonus +
      fundsReceivedPoints +
      potionBonus,
  };
}
