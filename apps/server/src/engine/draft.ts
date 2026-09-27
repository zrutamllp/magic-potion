import {
  ENGINE_ERRORS,
  type EngineErrorCode,
  type EngineResult,
  type LedgerKind,
  type PotionSnapshotKind,
  type Wallet,
} from '@magic-potion/shared';
import { randomUUID } from 'node:crypto';
import type { Json } from './checkers';
import type { EngineEvent } from './events';
import type { Potion } from './potion';
import type { Rng } from './rng';
import type {
  AttemptState,
  ChatMessageState,
  FragmentState,
  FundRequestState,
  GameContent,
  GameState,
  InboxItemState,
  InboxResponseState,
  TeamState,
  TeamTaskState,
  TransferState,
} from './state';

// A command works on a Draft: a private copy of the game state. Every helper below changes
// the copy and records the matching database change. The engine saves the changes in one
// transaction and only then swaps the copy in, so memory and database never disagree.

export type ChangeModel =
  | 'game'
  | 'team'
  | 'teamTask'
  | 'taskAttempt'
  | 'fragment'
  | 'transfer'
  | 'fundRequest'
  | 'inboxItem'
  | 'inboxResponse'
  | 'potionSnapshot'
  | 'chatMessage'
  | 'auditLog';

// Field values are plain JSON; fields ending in "At" or "Until" hold epoch ms and become dates.
export type ChangeData = Record<string, Json | undefined>;

export type Change =
  | { kind: 'create'; model: ChangeModel; data: ChangeData & { id: string } }
  | { kind: 'update'; model: ChangeModel; id: string; data: ChangeData }
  | {
      kind: 'ledger';
      teamId: string;
      wallet: Wallet;
      amount: number;
      ledgerKind: LedgerKind;
      // The wallet balance after this row, as computed in memory.
      balanceAfter: number;
      transferId?: string;
      taskAttemptId?: string;
      auditLogId?: string;
    }
  | { kind: 'lockScoring'; at: number };

// The Game row's own columns.
export type GameFields = Pick<
  GameState,
  | 'phase'
  | 'phaseStartedAt'
  | 'phaseEndsAt'
  | 'frozenAt'
  | 'extensionSeconds'
  | 'playMsBeforePhase'
  | 'startedAt'
  | 'endedAt'
>;

export function ok<T>(value: T): EngineResult<T> {
  return { ok: true, value };
}

export function fail<T = never>(code: EngineErrorCode): EngineResult<T> {
  return { ok: false, code, message: ENGINE_ERRORS[code] };
}

export class Draft {
  readonly changes: Change[] = [];
  readonly events: EngineEvent[] = [];

  constructor(
    readonly state: GameState,
    readonly content: GameContent,
    readonly now: number,
    readonly rng: Rng,
  ) {}

  get settings() {
    return this.state.settings;
  }

  emit(event: EngineEvent): void {
    this.events.push(event);
  }

  team(teamId: string): TeamState | undefined {
    return this.state.teams[teamId];
  }

  updateGame(patch: Partial<GameFields>): void {
    Object.assign(this.state, patch);
    this.changes.push({
      kind: 'update',
      model: 'game',
      id: this.state.id,
      data: patch as ChangeData,
    });
  }

  lockScoring(): void {
    this.state.scoringLockedAt = this.now;
    this.changes.push({ kind: 'lockScoring', at: this.now });
  }

  updateTeam(
    team: TeamState,
    patch: Partial<
      Pick<
        TeamState,
        'status' | 'removedAt' | 'chainPosition' | 'finishedAt' | 'finishPlaySecondsRemaining'
      >
    >,
  ): void {
    Object.assign(team, patch);
    this.changes.push({ kind: 'update', model: 'team', id: team.id, data: patch });
  }

  // Every wallet change is one ledger row. Balances on the team are a cache of the ledger.
  ledger(
    team: TeamState,
    wallet: Wallet,
    amount: number,
    ledgerKind: LedgerKind,
    refs: { transferId?: string; taskAttemptId?: string; auditLogId?: string } = {},
  ): void {
    if (amount === 0) return;
    if (wallet === 'TASK') team.taskFunds += amount;
    else team.supportFunds += amount;
    const balanceAfter = wallet === 'TASK' ? team.taskFunds : team.supportFunds;
    this.changes.push({
      kind: 'ledger',
      teamId: team.id,
      wallet,
      amount,
      ledgerKind,
      balanceAfter,
      ...refs,
    });
  }

  createTeamTask(team: TeamState, task: Omit<TeamTaskState, 'id' | 'attempts'>): TeamTaskState {
    const created: TeamTaskState = { ...task, id: randomUUID(), attempts: [] };
    team.tasks[created.id] = created;
    const taskDefinitionId = this.content.taskDefinitionIds[task.key];
    if (!taskDefinitionId) throw new Error(`Missing task definition ${task.key}`);
    this.changes.push({
      kind: 'create',
      model: 'teamTask',
      data: {
        id: created.id,
        teamId: team.id,
        taskDefinitionId,
        status: task.status,
        completedAt: task.completedAt,
      },
    });
    return created;
  }

  updateTeamTask(
    task: TeamTaskState,
    patch: Partial<Pick<TeamTaskState, 'status' | 'completedAt'>>,
  ): void {
    Object.assign(task, patch);
    this.changes.push({ kind: 'update', model: 'teamTask', id: task.id, data: patch });
  }

