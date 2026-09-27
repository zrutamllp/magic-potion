import {
  TASK_DEFINITIONS,
  type TaskKey,
  type TaskType,
  type TeamTaskStatus,
} from '@magic-potion/shared';
import { publicView, type Json } from './checkers';
import { seededRng } from './rng';
import { checkerContext } from './rules/tasks';
import { runningAttempt, tasksDone, type GameContent, type GameState } from './state';

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
    view: Json;
  } | null;
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
      name: TASK_NAMES.get(task.key) ?? task.key,
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
            view: publicView(
              task.key,
              checkerContext(state, content, team, task, attempt, rng),
              attempt.progress,
            ),
          }
        : null,
    };
  });
  const foundItems = Object.values(state.fragments)
    .filter(
      (f) => f.holderTeamId === teamId || (f.neededByTeamId === teamId && f.releasedAt !== null),
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
