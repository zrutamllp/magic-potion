import type { Wallet } from '@magic-potion/shared';

export interface LedgerRow {
  teamId: string;
  wallet: Wallet;
  amount: number;
}

export interface CachedBalances {
  id: string;
  taskFunds: number;
  supportFunds: number;
}

export interface WalletTotals {
  TASK: number;
  SUPPORT: number;
}

export interface BalanceMismatch {
  teamId: string;
  wallet: Wallet;
  cached: number;
  ledger: number;
}

// Sums ledger rows into per-team wallet totals.
export function sumLedger(rows: readonly LedgerRow[]): Map<string, WalletTotals> {
  const totals = new Map<string, WalletTotals>();
  for (const row of rows) {
    const t = totals.get(row.teamId) ?? { TASK: 0, SUPPORT: 0 };
    t[row.wallet] += row.amount;
    totals.set(row.teamId, t);
  }
  return totals;
}

// Compares each team's cached balances with its ledger totals.
export function findBalanceMismatches(
  teams: readonly CachedBalances[],
  totals: Map<string, WalletTotals>,
): BalanceMismatch[] {
  const mismatches: BalanceMismatch[] = [];
  for (const team of teams) {
    const t = totals.get(team.id) ?? { TASK: 0, SUPPORT: 0 };
    if (team.taskFunds !== t.TASK) {
      mismatches.push({ teamId: team.id, wallet: 'TASK', cached: team.taskFunds, ledger: t.TASK });
    }
    if (team.supportFunds !== t.SUPPORT) {
      mismatches.push({
        teamId: team.id,
        wallet: 'SUPPORT',
        cached: team.supportFunds,
        ledger: t.SUPPORT,
      });
    }
  }
  return mismatches;
}
