import { DEFAULT_SETTINGS } from '@magic-potion/shared';
import { describe, expect, it } from 'vitest';
import {
  effectiveNow,
  phaseMsLeft,
  playMsElapsed,
  playSecondsRemaining,
  timersRunning,
  wallTimeForPlayMs,
  type ClockFields,
} from './playClock';

const phases = DEFAULT_SETTINGS.phases; // 35 min, 10 min, 35 min
const MIN = 60_000;
const T0 = 1_000_000;

const lobby: ClockFields = {
  phase: 'LOBBY',
  phaseStartedAt: null,
  phaseEndsAt: null,
  frozenAt: null,
  playMsBeforePhase: 0,
};
const round1: ClockFields = {
  phase: 'ROUND1',
  phaseStartedAt: T0,
  phaseEndsAt: T0 + 35 * MIN,
  frozenAt: null,
  playMsBeforePhase: 0,
};

describe('play clock', () => {
  it('has 70 minutes of play before the game starts', () => {
    expect(playSecondsRemaining(lobby, T0, phases)).toBe(4_200);
    expect(playMsElapsed(lobby, T0)).toBe(0);
  });

  it('counts down through Round 1 and includes all of Round 2', () => {
    const now = T0 + 10 * MIN;
    expect(playMsElapsed(round1, now)).toBe(10 * MIN);
    expect(playSecondsRemaining(round1, now, phases)).toBe(60 * 60);
    expect(phaseMsLeft(round1, now)).toBe(25 * MIN);
  });

  it('rounds play seconds down', () => {
    expect(playSecondsRemaining(round1, T0 + 999, phases)).toBe(4_199);
  });

  it('stops during the Pause', () => {
    const pause: ClockFields = {
      phase: 'PAUSE',
      phaseStartedAt: T0 + 35 * MIN,
      phaseEndsAt: T0 + 45 * MIN,
      frozenAt: null,
      playMsBeforePhase: 35 * MIN,
    };
    for (const now of [T0 + 36 * MIN, T0 + 44 * MIN]) {
      expect(playMsElapsed(pause, now)).toBe(35 * MIN);
      expect(playSecondsRemaining(pause, now, phases)).toBe(35 * 60);
    }
    expect(timersRunning(pause)).toBe(false);
  });

  it('continues in Round 2 from where Round 1 ended', () => {
    const round2: ClockFields = {
      phase: 'ROUND2',
      phaseStartedAt: T0 + 45 * MIN,
      phaseEndsAt: T0 + 80 * MIN,
      frozenAt: null,
      playMsBeforePhase: 35 * MIN,
    };
    const now = T0 + 50 * MIN;
    expect(playMsElapsed(round2, now)).toBe(40 * MIN);
    expect(playSecondsRemaining(round2, now, phases)).toBe(30 * 60);
    // Play time 55:00 is 20 minutes into Round 2.
    expect(wallTimeForPlayMs(round2, 55 * MIN)).toBe(T0 + 65 * MIN);
  });

  it('stops every countdown while the admin has frozen the game', () => {
    const frozen: ClockFields = { ...round1, frozenAt: T0 + 5 * MIN };
    const later = T0 + 20 * MIN;
    expect(timersRunning(frozen)).toBe(false);
    expect(effectiveNow(frozen, later)).toBe(T0 + 5 * MIN);
    expect(playMsElapsed(frozen, later)).toBe(5 * MIN);
    expect(phaseMsLeft(frozen, later)).toBe(30 * MIN);
    expect(wallTimeForPlayMs(frozen, 10 * MIN)).toBeNull();
  });

  it('includes an extension in the play time left', () => {
    const extended: ClockFields = { ...round1, phaseEndsAt: T0 + 37 * MIN };
    expect(playSecondsRemaining(extended, T0, phases)).toBe(72 * 60);
  });

  it('never goes below zero after the phase end time', () => {
    const round2: ClockFields = {
      phase: 'ROUND2',
      phaseStartedAt: T0,
      phaseEndsAt: T0 + 35 * MIN,
      frozenAt: null,
      playMsBeforePhase: 35 * MIN,
    };
    expect(playSecondsRemaining(round2, T0 + 40 * MIN, phases)).toBe(0);
    expect(playMsElapsed(round2, T0 + 40 * MIN)).toBe(70 * MIN);
  });

  it('has no play time left at the Reveal', () => {
    expect(playSecondsRemaining({ ...lobby, phase: 'REVEAL' }, T0, phases)).toBe(0);
  });
});
