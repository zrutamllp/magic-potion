import type { GamePhase, GameSettings } from '@magic-potion/shared';

// Pure play-clock maths. All times are epoch milliseconds.
//
// phaseStartedAt is the effective start: when the admin resumes after a freeze,
// both phaseStartedAt and phaseEndsAt move forward by the frozen time.
// The play clock runs only in Round 1 and Round 2 (GAME_RULES section 2).

export interface ClockFields {
  phase: GamePhase;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  frozenAt: number | null;
  playMsBeforePhase: number;
}

export function isPlayPhase(phase: GamePhase): boolean {
  return phase === 'ROUND1' || phase === 'ROUND2';
}

// Task timers, lockouts and transfers run only while this is true.
export function timersRunning(g: ClockFields): boolean {
  return isPlayPhase(g.phase) && g.frozenAt === null;
}

// While frozen, every countdown reads as if time stopped at the freeze.
export function effectiveNow(g: ClockFields, now: number): number {
  return g.frozenAt ?? now;
}

export function phaseMsLeft(g: ClockFields, now: number): number | null {
  if (g.phaseEndsAt === null) return null;
  return Math.max(0, g.phaseEndsAt - effectiveNow(g, now));
}

// Play time used in the current phase (0 outside the rounds).
export function phasePlayMs(g: ClockFields, now: number): number {
  if (!isPlayPhase(g.phase) || g.phaseStartedAt === null) return 0;
  const end = Math.min(effectiveNow(g, now), g.phaseEndsAt ?? Infinity);
  return Math.max(0, end - g.phaseStartedAt);
}

export function playMsElapsed(g: ClockFields, now: number): number {
  return g.playMsBeforePhase + phasePlayMs(g, now);
}

// Play time left to the current end of play, including extensions already added.
export function playMsRemaining(
  g: ClockFields,
  now: number,
  phases: GameSettings['phases'],
): number {
  const round2 = phases.round2Seconds * 1000;
  switch (g.phase) {
    case 'LOBBY':
      return phases.round1Seconds * 1000 + round2;
    case 'ROUND1':
      return (phaseMsLeft(g, now) ?? 0) + round2;
    case 'PAUSE':
      return round2;
    case 'ROUND2':
      return phaseMsLeft(g, now) ?? 0;
    case 'REVEAL':
      return 0;
  }
}

export function playSecondsRemaining(
  g: ClockFields,
  now: number,
  phases: GameSettings['phases'],
): number {
  return Math.floor(playMsRemaining(g, now, phases) / 1000);
}

// Wall-clock time at which the play clock reaches playMs, assuming the current phase keeps running.
// Null while the play clock is stopped.
export function wallTimeForPlayMs(g: ClockFields, playMs: number): number | null {
  if (!timersRunning(g) || g.phaseStartedAt === null) return null;
  return g.phaseStartedAt + (playMs - g.playMsBeforePhase);
}
