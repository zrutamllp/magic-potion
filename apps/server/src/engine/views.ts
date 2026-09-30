import {
  TASK_DEFINITIONS,
  type AttemptResult,
  type TaskKey,
  type TaskType,
  type TeamTaskStatus,
} from '@magic-potion/shared';
import { publicView, type Json } from './checkers';
import { seededRng } from './rng';
import { checkerContext, nextLockSeconds } from './rules/tasks';
import {
  runningAttempt,
  tasksDone,
  type FragmentState,
  type GameContent,
  type GameState,
  type TeamTaskState,
} from './state';

// What one team may see. Only public fields: no answers, no other teams' fragments.

export interface TeamTaskView {
  id: string;
  key: TaskKey;
  name: string;
  type: TaskType;
  status: TeamTaskStatus;
  attempts: number;
  running: {
    number: number;
    msLeft: number;
    lockMsLeft: number;
    hintsUsed: number;
    wrongCount: number;
    nextLockSeconds: number;
    view: Json;
  } | null;
  lastResult: AttemptResult | null;
  // Ethical Dilemma only: the option and reason the team gave. Null for other tasks.
  savedAnswer: DilemmaAnswer | null;
}

export interface DilemmaAnswer {
  option: string;
  reason: string;
}

// The Ethical Dilemma answer saved on the solved try, for the team's own screen and the debrief.
export function dilemmaAnswer(content: GameContent, task: TeamTaskState): DilemmaAnswer | null {
  if (task.key !== 'ethical_dilemma') return null;
  const solved = task.attempts.find((a) => a.result === 'SOLVED');
  if (!solved) return null;
  const { choice, reason } = solved.progress as { choice?: number | null; reason?: string | null };
  const options = (content.byId[solved.contentId]?.publicData as { options?: string[] } | undefined)
    ?.options;
  const option = choice == null ? undefined : options?.[choice];
  return option && reason ? { option, reason } : null;
}

export interface TeamView {
  id: string;
  name: string;
  taskFunds: number;
  supportFunds: number;
  tasksDone: number;
  tasks: TeamTaskView[];
  // "Found item" cards: fragments this team holds, plus any a facilitator released to it.
  // They give no hint about which team or task they belong to.
  foundItems: string[];
}

const TASK_NAMES = new Map(TASK_DEFINITIONS.map((d) => [d.key, d.name]));

// The name players see. Guess the Celebrity takes its name from the content, so admins can
// rename it ("Guess the Leader"): the content of the latest try, or the first variant before one.
export function taskName(content: GameContent, task: TeamTaskState): string {
  const fixed = TASK_NAMES.get(task.key) ?? task.key;
  if (task.key !== 'guess_celebrity') return fixed;
  const lastId = task.attempts[task.attempts.length - 1]?.contentId;
  const c =
    (lastId ? content.byId[lastId] : undefined) ??
    [...(content.byKey[task.key] ?? [])].sort((a, b) => a.variant - b.variant)[0];
  const name = (c?.publicData as { taskName?: unknown } | undefined)?.taskName;
  return typeof name === 'string' && name.trim() !== '' ? name : fixed;
}

export function teamView(
  state: GameState,
  content: GameContent,
  teamId: string,
  now: number,
): TeamView | null {
  const team = state.teams[teamId];
  if (!team) return null;
  const rng = seededRng(0); // public views never draw random numbers
  const tasks = Object.values(team.tasks).map((task): TeamTaskView => {
    const attempt = runningAttempt(task);
    const frozen = attempt?.frozenRemainingMs != null;
    return {
      id: task.id,
      key: task.key,
      name: taskName(content, task),
      type: task.type,
      status: task.status,
      attempts: task.attempts.length,
      running: attempt
        ? {
            number: attempt.number,
            msLeft: frozen ? (attempt.frozenRemainingMs ?? 0) : Math.max(0, attempt.endsAt - now),
            lockMsLeft: frozen
              ? (attempt.frozenLockMs ?? 0)
              : Math.max(0, (attempt.lockedUntil ?? 0) - now),
            hintsUsed: attempt.hintsUsed,
            wrongCount: attempt.wrongCount,
            nextLockSeconds: nextLockSeconds(task, state.settings.tasks.lockoutSeconds),
            view: publicView(
              task.key,
              checkerContext(state, content, team, task, attempt, rng),
              attempt.progress,
            ),
          }
        : null,
      lastResult: [...task.attempts].reverse().find((a) => a.result !== null)?.result ?? null,
      savedAnswer: dilemmaAnswer(content, task),
    };
  });
  // A fixed order, so the cards never swap places (for example after a server restart loads the
  // fragments in another order): held ones first, Vault before Find the Code, then released ones
  // in the order they were released.
  const held = (f: FragmentState) => (f.holderTeamId === teamId ? 0 : 1);
  const foundItems = Object.values(state.fragments)
    .filter(
      (f) => f.holderTeamId === teamId || (f.neededByTeamId === teamId && f.releasedAt !== null),
    )
    .sort(
      (a, b) =>
        held(a) - held(b) ||
        (a.kind === b.kind ? 0 : a.kind === 'VAULT' ? -1 : 1) ||
        (a.releasedAt ?? 0) - (b.releasedAt ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .map((f) => f.value);
  return {
    id: team.id,
    name: team.name,
    taskFunds: team.taskFunds,
    supportFunds: team.supportFunds,
    tasksDone: tasksDone(team),
    tasks,
    foundItems,
  };
}
