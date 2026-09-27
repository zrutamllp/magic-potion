import { DEFAULT_SETTINGS } from '@magic-potion/shared';
import { describe, expect, it } from 'vitest';
import { buildLeaderboard, type LeaderboardTeam } from './leaderboard';

function team(name: string, overrides: Partial<LeaderboardTeam> = {}): LeaderboardTeam {
  return {
    teamId: name.toLowerCase(),
    name,
    status: 'ACTIVE',
    tasksCompleted: 0,
    finishPlaySecondsRemaining: null,
    taskFunds: 0,
    inboxCompleted: 0,
    fundsGiven: 0,
    fundsReceived: 0,
    ...overrides,
  };
}

const full = { completedTeams: 3, totalTeams: 3 };
const notFull = { completedTeams: 2, totalTeams: 3 };

describe('buildLeaderboard', () => {
  it('ranks teams by score, highest first', () => {
    const lb = buildLeaderboard(
      [team('A', { taskFunds: 1_000 }), team('B', { taskFunds: 3_000 }), team('C')],
      DEFAULT_SETTINGS,
      notFull,
      { includePotionBonus: false },
    );
    expect(lb.entries.map((e) => [e.name, e.rank, e.score.total])).toEqual([
      ['B', 1, 6_000],
      ['A', 2, 2_000],
      ['C', 3, 0],
    ]);
  });

  it('gives equal scores the same rank and skips the next (1, 2, 2, 4)', () => {
    const lb = buildLeaderboard(
      [
        team('D', { taskFunds: 100 }),
        team('C', { taskFunds: 500 }),
        team('B', { taskFunds: 500 }),
        team('A', { taskFunds: 900 }),
      ],
      DEFAULT_SETTINGS,
      notFull,
      { includePotionBonus: false },
    );
    expect(lb.entries.map((e) => [e.name, e.rank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 2],
      ['D', 4],
    ]);
  });

  it('lists tied teams by more tasks done, then by name', () => {
    // Same total: 1 task (10,000) vs 5,000 Task Funds x 2 (10,000).
    const lb = buildLeaderboard(
      [
        team('Zeta', { taskFunds: 5_000 }),
        team('Beta', { tasksCompleted: 1 }),
        team('Alpha', { taskFunds: 5_000 }),
      ],
      DEFAULT_SETTINGS,
      notFull,
      { includePotionBonus: false },
    );
    expect(lb.entries.map((e) => [e.name, e.rank])).toEqual([
      ['Beta', 1],
      ['Alpha', 1],
      ['Zeta', 1],
    ]);
  });

  it('leaves removed teams out', () => {
    const lb = buildLeaderboard(
      [team('A'), team('B', { status: 'REMOVED', taskFunds: 99_999 })],
      DEFAULT_SETTINGS,
      notFull,
      { includePotionBonus: true },
    );
    expect(lb.entries.map((e) => e.name)).toEqual(['A']);
  });

  it('is valid only when the potion is full', () => {
    expect(buildLeaderboard([], DEFAULT_SETTINGS, full, { includePotionBonus: true }).valid).toBe(
      true,
    );
    const lb = buildLeaderboard([team('A')], DEFAULT_SETTINGS, notFull, {
      includePotionBonus: true,
    });
    expect(lb.valid).toBe(false);
    expect(lb.potionPercent).toBeCloseTo(66.667, 2);
  });

  it('gives every team the Full Potion Bonus at the Reveal when the potion is full', () => {
    const lb = buildLeaderboard([team('A'), team('B', { taskFunds: 10 })], DEFAULT_SETTINGS, full, {
      includePotionBonus: true,
    });
    expect(lb.entries.map((e) => e.score.potionBonus)).toEqual([15_000, 15_000]);
  });

  it('shows no Full Potion Bonus during play, even when the potion is full', () => {
    const lb = buildLeaderboard([team('A')], DEFAULT_SETTINGS, full, { includePotionBonus: false });
    expect(lb.entries[0]?.score.potionBonus).toBe(0);
  });

  it('gives no Full Potion Bonus when the potion is not full', () => {
    const lb = buildLeaderboard([team('A')], DEFAULT_SETTINGS, notFull, {
      includePotionBonus: true,
    });
    expect(lb.entries[0]?.score.potionBonus).toBe(0);
  });
});