  createAttempt(task: TeamTaskState, attempt: Omit<AttemptState, 'id'>): AttemptState {
    const created: AttemptState = { ...attempt, id: randomUUID() };
    task.attempts.push(created);
    const { contentId, ...rest } = created;
    this.changes.push({
      kind: 'create',
      model: 'taskAttempt',
      data: { ...rest, teamTaskId: task.id, taskContentId: contentId },
    });
    return created;
  }

  updateAttempt(
    attempt: AttemptState,
    patch: Partial<Omit<AttemptState, 'id' | 'number' | 'contentId'>>,
  ): void {
    Object.assign(attempt, patch);
    this.changes.push({ kind: 'update', model: 'taskAttempt', id: attempt.id, data: patch });
  }

  createFragment(fragment: Omit<FragmentState, 'id'>): FragmentState {
    const created: FragmentState = { ...fragment, id: randomUUID() };
    this.state.fragments[created.id] = created;
    this.changes.push({
      kind: 'create',
      model: 'fragment',
      data: { ...created, gameId: this.state.id },
    });
    return created;
  }

  createTransfer(transfer: Omit<TransferState, 'id'>): TransferState {
    const created: TransferState = { ...transfer, id: randomUUID() };
    this.state.transfers[created.id] = created;
    this.changes.push({
      kind: 'create',
      model: 'transfer',
      data: { ...created, gameId: this.state.id },
    });
    return created;
  }

  updateTransfer(
    transfer: TransferState,
    patch: Partial<Pick<TransferState, 'arrivesAt' | 'frozenRemainingMs' | 'arrivedAt'>>,
  ): void {
    Object.assign(transfer, patch);
    this.changes.push({ kind: 'update', model: 'transfer', id: transfer.id, data: patch });
  }

  createRequest(request: Omit<FundRequestState, 'id'>): FundRequestState {
    const created: FundRequestState = { ...request, id: randomUUID() };
    this.state.requests[created.id] = created;
    this.changes.push({
      kind: 'create',
      model: 'fundRequest',
      data: { ...created, gameId: this.state.id },
    });
    return created;
  }

  updateRequest(
    request: FundRequestState,
    patch: Partial<Pick<FundRequestState, 'status' | 'decidedAt'>>,
  ): void {
    Object.assign(request, patch);
    this.changes.push({ kind: 'update', model: 'fundRequest', id: request.id, data: patch });
  }

  // A game alert: an inbox item released at once. publicData.alert holds its key.
  createAlert(key: string, text: { title: string; body: string }): InboxItemState {
    const created: InboxItemState = {
      id: randomUUID(),
      kind: 'ALERT',
      title: text.title,
      body: text.body,
      publicData: { alert: key },
      secretAnswer: null,
      releaseAtPlaySeconds: null,
      releasedAt: this.now,
      reward: 0,
    };
    this.state.inboxItems[created.id] = created;
    this.changes.push({
      kind: 'create',
      model: 'inboxItem',
      data: { ...created, gameId: this.state.id },
    });
    return created;
  }

  releaseInboxItem(itemId: string): void {
    const item = this.state.inboxItems[itemId];
    if (!item) return;
    item.releasedAt = this.now;
    this.changes.push({
      kind: 'update',
      model: 'inboxItem',
      id: itemId,
      data: { releasedAt: this.now },
    });
  }

  // Creates the team's response row on first use, then updates it.
  saveInboxResponse(
    team: TeamState,
    itemId: string,
    patch: Partial<Omit<InboxResponseState, 'id' | 'inboxItemId'>>,
  ): void {
    const existing = team.inbox[itemId];
    if (existing) {
      Object.assign(existing, patch);
      this.changes.push({ kind: 'update', model: 'inboxResponse', id: existing.id, data: patch });
      return;
    }
    const created: InboxResponseState = {
      id: randomUUID(),
      inboxItemId: itemId,
      attempts: 0,
      lastAnswer: null,
      correct: false,
      photoUrl: null,
      photoStatus: null,
      reviewedByStaffId: null,
      ...patch,
    };
    team.inbox[itemId] = created;
    this.changes.push({
      kind: 'create',
      model: 'inboxResponse',
      data: { ...created, teamId: team.id },
    });
  }

  createChatMessage(message: Omit<ChatMessageState, 'id'>): ChatMessageState {
    const created: ChatMessageState = { ...message, id: randomUUID() };
    this.state.chat.push(created);
    this.changes.push({
      kind: 'create',
      model: 'chatMessage',
      data: { ...created, gameId: this.state.id },
    });
    return created;
  }

  savePotionSnapshot(kind: PotionSnapshotKind, potion: Potion): void {
    this.state.potionSnapshots[kind] = potion;
    this.changes.push({
      kind: 'create',
      model: 'potionSnapshot',
      data: { id: randomUUID(), gameId: this.state.id, kind, ...potion },
    });
  }

  // Every staff action is audited: who, when, what, before, after and reason.
  audit(entry: {
    staffUserId: string;
    action: string;
    teamId?: string;
    before?: Json;
    after?: Json;
    reason?: string;
  }): string {
    const id = randomUUID();
    this.changes.push({
      kind: 'create',
      model: 'auditLog',
      data: {
        id,
        gameId: this.state.id,
        staffUserId: entry.staffUserId,
        teamId: entry.teamId ?? null,
        action: entry.action,
        before: entry.before ?? null,
        after: entry.after ?? null,
        reason: entry.reason ?? null,
        createdAt: this.now,
      },
    });
    return id;
  }
}
