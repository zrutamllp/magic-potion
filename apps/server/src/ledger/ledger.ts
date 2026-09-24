import type { LedgerKind, Wallet } from '@magic-potion/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { findBalanceMismatches, sumLedger, type BalanceMismatch } from './balances';

export interface LedgerEntryInput {
  teamId: string;
  wallet: Wallet;
  // Signed whole number: positive adds, negative takes.
  amount: number;
  kind: LedgerKind;
  transferId?: string;
  taskAttemptId?: string;
  auditLogId?: string;
}

// Writes one ledger row and updates the team's cached balance.
// Call inside a transaction so the row and the balance change together.
// Rule checks (enough funds, hint blocked below zero, ...) belong to the caller.
export async function applyLedgerEntry(tx: Prisma.TransactionClient, entry: LedgerEntryInput) {
  if (!Number.isInteger(entry.amount) || entry.amount === 0) {
    throw new Error(`Ledger amount must be a non-zero whole number, got ${entry.amount}`);
  }
  const field = entry.wallet === 'TASK' ? 'taskFunds' : 'supportFunds';
  const team = await tx.team.update({
    where: { id: entry.teamId },
    data: { [field]: { increment: entry.amount } },
    select: { taskFunds: true, supportFunds: true },
  });
  return tx.fundTransaction.create({
    data: { ...entry, balanceAfter: team[field] },
  });
}

// Checks every team's cached balances in a game against the ledger.
export async function checkBalances(
  prisma: PrismaClient,
  gameId: string,
): Promise<BalanceMismatch[]> {
  const [teams, rows] = await Promise.all([
    prisma.team.findMany({
      where: { gameId },
      select: { id: true, taskFunds: true, supportFunds: true },
    }),
    prisma.fundTransaction.findMany({
      where: { team: { gameId } },
      select: { teamId: true, wallet: true, amount: true },
    }),
  ]);
  return findBalanceMismatches(teams, sumLedger(rows));
}
