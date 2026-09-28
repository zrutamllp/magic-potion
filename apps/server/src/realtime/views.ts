import {
  TASK_DEFINITIONS,
  TASKS_PER_TEAM,
  type FeedItem,
  type GameClockView,
  type LeaderboardView,
  type PlayerInboxView,
  type PlayerState,
  type PotionView,
  type StaffState,
  type TransactionLine,
} from '@magic-potion/shared';
import type { StaffAccount } from '../auth/store';
import type { GameEngine } from '../engine/engine';
import type { EngineEvent } from '../engine/events';
import { phaseMsLeft, playMsRemaining, timersRunning } from '../engine/playClock';
import { potionPercent } from '../engine/potion';
import { messagesLeft } from '../engine/rules/chat';
import type { GameState, TransferState } from '../engine/state';
import { dilemmaAnswer } from '../engine/views';

// Turns engine state into what one browser may see. Built only from public fields:
// never task answers, never another team's fragments, never inbox answers.

// Who is looking. Staff with a team list (co-facilitators) see only those teams.
export type Viewer =
  { kind: 'team'; teamId: string } | { kind: 'staff'; teams: ReadonlySet<string> | null };

function clockView(s: GameState, now: number): GameClockView {
  return {
    id: s.id,
    name: s.name,
    phase: s.phase,
    frozen: s.frozenAt !== null,
    timersRunning: timersRunning(s),
    phaseMsLeft: phaseMsLeft(s, now),
    playMsRemaining: playMsRemaining(s, now, s.settings.phases),
    serverNow: now,
  };
}

function potionView(engine: GameEngine): PotionView {
  const p = engine.potion();
  const halftime = engine.state.potionSnapshots.HALFTIME;
  return {
    percent: potionPercent(p),
    completedTeams: p.completedTeams,
    totalTeams: p.totalTeams,
    halftime: halftime ? { percent: potionPercent(halftime), ...halftime } : null,
  };
}

function transferMsLeft(t: TransferState, now: number): number {
  return t.frozenRemainingMs ?? Math.max(0, t.arrivesAt - now);
}

const teamName = (s: GameState, id: string) => s.teams[id]?.name ?? 'A team';

function inboxView(s: GameState, teamId: string): PlayerInboxView[] {
  const team = s.teams[teamId];
  return Object.values(s.inboxItems)
    .filter((item) => item.releasedAt !== null)
    .sort((a, b) => (a.releasedAt ?? 0) - (b.releasedAt ?? 0))
    .map((item) => {
      const r = team?.inbox[item.id];
      return {
        id: item.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        publicData: item.publicData,
        done: item.kind === 'PHOTO' ? r?.photoStatus === 'ACCEPTED' : Boolean(r?.correct),
        attemptsLeft:
          item.kind === 'QUESTION'
            ? Math.max(0, s.settings.inbox.answerAttempts - (r?.attempts ?? 0))
            : null,
        photoStatus: r?.photoStatus ?? null,
      };
    });
}

const TASK_NAMES = new Map<string, string>(TASK_DEFINITIONS.map((d) => [d.key, d.name]));
const LINE_KINDS = new Set<TransactionLine['kind']>([
  'HINT',
  'FAIL_PENALTY',
  'STAFF_ADJUST',
  'UNDO',
]);

