import { timersRunning, wallTimeForPlayMs } from './playClock';
import { runningAttempt, type GameState } from './state';

// Scheduled events are not stored in their own table. They come from the saved state:
// phase end, task timer end, transfer arrival and inbox release times. After a restart the
// engine loads the state and handles anything overdue, in time order, at its own due time.

export type DueEvent =
  | { kind: 'inboxRelease'; at: number; itemId: string }
  | { kind: 'transferArrival'; at: number; transferId: string }
  | { kind: 'phaseEnd'; at: number }
  | { kind: 'taskTimeout'; at: number; teamId: string; taskId: string };

// On equal times: inbox releases and arrivals first, then the phase end, then task timeouts.
// So a task whose timer ends exactly when play ends stops with no penalty.
const PRIORITY: Record<DueEvent['kind'], number> = {
  inboxRelease: 0,
  transferArrival: 1,
  phaseEnd: 2,
  taskTimeout: 3,
};

export function dueEvents(state: GameState): DueEvent[] {
  const events: DueEvent[] = [];

  for (const item of Object.values(state.inboxItems)) {
    if (item.releasedAt !== null || item.releaseAtPlaySeconds === null) continue;
    const at = wallTimeForPlayMs(state, item.releaseAtPlaySeconds * 1000);
    if (at !== null) events.push({ kind: 'inboxRelease', at, itemId: item.id });
  }

  for (const t of Object.values(state.transfers)) {
    if (t.arrivedAt === null && t.frozenRemainingMs === null) {
      events.push({ kind: 'transferArrival', at: t.arrivesAt, transferId: t.id });
    }
  }

  const timed = state.phase === 'ROUND1' || state.phase === 'PAUSE' || state.phase === 'ROUND2';
  if (timed && state.frozenAt === null && state.phaseEndsAt !== null) {
    events.push({ kind: 'phaseEnd', at: state.phaseEndsAt });
  }

  if (timersRunning(state)) {
    for (const team of Object.values(state.teams)) {
      for (const task of Object.values(team.tasks)) {
        const attempt = runningAttempt(task);
        if (attempt && attempt.frozenRemainingMs === null) {
          events.push({
            kind: 'taskTimeout',
            at: attempt.endsAt,
            teamId: team.id,
            taskId: task.id,
          });
        }
      }
    }
  }

  return events.sort((a, b) => a.at - b.at || PRIORITY[a.kind] - PRIORITY[b.kind]);
}

export function nextDue(state: GameState): DueEvent | undefined {
  return dueEvents(state)[0];
}
