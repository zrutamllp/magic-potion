import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock';
import { finishAllTasks } from './devTools';
import { GameEngine } from './engine';
import { memoryEngine, sampleContent } from './memoryGame';
import { MemoryPersistence } from './persistence/memory';
import { seededRng } from './rng';

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 27, 9, 0, 0);
const ADMIN = 'admin-1';
const [A, B] = ['team-1', 'team-2'];

async function started() {
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams: 3, clock });
  await engine.startGame(ADMIN);
  return { clock, engine, persistence };
}

async function sendMany(engine: GameEngine, teamId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const r = await engine.sendChat(teamId, `message ${i + 1}`);
    expect(r.ok).toBe(true);
  }
}

describe('chat', () => {
  it('saves a message and counts it toward the limit', async () => {
    const g = await started();
    const r = await g.engine.sendChat(A, '  hello   there  ');
    expect(r).toMatchObject({ ok: true, value: { messagesLeft: 4 } });
    expect(g.engine.state.chat).toEqual([
      expect.objectContaining({ teamId: A, round: 1, body: 'hello   there', createdAt: T0 }),
    ]);
    expect(g.persistence.log).toContainEqual(
      expect.objectContaining({ kind: 'create', model: 'chatMessage' }),
    );
    expect(g.engine.messagesLeft(A)).toBe(4);
    expect(g.engine.messagesLeft(B)).toBe(5);
  });

  it('blocks the 6th message in a round', async () => {
    const g = await started();
    await sendMany(g.engine, A, 5);
    expect(g.engine.messagesLeft(A)).toBe(0);
    expect(await g.engine.sendChat(A, 'one more')).toMatchObject({
      ok: false,
      code: 'CHAT_LIMIT_REACHED',
    });
    // Other teams have their own limit.
    expect((await g.engine.sendChat(B, 'hi')).ok).toBe(true);
  });

  it('resets the limit in Round 2', async () => {
    const g = await started();
    await sendMany(g.engine, A, 5);
    await g.engine.endPhase(ADMIN); // to the Pause
    expect(g.engine.messagesLeft(A)).toBe(5);
    await g.engine.endPhase(ADMIN); // to Round 2
    expect(g.engine.state.phase).toBe('ROUND2');
    await sendMany(g.engine, A, 5);
    expect(g.engine.state.chat.filter((m) => m.round === 2)).toHaveLength(5);
    expect((await g.engine.sendChat(A, 'six')).ok).toBe(false);
  });

  it('uses the chat settings for the limit and the length', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock });
    engine.state.settings.chat.messagesPerRound = 2;
    engine.state.settings.chat.maxLength = 10;
    await engine.startGame(ADMIN);
    expect(await engine.sendChat(A, '12345678901')).toMatchObject({ code: 'CHAT_TOO_LONG' });
    expect((await engine.sendChat(A, '1234567890')).ok).toBe(true);
    expect((await engine.sendChat(A, 'two')).ok).toBe(true);
    expect(await engine.sendChat(A, 'three')).toMatchObject({ code: 'CHAT_LIMIT_REACHED' });
  });

  it('rejects an empty message without using one up', async () => {
    const g = await started();
    expect(await g.engine.sendChat(A, '   ')).toMatchObject({ code: 'CHAT_EMPTY' });
    expect(g.engine.messagesLeft(A)).toBe(5);
  });

  it('is closed in the Lobby, the Pause, the Reveal and while paused', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock });
    expect(await engine.sendChat(A, 'hi')).toMatchObject({ code: 'WRONG_PHASE' });
    await engine.startGame(ADMIN);
    await engine.freeze(ADMIN);
    expect(await engine.sendChat(A, 'hi')).toMatchObject({ code: 'GAME_FROZEN' });
    await engine.resume(ADMIN);
    expect((await engine.sendChat(A, 'hi')).ok).toBe(true);
    await engine.endPhase(ADMIN);
    expect(await engine.sendChat(A, 'hi')).toMatchObject({ code: 'WRONG_PHASE' });
    await engine.endPhase(ADMIN);
    await engine.endPhase(ADMIN);
    expect(engine.state.phase).toBe('REVEAL');
    expect(await engine.sendChat(A, 'hi')).toMatchObject({ code: 'WRONG_PHASE' });
    expect(engine.messagesLeft(A)).toBe(0);
  });

  it('refuses removed teams', async () => {
    const g = await started();
    await g.engine.removeTeam(ADMIN, A, 'left early');
    expect(await g.engine.sendChat(A, 'hi')).toMatchObject({ code: 'TEAM_REMOVED' });
  });

  it('keeps the count after a restart', async () => {
    const g = await started();
    await sendMany(g.engine, A, 3);
    g.clock.set(T0 + MIN);
    const reloaded = new GameEngine({
      state: structuredClone(g.engine.state),
      content: sampleContent(),
      persistence: new MemoryPersistence(),
      clock: g.clock,
      rng: seededRng(2),
    });
    expect(reloaded.messagesLeft(A)).toBe(2);
  });
});

describe('finishAllTasks (dev tool)', () => {
  it('solves all 5 tasks through the normal commands and fills the potion share', async () => {
    const g = await started();
    const r = await finishAllTasks(g.engine, A);
    expect(r).toMatchObject({ ok: true, value: { solved: 5 } });
    expect(g.engine.potion()).toEqual({ completedTeams: 1, totalTeams: 3 });
  });

  it('reports why it cannot run', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock });
    expect(await finishAllTasks(engine, 'nope')).toMatchObject({ code: 'TEAM_NOT_FOUND' });
    expect(await finishAllTasks(engine, A)).toMatchObject({ ok: true, value: { solved: 0 } });
  });
});
