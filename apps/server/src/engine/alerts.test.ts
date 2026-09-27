import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@magic-potion/shared';
import { buildPlayerState } from '../realtime/views';
import { FakeClock } from './clock';
import { GameEngine } from './engine';
import { memoryEngine, sampleContent } from './memoryGame';
import { MemoryPersistence } from './persistence/memory';
import { seededRng } from './rng';
import { alertKeyOf, duration } from './rules/alerts';

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 27, 9, 0, 0);
const ADMIN = 'admin-1';

function alerts(engine: GameEngine) {
  return Object.values(engine.state.inboxItems)
    .filter((i) => i.kind === 'ALERT')
    .sort((a, b) => (a.releasedAt ?? 0) - (b.releasedAt ?? 0))
    .map((i) => ({
      key: alertKeyOf(i.publicData),
      at: i.releasedAt,
      title: i.title,
      body: i.body,
    }));
}

async function at(g: { clock: FakeClock; engine: GameEngine }, ms: number) {
  g.clock.set(ms);
  await g.engine.tick();
}

describe('game alerts', () => {
  it('posts round start, 5 minutes left, pause and play over, each once', async () => {
    const clock = new FakeClock(T0);
    const { engine, persistence } = memoryEngine({ teams: 3, clock });
    const g = { clock, engine };
    await engine.startGame(ADMIN);
    expect(alerts(engine)).toEqual([
      {
        key: 'ROUND1_START',
        at: T0,
        title: 'Round 1 has started',
        body: 'Round 1 lasts 35 minutes.',
      },
    ]);
    await at(g, T0 + 30 * MIN - 1);
    expect(alerts(engine)).toHaveLength(1);
    await at(g, T0 + 30 * MIN);
    expect(alerts(engine)[1]).toMatchObject({ key: 'ROUND1_5MIN', at: T0 + 30 * MIN });
    await at(g, T0 + 35 * MIN);
    expect(alerts(engine)[2]).toMatchObject({
      key: 'PAUSE_START',
      body: 'Everything is paused for 10 minutes. Round 2 starts after the pause.',
    });
    await at(g, T0 + 45 * MIN);
    await at(g, T0 + 75 * MIN);
    await at(g, T0 + 80 * MIN);
    expect(alerts(engine).map((a) => a.key)).toEqual([
      'ROUND1_START',
      'ROUND1_5MIN',
      'PAUSE_START',
      'ROUND2_START',
      'ROUND2_5MIN',
      'PLAY_OVER',
    ]);
    expect(alerts(engine)[4]?.at).toBe(T0 + 75 * MIN);
    expect(
      persistence.log.filter(
        (c) => c.kind === 'create' && c.model === 'inboxItem' && c.data.kind === 'ALERT',
      ),
    ).toHaveLength(6);
  });

  it('skips "5 minutes left" in rounds of 5 minutes or less', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.phases = { round1Seconds: 300, pauseSeconds: 60, round2Seconds: 300 };
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock, settings });
    await engine.startGame(ADMIN);
    for (const t of [1, 5, 6, 11]) await at({ clock, engine }, T0 + t * MIN);
    expect(alerts(engine).map((a) => a.key)).toEqual([
      'ROUND1_START',
      'PAUSE_START',
      'ROUND2_START',
      'PLAY_OVER',
    ]);
  });

  it('moves "5 minutes left" with an admin pause, and never posts it twice', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock });
    const g = { clock, engine };
    await engine.startGame(ADMIN);
    clock.set(T0 + 10 * MIN);
    await engine.freeze(ADMIN);
    clock.set(T0 + 12 * MIN);
    await engine.resume(ADMIN);
    // Paused for 2 minutes, so the warning moves from 30 to 32 minutes.
    await at(g, T0 + 31 * MIN);
    expect(alerts(engine)).toHaveLength(1);
    await at(g, T0 + 32 * MIN);
    expect(alerts(engine)[1]?.key).toBe('ROUND1_5MIN');
    await engine.extendPhase(ADMIN, 600);
    await at(g, T0 + 40 * MIN);
    expect(alerts(engine).filter((a) => a.key === 'ROUND1_5MIN')).toHaveLength(1);
  });

  it('does not post an alert again after a restart', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock });
    await engine.startGame(ADMIN);
    await at({ clock, engine }, T0 + 30 * MIN);
    const reloaded = new GameEngine({
      state: structuredClone(engine.state),
      content: sampleContent(),
      persistence: new MemoryPersistence(),
      clock,
      rng: seededRng(3),
    });
    clock.set(T0 + 31 * MIN);
    await reloaded.tick();
    expect(alerts(reloaded).map((a) => a.key)).toEqual(['ROUND1_START', 'ROUND1_5MIN']);
  });

  it('shows alerts in the player inbox, newest last, with no answers', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock });
    await engine.startGame(ADMIN);
    await at({ clock, engine }, T0 + 10 * MIN);
    const inbox = buildPlayerState(engine, 'team-1', clock.now()).inbox;
    expect(inbox.map((i) => i.kind)).toEqual(['ALERT', 'PHOTO']);
    expect(inbox[0]).toMatchObject({
      title: 'Round 1 has started',
      done: false,
      attemptsLeft: null,
    });
  });

  it('writes durations in plain words', () => {
    expect(duration(2100)).toBe('35 minutes');
    expect(duration(60)).toBe('1 minute');
    expect(duration(90)).toBe('90 seconds');
  });
});

describe('player state additions', () => {
  it('sends the rule numbers and each task timer and points', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock });
    await engine.startGame(ADMIN);
    const state = buildPlayerState(engine, 'team-1', clock.now());
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
    const vault = state.team.tasks.find((t) => t.key === 'vault');
    expect(vault).toMatchObject({ timerSeconds: 720, points: 10_000 });
    expect(state.team.tasks.every((t) => t.timerSeconds > 0)).toBe(true);
  });

  it('sends funds given and received only at the Reveal', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock });
    await engine.startGame(ADMIN);
    await engine.sendFunds('team-1', 'team-2', 400);
    await at({ clock, engine }, T0 + MIN);
    await engine.endPhase(ADMIN);
    await engine.endPhase(ADMIN);
    const round2 = buildPlayerState(engine, 'team-1', clock.now()).leaderboard?.rows ?? [];
    expect(round2.every((r) => r.fundsGiven === null && r.fundsReceived === null)).toBe(true);
    await engine.endPhase(ADMIN);
    const rows = buildPlayerState(engine, 'team-1', clock.now()).leaderboard?.rows ?? [];
    expect(rows.find((r) => r.teamId === 'team-1')).toMatchObject({
      fundsGiven: 400,
      fundsReceived: 0,
    });
    expect(rows.find((r) => r.teamId === 'team-2')).toMatchObject({
      fundsGiven: 0,
      fundsReceived: 400,
    });
  });
});
