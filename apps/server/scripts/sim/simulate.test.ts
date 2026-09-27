import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/engine/clock';
import { memoryEngine } from '../../src/engine/memoryGame';
import { runSimulation, type LedgerRow } from './run';

// Plays whole 20-team games so every change to the engine is checked end to end in CI.

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

async function simulate(seed: number, fullPotion: boolean, removeTeams = 0) {
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams: 20, clock, seed });
  return runSimulation(
    {
      engine,
      clock,
      staffUserId: 'simulated-admin',
      ledgerRows: async () =>
        persistence.log.flatMap((c): LedgerRow[] =>
          c.kind === 'ledger'
            ? [
                {
                  teamId: c.teamId,
                  wallet: c.wallet,
                  amount: c.amount,
                  kind: c.ledgerKind,
                  balanceAfter: c.balanceAfter,
                },
              ]
            : [],
        ),
    },
    { seed, fullPotion, removeTeams },
  );
}

function failedChecks(result: Awaited<ReturnType<typeof simulate>>) {
  return result.checks.filter((c) => !c.ok);
}

describe('simulation', () => {
  it('plays a mixed 20-team game and passes every check', { timeout: 60_000 }, async () => {
    const result = await simulate(42, false);
    expect(failedChecks(result)).toEqual([]);
    expect(result.leaderboard.entries).toHaveLength(20);
    expect(result.state.phase).toBe('REVEAL');
    expect(result.state.endedAt).not.toBeNull();
    // A realistic game has fails, hints, lockouts and transfers.
    expect(result.counts['hints used']).toBeGreaterThan(0);
    expect(result.counts['transfers arrived']).toBeGreaterThan(0);
    expect(result.counts['task failed timeout'] ?? 0).toBeGreaterThan(0);
  });

  it(
    'fills the potion and adds the Full Potion Bonus when every team finishes',
    { timeout: 60_000 },
    async () => {
      const result = await simulate(7, true);
      expect(failedChecks(result)).toEqual([]);
      expect(result.leaderboard.valid).toBe(true);
      expect(result.leaderboard.entries.every((e) => e.score.potionBonus === 15_000)).toBe(true);
      expect(result.leaderboard.entries.every((e) => e.score.timeBonus > 0)).toBe(true);
    },
  );

  it('handles a team removed mid-game', { timeout: 60_000 }, async () => {
    const result = await simulate(3, false, 1);
    expect(failedChecks(result)).toEqual([]);
    expect(result.leaderboard.entries).toHaveLength(19);
    expect(result.leaderboard.potion.totalTeams).toBe(19);
  });

  it('prints the same leaderboard for the same seed', { timeout: 60_000 }, async () => {
    const a = await simulate(11, false);
    const b = await simulate(11, false);
    const scores = (r: typeof a) => r.leaderboard.entries.map((e) => [e.name, e.score.total]);
    expect(scores(a)).toEqual(scores(b));
  });
});
