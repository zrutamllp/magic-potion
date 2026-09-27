import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, GameSettingsSchema } from '@magic-potion/shared';
import { FakeClock } from '../src/engine/clock';
import { memoryEngine } from '../src/engine/memoryGame';
import { SHORT_DEMO_SETTINGS, demoSettings, describeTiming } from './demoSettings';

const T0 = Date.UTC(2026, 8, 27, 9, 0, 0);
const MIN = 60_000;

describe('demo settings', () => {
  it('uses the real defaults without --short', () => {
    expect(demoSettings(false)).toEqual(DEFAULT_SETTINGS);
    expect(describeTiming(demoSettings(false))).toBe(
      'Round 1 35 min, Pause 10 min, Round 2 35 min',
    );
  });

  it('has 5-minute rounds and a 1-minute pause with --short, and valid settings', () => {
    const s = demoSettings(true);
    expect(GameSettingsSchema.parse(s)).toEqual(s);
    expect(describeTiming(s)).toBe('Round 1 5 min, Pause 1 min, Round 2 5 min');
  });

  it('changes only the timing: every other rule stays at the defaults', () => {
    // Put the default timing into the short settings: what is left must equal the defaults.
    const timingRestored = structuredClone(SHORT_DEMO_SETTINGS);
    timingRestored.phases = DEFAULT_SETTINGS.phases;
    timingRestored.inbox.releaseAtPlaySeconds = DEFAULT_SETTINGS.inbox.releaseAtPlaySeconds;
    expect(timingRestored).toEqual(DEFAULT_SETTINGS);
  });

  it('releases every inbox task inside the 10 minutes of play', () => {
    const { phases, inbox } = SHORT_DEMO_SETTINGS;
    const play = phases.round1Seconds + phases.round2Seconds;
    for (const at of inbox.releaseAtPlaySeconds) expect(at).toBeLessThan(play);
    expect(inbox.releaseAtPlaySeconds[0]).toBeLessThan(phases.round1Seconds);
  });

  it('plays through Round 1, the Pause and Round 2 in 11 minutes', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock, settings: demoSettings(true) });
    await engine.startGame('admin-1');
    expect(engine.state.phaseEndsAt).toBe(T0 + 5 * MIN);
    clock.set(T0 + MIN);
    await engine.tick();
    expect(
      Object.values(engine.state.inboxItems).filter((i) => i.releasedAt !== null),
    ).toHaveLength(1);
    clock.set(T0 + 5 * MIN);
    await engine.tick();
    expect(engine.state.phase).toBe('PAUSE');
    clock.set(T0 + 6 * MIN);
    await engine.tick();
    expect(engine.state.phase).toBe('ROUND2');
    expect((await engine.sendChat('team-1', 'hello')).ok).toBe(true);
    clock.set(T0 + 11 * MIN);
    await engine.tick();
    expect(engine.state.phase).toBe('REVEAL');
    expect(Object.values(engine.state.inboxItems).every((i) => i.releasedAt !== null)).toBe(true);
  });
});
