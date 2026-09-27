import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import type { Change, ChangeModel } from '../draft';
import type { Persistence } from './types';

// Saves each command's changes to Postgres in one transaction.
// Runs of creates on the same table, and runs of ledger rows, are written in one batch,
// because every round trip to the database costs time.

// Nullable JSON columns need Prisma.DbNull instead of a plain null.
const JSON_FIELDS = new Set([
  'progress',
  'before',
  'after',
  'secretData',
  'publicData',
  'secretAnswer',
]);

function toRow(data: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if ((key.endsWith('At') || key.endsWith('Until')) && typeof value === 'number') {
      row[key] = new Date(value);
    } else if (value === null && JSON_FIELDS.has(key)) {
      row[key] = Prisma.DbNull;
    } else {
      row[key] = value;
    }
  }
  return row;
}

interface Delegate {
  createMany(args: { data: object[] }): Promise<unknown>;
  update(args: { where: { id: string }; data: object }): Promise<unknown>;
}

function delegate(tx: Prisma.TransactionClient, model: ChangeModel): Delegate {
  return tx[model] as unknown as Delegate;
}

type LedgerChange = Extract<Change, { kind: 'ledger' }>;

async function writeLedger(tx: Prisma.TransactionClient, rows: LedgerChange[]): Promise<void> {
  await tx.fundTransaction.createMany({
    data: rows.map((r) => ({
      teamId: r.teamId,
      wallet: r.wallet,
      amount: r.amount,
      kind: r.ledgerKind,
      balanceAfter: r.balanceAfter,
      transferId: r.transferId,
      taskAttemptId: r.taskAttemptId,
      auditLogId: r.auditLogId,
    })),
  });
  // The team's cached balances become the last balance written for each wallet.
  const latest = new Map<string, { taskFunds?: number; supportFunds?: number }>();
  for (const r of rows) {
    const t = latest.get(r.teamId) ?? {};
    if (r.wallet === 'TASK') t.taskFunds = r.balanceAfter;
    else t.supportFunds = r.balanceAfter;
    latest.set(r.teamId, t);
  }
  for (const [id, data] of latest) await tx.team.update({ where: { id }, data });
}

export class PrismaPersistence implements Persistence {
  constructor(private readonly prisma: PrismaClient) {}

  async commit(gameId: string, changes: readonly Change[]): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < changes.length;) {
          const change = changes[i] as Change;
          if (change.kind === 'ledger') {
            const run: LedgerChange[] = [];
            while (i < changes.length && changes[i]?.kind === 'ledger') {
              run.push(changes[i] as LedgerChange);
              i++;
            }
            await writeLedger(tx, run);
            continue;
          }
          if (change.kind === 'create') {
            const run: object[] = [];
            while (i < changes.length) {
              const c = changes[i] as Change;
              if (c.kind !== 'create' || c.model !== change.model) break;
              run.push(toRow(c.data));
              i++;
            }
            await delegate(tx, change.model).createMany({ data: run });
            continue;
          }
          if (change.kind === 'update') {
            await delegate(tx, change.model).update({
              where: { id: change.id },
              data: toRow(change.data),
            });
          } else {
            await tx.gameSettings.update({
              where: { gameId },
              data: { scoringLockedAt: new Date(change.at) },
            });
          }
          i++;
        }
      },
      // Starting a 25-team game writes a few hundred rows.
      { timeout: 60_000, maxWait: 10_000 },
    );
  }
}
