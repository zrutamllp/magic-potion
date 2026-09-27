import { DEFAULT_SETTINGS, type GameSettings } from '@magic-potion/shared';
import { describe, expect, it } from 'vitest';
import { scoreTeam, type ScoreInput } from './scoring';

// One test per rule in docs/GAME_RULES.md section 9.

const base: ScoreInput = {
  tasksCompleted: 0,
  finishPlaySecondsRemaining: null,
  taskFunds: 0,
  inboxCompleted: 0,
  fundsGiven: 0,
  fundsReceived: 0,
};
const during = { potionFull: false, includePotionBonus: false };

function score(
  input: Partial<ScoreInput>,
  opts = during,
  settings: GameSettings = DEFAULT_SETTINGS,
) {
  return scoreTeam({ ...base, ...input }, settings, opts);
}

describe('scoreTeam', () => {
  it('gives 10,000 per completed task', () => {
    expect(score({ tasksCompleted: 3 }).taskPoints).toBe(30_000);
    expect(score({ tasksCompleted: 3 }).total).toBe(30_000);
  });

  it('gives a time bonus of 5 x play seconds left when the 5th task was done', () => {
    const s = score({ tasksCompleted: 5, finishPlaySecondsRemaining: 1_234 });
    expect(s.timeBonus).toBe(6_170);
    expect(s.total).toBe(50_000 + 6_170);
  });

  it('gives no time bonus before all 5 tasks are done', () => {
    expect(score({ tasksCompleted: 4, finishPlaySecondsRemaining: 1_000 }).timeBonus).toBe(0);
    expect(score({ tasksCompleted: 5, finishPlaySecondsRemaining: null }).timeBonus).toBe(0);
  });

  it('gives no time bonus when the 5th task was done with 0 seconds left', () => {
    expect(score({ tasksCompleted: 5, finishPlaySecondsRemaining: 0 }).timeBonus).toBe(0);
  });

  it('counts Task Funds x 2, including negative funds', () => {
    expect(score({ taskFunds: 7_250 }).taskFundsPoints).toBe(14_500);
    expect(score({ taskFunds: -2_500 }).taskFundsPoints).toBe(-5_000);
    expect(score({ taskFunds: -2_500 }).total).toBe(-5_000);
  });

  it('gives 1,000 per inbox task, up to 3,000', () => {
    expect(score({ inboxCompleted: 1 }).inboxBonus).toBe(1_000);
    expect(score({ inboxCompleted: 3 }).inboxBonus).toBe(3_000);
  });

  it('gives a collaboration bonus of 1.5 x funds given, rounded down', () => {
    expect(score({ fundsGiven: 1_000 }).collaborationBonus).toBe(1_500);
    expect(score({ fundsGiven: 333 }).collaborationBonus).toBe(499);
    expect(score({ fundsGiven: 1 }).collaborationBonus).toBe(1);
  });

  it('caps the collaboration bonus at 10,000', () => {
    expect(score({ fundsGiven: 6_666 }).collaborationBonus).toBe(9_999);
    expect(score({ fundsGiven: 6_667 }).collaborationBonus).toBe(10_000);
    expect(score({ fundsGiven: 50_000 }).collaborationBonus).toBe(10_000);
  });

  it('subtracts 2 x funds received', () => {
    const s = score({ fundsReceived: 2_000 });
    expect(s.fundsReceivedPoints).toBe(-4_000);
    expect(s.total).toBe(-4_000);
  });

  it('shows 0, not -0, when nothing was received', () => {
    expect(Object.is(score({}).fundsReceivedPoints, 0)).toBe(true);
  });

  it('adds the Full Potion Bonus only at the Reveal and only when the potion is full', () => {
    expect(score({}, { potionFull: true, includePotionBonus: true }).potionBonus).toBe(15_000);
    expect(score({}, { potionFull: true, includePotionBonus: false }).potionBonus).toBe(0);
    expect(score({}, { potionFull: false, includePotionBonus: true }).potionBonus).toBe(0);
  });

  it('adds every part together', () => {
    const s = score(
      {
        tasksCompleted: 5,
        finishPlaySecondsRemaining: 600,
        taskFunds: 4_000,
        inboxCompleted: 2,
        fundsGiven: 333,
        fundsReceived: 1_000,
      },
      { potionFull: true, includePotionBonus: true },
    );
    expect(s).toEqual({
      taskPoints: 50_000,
      timeBonus: 3_000,
      taskFundsPoints: 8_000,
      inboxBonus: 2_000,
      collaborationBonus: 499,
      fundsReceivedPoints: -2_000,
      potionBonus: 15_000,
      total: 50_000 + 3_000 + 8_000 + 2_000 + 499 - 2_000 + 15_000,
    });
  });

  it('always gives whole numbers', () => {
    for (const given of [1, 3, 7, 333, 1_001, 4_443]) {
      expect(Number.isInteger(score({ fundsGiven: given }).total)).toBe(true);
    }
  });

  it('rounds down without floating-point errors', () => {
    const settings: GameSettings = {
      ...DEFAULT_SETTINGS,
      scoring: { ...DEFAULT_SETTINGS.scoring, collaborationMultiplier: 1.15 },
    };
    // 1.15 x 100 is 114.99999999999999 in floating point; the answer is 115.
    expect(score({ fundsGiven: 100 }, during, settings).collaborationBonus).toBe(115);
  });

  it('uses the game settings, not fixed numbers', () => {
    const settings: GameSettings = {
      ...DEFAULT_SETTINGS,
      inbox: { ...DEFAULT_SETTINGS.inbox, reward: 500 },
      scoring: {
        pointsPerTask: 1_000,
        timeBonusPerSecond: 1,
        taskFundsMultiplier: 3,
        collaborationMultiplier: 2,
        collaborationCap: 1_000,
        receivedMultiplier: 1,
        fullPotionBonus: 7,
      },
    };
    const s = score(
      {
        tasksCompleted: 5,
        finishPlaySecondsRemaining: 100,
        taskFunds: 10,
        inboxCompleted: 3,
        fundsGiven: 800,
        fundsReceived: 50,
      },
      { potionFull: true, includePotionBonus: true },
      settings,
    );
    expect(s).toEqual({
      taskPoints: 5_000,
      timeBonus: 100,
      taskFundsPoints: 30,
      inboxBonus: 1_500,
      collaborationBonus: 1_000,
      fundsReceivedPoints: -50,
      potionBonus: 7,
      total: 5_000 + 100 + 30 + 1_500 + 1_000 - 50 + 7,
    });
  });
});