// This team's hint, fail and facilitator lines, newest first. A hint paid from both wallets is
// two ledger rows; they show as one line.
export function transactionLines(s: GameState, teamId: string): TransactionLine[] {
  const team = s.teams[teamId];
  if (!team) return [];
  const taskOfAttempt = new Map<string, string>();
  for (const task of Object.values(team.tasks)) {
    for (const a of task.attempts) taskOfAttempt.set(a.id, TASK_NAMES.get(task.key) ?? task.key);
  }
  const lines = new Map<string, TransactionLine>();
  for (const r of Object.values(s.ledger)) {
    if (r.teamId !== teamId || !LINE_KINDS.has(r.kind as TransactionLine['kind'])) continue;
    const key = `${r.kind}|${r.taskAttemptId ?? r.auditLogId ?? r.id}|${r.createdAt}`;
    const line = lines.get(key) ?? {
      id: r.id,
      at: r.createdAt,
      kind: r.kind as TransactionLine['kind'],
      taskName: r.taskAttemptId ? (taskOfAttempt.get(r.taskAttemptId) ?? null) : null,
      taskFunds: 0,
      supportFunds: 0,
    };
    if (r.wallet === 'TASK') line.taskFunds += r.amount;
    else line.supportFunds += r.amount;
    lines.set(key, line);
  }
  return [...lines.values()].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

// GAME_RULES section 10: Round 1 shows only the team's own row with no rank; Round 2 and the
// Reveal show every team. Nothing in the Lobby, and the Pause shows the potion only.
function leaderboardView(engine: GameEngine, teamId: string): LeaderboardView | null {
  const phase = engine.state.phase;
  if (phase === 'LOBBY' || phase === 'PAUSE') return null;
  const board = engine.leaderboard();
  const share = board.potion.totalTeams === 0 ? 0 : 100 / board.potion.totalTeams;
  const ownOnly = phase === 'ROUND1';
  const rows = board.entries
    .filter((e) => !ownOnly || e.teamId === teamId)
    .map((e) => ({
      teamId: e.teamId,
      name: e.name,
      rank: ownOnly ? null : e.rank,
      tasksDone: e.tasksCompleted,
      taskFunds: e.taskFunds,
      score: e.score.total,
      potionShare: e.tasksCompleted >= TASKS_PER_TEAM ? share : 0,
      fundsGiven: phase === 'REVEAL' ? e.fundsGiven : null,
      fundsReceived: phase === 'REVEAL' ? e.fundsReceived : null,
    }));
  return { final: phase === 'REVEAL', valid: board.valid, rows };
}

export function buildPlayerState(engine: GameEngine, teamId: string, now: number): PlayerState {
  const s = engine.state;
  const view = engine.teamView(teamId);
  if (!view) throw new Error(`Team ${teamId} is not in game ${s.id}`);
  return {
    game: clockView(s, now),
    branding: s.settings.branding,
    settings: s.settings,
    team: {
      id: view.id,
      name: view.name,
      taskFunds: view.taskFunds,
      supportFunds: view.supportFunds,
      tasksDone: view.tasksDone,
      tasks: view.tasks.map((t) => ({
        ...t,
        timerSeconds: s.settings.tasks.timerSeconds[t.key] ?? 0,
        points: s.settings.scoring.pointsPerTask,
      })),
      foundItems: view.foundItems,
    },
    potion: potionView(engine),
    chat: {
      messagesLeft: messagesLeft(s, teamId),
      messagesPerRound: s.settings.chat.messagesPerRound,
      maxLength: s.settings.chat.maxLength,
    },
    teams: Object.values(s.teams)
      .filter((t) => t.status === 'ACTIVE' && t.id !== teamId)
      .map((t) => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    pendingTransfers: Object.values(s.transfers)
      .filter((t) => t.arrivedAt === null && (t.fromTeamId === teamId || t.toTeamId === teamId))
      .sort((a, b) => a.sentAt - b.sentAt)
      .map((t) => {
        const out = t.fromTeamId === teamId;
        const other = out ? t.toTeamId : t.fromTeamId;
        return {
          id: t.id,
          direction: out ? ('out' as const) : ('in' as const),
          otherTeamId: other,
          otherTeamName: teamName(s, other),
          amount: t.amount,
          msLeft: transferMsLeft(t, now),
        };
      }),
    pendingRequests: Object.values(s.requests)
      .filter(
        (r) => r.status === 'PENDING' && (r.payerTeamId === teamId || r.requesterTeamId === teamId),
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => {
        const incoming = r.payerTeamId === teamId;
        const other = incoming ? r.requesterTeamId : r.payerTeamId;
        return {
          id: r.id,
          direction: incoming ? ('incoming' as const) : ('outgoing' as const),
          otherTeamId: other,
          otherTeamName: teamName(s, other),
          amount: r.amount,
        };
      }),
    transactions: transactionLines(s, teamId),
    inbox: inboxView(s, teamId),
    leaderboard: leaderboardView(engine, teamId),
  };
}

export function buildStaffState(
  engine: GameEngine,
  staff: StaffAccount,
  teams: ReadonlySet<string> | null,
  isOnline: (teamId: string) => boolean,
  devTools: boolean,
  now: number,
): StaffState {
  const s = engine.state;
  const devAdmin = devTools && staff.role === 'MAIN_ADMIN';
  return {
    game: clockView(s, now),
    potion: potionView(engine),
    staff: { id: staff.id, name: staff.name, role: staff.role },
    teams: Object.values(s.teams)
      .filter((t) => !teams || teams.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        status: t.status,
        online: isOnline(t.id),
        taskFunds: t.taskFunds,
        supportFunds: t.supportFunds,
        tasksDone: Object.values(t.tasks).filter((x) => x.status === 'DONE').length,
        messagesLeft: messagesLeft(s, t.id),
      })),
    devTools,
    // Testing aid only (dev tools, main admin). Never part of a player's state.
    devFragments: devAdmin
      ? Object.values(s.fragments)
          .map((f) => ({
            kind: f.kind,
            neededByTeamName: teamName(s, f.neededByTeamId),
            holderTeamName: teamName(s, f.holderTeamId),
            value: f.value,
          }))
          .sort(
            (a, b) =>
              a.kind.localeCompare(b.kind) ||
              a.neededByTeamName.localeCompare(b.neededByTeamName, undefined, { numeric: true }),
          )
      : null,
    devDilemmaAnswers: devAdmin
      ? Object.values(s.teams)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .flatMap((t) =>
            Object.values(t.tasks).flatMap((task) => {
              const answer = dilemmaAnswer(engine.gameContent, task);
              return answer ? [{ teamName: t.name, ...answer }] : [];
            }),
          )
      : null,
  };
}

