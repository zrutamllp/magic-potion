import {
  GameSettingsSchema,
  TASK_DEFINITIONS,
  TaskKeySchema,
  parseTaskContent,
  type PotionSnapshotKind,
} from '@magic-potion/shared';
import type { PrismaClient } from '../generated/prisma/client';
import type { Json } from './checkers';
import type { Potion } from './potion';
import type {
  AdjustmentRequestState,
  ContentState,
  FragmentState,
  FundRequestState,
  GameContent,
  GameState,
  InboxItemState,
  TeamState,
  TransferState,
} from './state';

// Rebuilds a game's in-memory state from the database, so the server can restart mid-game.

const ms = (d: Date | null): number | null => (d ? d.getTime() : null);
const SORT_ORDER = new Map(TASK_DEFINITIONS.map((t) => [t.key, t.sortOrder]));

export async function loadGame(
  prisma: PrismaClient,
  gameId: string,
): Promise<{ state: GameState; content: GameContent }> {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      settings: true,
      teams: {
        include: {
          tasks: { include: { taskDefinition: true, attempts: { orderBy: { number: 'asc' } } } },
          inboxResponses: true,
          ledger: true,
        },
      },
      taskContents: { include: { taskDefinition: true } },
      fragments: true,
      transfers: true,
      fundRequests: true,
      fundAdjustmentRequests: { include: { requestedBy: { select: { name: true } } } },
      inboxItems: true,
      potionSnapshots: true,
      chatMessages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!game.settings) throw new Error(`Game ${gameId} has no settings`);
  const definitions = await prisma.taskDefinition.findMany();

  const content: GameContent = { byId: {}, byKey: {}, taskDefinitionIds: {} };
  for (const def of definitions) {
    content.taskDefinitionIds[TaskKeySchema.parse(def.key)] = def.id;
  }
  for (const c of game.taskContents) {
    const key = TaskKeySchema.parse(c.taskDefinition.key);
    const row: ContentState = {
      id: c.id,
      key,
      variant: c.variant,
      ...parseTaskContent(key, c),
    };
    content.byId[row.id] = row;
    (content.byKey[key] ??= []).push(row);
  }
  for (const list of Object.values(content.byKey)) list.sort((a, b) => a.variant - b.variant);

  const teams: Record<string, TeamState> = {};
  for (const t of game.teams) {
    const tasks = [...t.tasks].sort(
      (a, b) =>
        (SORT_ORDER.get(TaskKeySchema.parse(a.taskDefinition.key)) ?? 0) -
        (SORT_ORDER.get(TaskKeySchema.parse(b.taskDefinition.key)) ?? 0),
    );
    teams[t.id] = {
      id: t.id,
      code: t.code,
      name: t.name,
      status: t.status,
      removedAt: ms(t.removedAt),
      chainPosition: t.chainPosition,
      taskFunds: t.taskFunds,
      supportFunds: t.supportFunds,
      finishedAt: ms(t.finishedAt),
      finishPlaySecondsRemaining: t.finishPlaySecondsRemaining,
      lastActionAt: ms(t.lastActionAt),
      tasks: Object.fromEntries(
        tasks.map((task) => [
          task.id,
          {
            id: task.id,
            key: TaskKeySchema.parse(task.taskDefinition.key),
            type: task.taskDefinition.type,
            status: task.status,
            completedAt: ms(task.completedAt),
            attempts: task.attempts.map((a) => ({
              id: a.id,
              number: a.number,
              contentId: a.taskContentId,
              startedAt: a.startedAt.getTime(),
              endsAt: a.endsAt.getTime(),
              frozenRemainingMs: a.frozenRemainingMs,
              frozenLockMs: a.frozenLockMs,
              hintsUsed: a.hintsUsed,
              wrongCount: a.wrongCount,
              lockouts: a.lockouts,
              lockedUntil: ms(a.lockedUntil),
              progress: a.progress as Json,
              result: a.result,
              endedAt: ms(a.endedAt),
            })),
          },
        ]),
      ),
      inbox: Object.fromEntries(
        t.inboxResponses.map((r) => [
          r.inboxItemId,
          {
            id: r.id,
            inboxItemId: r.inboxItemId,
            attempts: r.attempts,
            lastAnswer: r.lastAnswer,
            correct: r.correct,
            photoUrl: r.photoUrl,
            photoStatus: r.photoStatus,
            photoDeletedAt: ms(r.photoDeletedAt),
            reviewedByStaffId: r.reviewedByStaffId,
          },
        ]),
      ),
    };
  }

  const fragments: Record<string, FragmentState> = {};
  for (const f of game.fragments) {
    fragments[f.id] = {
      id: f.id,
      kind: f.kind,
      holderTeamId: f.holderTeamId,
      neededByTeamId: f.neededByTeamId,
      value: f.value,
      secretData: (f.secretData ?? null) as Json | null,
      releasedAt: ms(f.releasedAt),
      releasedByStaffId: f.releasedByStaffId,
    };
  }

  const transfers: Record<string, TransferState> = {};
  for (const t of game.transfers) {
    transfers[t.id] = {
      id: t.id,
      fromTeamId: t.fromTeamId,
      toTeamId: t.toTeamId,
      amount: t.amount,
      sentAt: t.sentAt.getTime(),
      arrivesAt: t.arrivesAt.getTime(),
      frozenRemainingMs: t.frozenRemainingMs,
      arrivedAt: ms(t.arrivedAt),
      fundRequestId: t.fundRequestId,
    };
  }

  const requests: Record<string, FundRequestState> = {};
  for (const r of game.fundRequests) {
    requests[r.id] = {
      id: r.id,
      requesterTeamId: r.requesterTeamId,
      payerTeamId: r.payerTeamId,
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt.getTime(),
      decidedAt: ms(r.decidedAt),
    };
  }

  const adjustments: Record<string, AdjustmentRequestState> = {};
  for (const a of game.fundAdjustmentRequests) {
    adjustments[a.id] = {
      id: a.id,
      teamId: a.teamId,
      requestedById: a.requestedById,
      requestedByName: a.requestedBy.name,
      amount: a.amount,
      reason: a.reason,
      status: a.status,
      decidedById: a.decidedById,
      decidedAt: ms(a.decidedAt),
      createdAt: a.createdAt.getTime(),
    };
  }

  const inboxItems: Record<string, InboxItemState> = {};
  for (const i of game.inboxItems) {
    inboxItems[i.id] = {
      id: i.id,
      kind: i.kind,
      title: i.title,
      body: i.body,
      publicData: i.publicData as Json,
      secretAnswer: (i.secretAnswer ?? null) as string[] | null,
      releaseAtPlaySeconds: i.releaseAtPlaySeconds,
      releasedAt: ms(i.releasedAt),
      reward: i.reward,
    };
  }

  const potionSnapshots: Partial<Record<PotionSnapshotKind, Potion>> = {};
  for (const p of game.potionSnapshots) {
    potionSnapshots[p.kind] = { completedTeams: p.completedTeams, totalTeams: p.totalTeams };
  }

  const state: GameState = {
    id: game.id,
    name: game.name,
    settings: GameSettingsSchema.parse(game.settings.data),
    scoringLockedAt: ms(game.settings.scoringLockedAt),
    phase: game.phase,
    phaseStartedAt: ms(game.phaseStartedAt),
    phaseEndsAt: ms(game.phaseEndsAt),
    frozenAt: ms(game.frozenAt),
    extensionSeconds: game.extensionSeconds,
    playMsBeforePhase: game.playMsBeforePhase,
    startedAt: ms(game.startedAt),
    endedAt: ms(game.endedAt),
    teams,
    fragments,
    transfers,
    requests,
    adjustments,
    inboxItems,
    ledger: Object.fromEntries(
      game.teams.flatMap((t) =>
        t.ledger.map((r) => [
          r.id,
          {
            id: r.id,
            teamId: r.teamId,
            wallet: r.wallet,
            amount: r.amount,
            kind: r.kind,
            taskAttemptId: r.taskAttemptId,
            transferId: r.transferId,
            auditLogId: r.auditLogId,
            createdAt: r.createdAt.getTime(),
          },
        ]),
      ),
    ),
    chat: game.chatMessages.map((m) => ({
      id: m.id,
      teamId: m.teamId,
      round: m.round,
      body: m.body,
      createdAt: m.createdAt.getTime(),
    })),
    potionSnapshots,
  };
  return { state, content };
}

// JSON with object keys sorted, so two states can be compared regardless of key order.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
