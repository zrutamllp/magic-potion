import type { Draft } from '../draft';
import type { Potion } from '../potion';
import { activeTeams, runningAttempt, type GameState } from '../state';

// During the Pause, or while the admin has paused the game, every countdown freezes:
// task timers, code lockouts and transfers in transit (GAME_RULES section 2).
// Freezing saves the time left; unfreezing sets a new end time from it.
// Both are safe to call twice.

export function freezeTimers(d: Draft): void {
  const at = d.now;
  for (const team of Object.values(d.state.teams)) {
    for (const task of Object.values(team.tasks)) {
      const attempt = runningAttempt(task);
      if (!attempt || attempt.frozenRemainingMs !== null) continue;
      const lockMs = attempt.lockedUntil !== null ? attempt.lockedUntil - at : 0;
      d.updateAttempt(attempt, {
        frozenRemainingMs: Math.max(0, attempt.endsAt - at),
        frozenLockMs: lockMs > 0 ? lockMs : null,
        lockedUntil: lockMs > 0 ? attempt.lockedUntil : null,
      });
    }
  }
  freezeTransfers(d);
}

export function unfreezeTimers(d: Draft): void {
  const at = d.now;
  for (const team of Object.values(d.state.teams)) {
    for (const task of Object.values(team.tasks)) {
      const attempt = runningAttempt(task);
      if (!attempt || attempt.frozenRemainingMs === null) continue;
      d.updateAttempt(attempt, {
        endsAt: at + attempt.frozenRemainingMs,
        lockedUntil: attempt.frozenLockMs !== null ? at + attempt.frozenLockMs : null,
        frozenRemainingMs: null,
        frozenLockMs: null,
      });
    }
  }
  unfreezeTransfers(d);
}

function freezeTransfers(d: Draft): void {
  for (const t of Object.values(d.state.transfers)) {
    if (t.arrivedAt !== null || t.frozenRemainingMs !== null) continue;
    d.updateTransfer(t, { frozenRemainingMs: Math.max(0, t.arrivesAt - d.now) });
  }
}

export function unfreezeTransfers(d: Draft): void {
  for (const t of Object.values(d.state.transfers)) {
    if (t.arrivedAt !== null || t.frozenRemainingMs === null) continue;
    d.updateTransfer(t, { arrivesAt: d.now + t.frozenRemainingMs, frozenRemainingMs: null });
  }
}

// Completed active teams over active teams (GAME_RULES section 8).
export function potionOf(state: GameState): Potion {
  const teams = activeTeams(state);
  return {
    completedTeams: teams.filter((t) => t.finishedAt !== null).length,
    totalTeams: teams.length,
  };
}