// ---------- Feed ----------

function chatItem(s: GameState, id: string): FeedItem | null {
  const m = s.chat.find((x) => x.id === id);
  if (!m) return null;
  return {
    kind: 'chat',
    id: m.id,
    at: m.createdAt,
    teamId: m.teamId,
    teamName: teamName(s, m.teamId),
    body: m.body,
  };
}

function transferItem(s: GameState, id: string): FeedItem | null {
  const t = s.transfers[id];
  if (!t) return null;
  return {
    kind: 'transfer',
    id: t.id,
    at: t.sentAt,
    fromTeamId: t.fromTeamId,
    fromTeamName: teamName(s, t.fromTeamId),
    toTeamId: t.toTeamId,
    toTeamName: teamName(s, t.toTeamId),
    amount: t.amount,
    arrived: t.arrivedAt !== null,
  };
}

function requestItem(s: GameState, id: string): FeedItem | null {
  const r = s.requests[id];
  if (!r) return null;
  return {
    kind: 'request',
    id: r.id,
    at: r.createdAt,
    requesterTeamId: r.requesterTeamId,
    requesterTeamName: teamName(s, r.requesterTeamId),
    payerTeamId: r.payerTeamId,
    payerTeamName: teamName(s, r.payerTeamId),
    amount: r.amount,
    status: r.status,
  };
}

// The teams a feed line is about.
export function feedTeams(item: FeedItem): string[] {
  switch (item.kind) {
    case 'chat':
      return [item.teamId];
    case 'transfer':
      return [item.fromTeamId, item.toTeamId];
    case 'request':
      return [item.requesterTeamId, item.payerTeamId];
  }
}

// Chat goes to every team. Transfer and request lines go only to the two teams involved.
export function canSee(viewer: Viewer, item: FeedItem): boolean {
  if (viewer.kind === 'staff') {
    return viewer.teams === null || feedTeams(item).some((t) => viewer.teams?.has(t));
  }
  return item.kind === 'chat' || feedTeams(item).includes(viewer.teamId);
}

export function buildFeed(s: GameState, viewer: Viewer): FeedItem[] {
  const items: FeedItem[] = [
    ...s.chat.map((m) => chatItem(s, m.id)),
    ...Object.keys(s.transfers).map((id) => transferItem(s, id)),
    ...Object.keys(s.requests).map((id) => requestItem(s, id)),
  ].filter((i): i is FeedItem => i !== null && canSee(viewer, i));
  return items.sort((a, b) => a.at - b.at);
}

// The feed lines that changed because of these events, each once.
export function feedChanges(s: GameState, events: readonly EngineEvent[]): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const e of events) {
    let item: FeedItem | null = null;
    if (e.type === 'chatSent') item = chatItem(s, e.messageId);
    else if (e.type === 'transferSent' || e.type === 'transferArrived') {
      item = transferItem(s, e.transferId);
    } else if (e.type === 'requestCreated' || e.type === 'requestDecided') {
      item = requestItem(s, e.requestId);
    }
    if (!item || seen.has(`${item.kind}:${item.id}`)) continue;
    seen.add(`${item.kind}:${item.id}`);
    out.push(item);
  }
  return out;
}
