import { describe, expect, it } from 'vitest';
import { findBalanceMismatches, sumLedger } from './balances';

describe('sumLedger', () => {
  it('sums each wallet per team', () => {
    const totals = sumLedger([
      { teamId: 'a', wallet: 'TASK', amount: 10_000 },
      { teamId: 'a', wallet: 'SUPPORT', amount: 4_500 },
      { teamId: 'a', wallet: 'SUPPORT', amount: -1_500 },
      { teamId: 'a', wallet: 'TASK', amount: -3_500 },
      { teamId: 'b', wallet: 'TASK', amount: 10_000 },
    ]);
    expect(totals.get('a')).toEqual({ TASK: 6_500, SUPPORT: 3_000 });
    expect(totals.get('b')).toEqual({ TASK: 10_000, SUPPORT: 0 });
  });

  it('allows Task Funds to go below zero', () => {
    const totals = sumLedger([
      { teamId: 'a', wallet: 'TASK', amount: 1_000 },
      { teamId: 'a', wallet: 'TASK', amount: -3_500 },
    ]);
    expect(totals.get('a')?.TASK).toBe(-2_500);
  });
});

describe('findBalanceMismatches', () => {
  const totals = sumLedger([
    { teamId: 'a', wallet: 'TASK', amount: 10_000 },
    { teamId: 'a', wallet: 'SUPPORT', amount: 4_500 },
  ]);

  it('reports nothing when cache and ledger agree', () => {
    expect(
      findBalanceMismatches([{ id: 'a', taskFunds: 10_000, supportFunds: 4_500 }], totals),
    ).toEqual([]);
  });

  it('treats a team with no ledger rows as zero', () => {
    expect(findBalanceMismatches([{ id: 'c', taskFunds: 0, supportFunds: 0 }], totals)).toEqual([]);
  });

  it('reports each wallet that differs', () => {
    expect(
      findBalanceMismatches([{ id: 'a', taskFunds: 9_000, supportFunds: 4_500 }], totals),
    ).toEqual([{ teamId: 'a', wallet: 'TASK', cached: 9_000, ledger: 10_000 }]);
  });
});
