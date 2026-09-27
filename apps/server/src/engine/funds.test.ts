import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock';
import type { GameEngine } from './engine';
import { memoryEngine } from './memoryGame';

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 27, 9, 0, 0);
const ADMIN = 'admin-1';
const [A, B, C] = ['team-1', 'team-2', 'team-3'];

async function started() {
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams: 3, clock });
  await engine.startGame(ADMIN);
  return { clock, engine, persistence };
}

function funds(engine: GameEngine, teamId: string) {
  return engine.state.teams[teamId]?.taskFunds;
}

function row(engine: GameEngine, teamId: string) {
  return engine.leaderboard().entries.find((e) => e.teamId === teamId);
}

describe('sending funds', () => {
  it('takes the amount at once and delivers it 60 seconds later', async () => {
    const g = await started();
    const r = await g.engine.sendFunds(A, B, 1_000);
    expect(r).toMatchObject({ ok: true, value: { arrivesAt: T0 + 60_000 } });
    expect(funds(g.engine, A)).toBe(9_000);
    expect(funds(g.engine, B)).toBe(10_000);
    g.clock.set(T0 + 59_999);
    await g.engine.tick();
    expect(funds(g.engine, B)).toBe(10_000);
    g.clock.set(T0 + 60_000);
    await g.engine.tick();
    expect(funds(g.engine, B)).toBe(11_000);
  });

  it('counts only arrived transfers as given and received', async () => {
    const g = await started();
    await g.engine.sendFunds(A, B, 333);
    expect(row(g.engine, A)).toMatchObject({ fundsGiven: 0 });
    expect(row(g.engine, B)).toMatchObject({ fundsReceived: 0 });
    g.clock.set(T0 + MIN);
    await g.engine.tick();
    expect(row(g.engine, A)).toMatchObject({
      fundsGiven: 333,
      score: { collaborationBonus: 499 },
    });
    expect(row(g.engine, B)).toMatchObject({
      fundsReceived: 333,
      score: { fundsReceivedPoints: -666 },
    });
  });

  it('needs enough Task Funds, a whole positive amount and another team', async () => {
    const g = await started();
    expect(await g.engine.sendFunds(A, B, 10_001)).toMatchObject({ code: 'NOT_ENOUGH_FUNDS' });
    expect(await g.engine.sendFunds(A, B, 0)).toMatchObject({ code: 'INVALID_AMOUNT' });
    expect(await g.engine.sendFunds(A, B, 12.5)).toMatchObject({ code: 'INVALID_AMOUNT' });
    expect(await g.engine.sendFunds(A, A, 100)).toMatchObject({ code: 'CANNOT_SEND_TO_SELF' });
    expect(await g.engine.sendFunds(A, 'nobody', 100)).toMatchObject({ code: 'TEAM_NOT_FOUND' });
    expect((await g.engine.sendFunds(A, B, 10_000)).ok).toBe(true);
    expect(funds(g.engine, A)).toBe(0);
  });

  it('cannot send to a removed team', async () => {
    const g = await started();
    await g.engine.removeTeam(ADMIN, B, 'Left');
    expect(await g.engine.sendFunds(A, B, 100)).toMatchObject({ code: 'TEAM_REMOVED' });
  });

  it('freezes transfers in transit during the Pause', async () => {
    const g = await started();
    g.clock.set(T0 + 35 * MIN - 20_000);
    await g.engine.sendFunds(A, B, 500);
    g.clock.set(T0 + 44 * MIN);
    await g.engine.tick();
    expect(g.engine.state.phase).toBe('PAUSE');
    expect(funds(g.engine, B)).toBe(10_000);
    expect(await g.engine.sendFunds(A, B, 100)).toMatchObject({ code: 'WRONG_PHASE' });
    // 40 seconds were left when the Pause started.
    g.clock.set(T0 + 45 * MIN + 39_999);
    await g.engine.tick();
    expect(funds(g.engine, B)).toBe(10_000);
    g.clock.set(T0 + 45 * MIN + 40_000);
    await g.engine.tick();
    expect(funds(g.engine, B)).toBe(10_500);
  });

  it('delivers transfers still in transit when the game ends, and they count', async () => {
    const g = await started();
    await g.engine.endPhase(ADMIN);
    await g.engine.endPhase(ADMIN);
    g.clock.set(T0 + 10 * MIN);
    await g.engine.sendFunds(A, B, 700);
    await g.engine.endPhase(ADMIN);
    expect(g.engine.state.phase).toBe('REVEAL');
    g.clock.set(T0 + 11 * MIN);
    await g.engine.tick();
    expect(funds(g.engine, B)).toBe(10_700);
    expect(row(g.engine, A)?.fundsGiven).toBe(700);
  });
});

describe('fund requests', () => {
  it('creates a normal transfer when accepted', async () => {
    const g = await started();
    const req = await g.engine.requestFunds(A, B, 2_000);
    if (!req.ok) throw new Error(req.code);
    const acc = await g.engine.acceptRequest(B, req.value.requestId);
    expect(acc.ok).toBe(true);
    expect(g.engine.state.requests[req.value.requestId]?.status).toBe('ACCEPTED');
    expect(funds(g.engine, B)).toBe(8_000);
    g.clock.set(T0 + MIN);
    await g.engine.tick();
    expect(funds(g.engine, A)).toBe(12_000);
    expect(row(g.engine, B)?.fundsGiven).toBe(2_000);
    expect(row(g.engine, A)?.fundsReceived).toBe(2_000);
  });

  it('blocks the accept if the payer is short, and can be declined or cancelled', async () => {
    const g = await started();
    const big = await g.engine.requestFunds(A, B, 10_001);
    if (!big.ok) throw new Error(big.code);
    expect(await g.engine.acceptRequest(B, big.value.requestId)).toMatchObject({
      code: 'PAYER_NOT_ENOUGH_FUNDS',
    });
    // Only the payer can answer.
    expect(await g.engine.acceptRequest(C, big.value.requestId)).toMatchObject({
      code: 'REQUEST_NOT_FOUND',
    });
    expect((await g.engine.declineRequest(B, big.value.requestId)).ok).toBe(true);
    expect(await g.engine.acceptRequest(B, big.value.requestId)).toMatchObject({
      code: 'REQUEST_CLOSED',
    });
    const other = await g.engine.requestFunds(A, C, 100);
    if (!other.ok) throw new Error(other.code);
    expect((await g.engine.cancelRequest(A, other.value.requestId)).ok).toBe(true);
    expect(g.engine.state.requests[other.value.requestId]?.status).toBe('CANCELLED');
  });

  it('cancels pending requests when a team is removed', async () => {
    const g = await started();
    const req = await g.engine.requestFunds(A, B, 100);
    if (!req.ok) throw new Error(req.code);
    await g.engine.removeTeam(ADMIN, A, 'Left');
    expect(g.engine.state.requests[req.value.requestId]?.status).toBe('CANCELLED');
  });
});

describe('inbox', () => {
  const PHOTO = 'inbox-1';
  const QUESTION = 'inbox-2'; // 7 x 8, released at 30:00

  it('cannot be answered before release', async () => {
    const g = await started();
    expect(await g.engine.answerInbox(A, QUESTION, '56')).toMatchObject({
      code: 'INBOX_NOT_RELEASED',
    });
  });

  it('gives 3 attempts per question and 1,000 for a right answer', async () => {
    const g = await started();
    g.clock.set(T0 + 30 * MIN);
    await g.engine.tick();
    expect(await g.engine.answerInbox(A, QUESTION, '54')).toMatchObject({
      value: { correct: false, attemptsLeft: 2 },
    });
    expect(await g.engine.answerInbox(A, QUESTION, ' Fifty  Six ')).toMatchObject({
      value: { correct: true, attemptsLeft: 1 },
    });
    expect(await g.engine.answerInbox(A, QUESTION, '56')).toMatchObject({
      code: 'INBOX_ALREADY_DONE',
    });
    expect(row(g.engine, A)?.score.inboxBonus).toBe(1_000);
    for (const a of ['1', '2', '3']) await g.engine.answerInbox(B, QUESTION, a);
    expect(await g.engine.answerInbox(B, QUESTION, '56')).toMatchObject({
      code: 'NO_ATTEMPTS_LEFT',
    });
    expect(row(g.engine, B)?.score.inboxBonus).toBe(0);
  });

  it('accepts the team photo, removes the bonus on reject, and restores it on a new upload', async () => {
    const g = await started();
    g.clock.set(T0 + 10 * MIN);
    await g.engine.tick();
    expect((await g.engine.submitPhoto(A, PHOTO, 'https://blob/photo1.jpg')).ok).toBe(true);
    expect(row(g.engine, A)?.inboxCompleted).toBe(1);
    expect((await g.engine.rejectPhoto(ADMIN, A, PHOTO, 'Not the whole team')).ok).toBe(true);
    expect(row(g.engine, A)?.inboxCompleted).toBe(0);
    expect((await g.engine.submitPhoto(A, PHOTO, 'https://blob/photo2.jpg')).ok).toBe(true);
    expect(row(g.engine, A)?.inboxCompleted).toBe(1);
    expect(await g.engine.submitPhoto(A, PHOTO, 'https://blob/photo3.jpg')).toMatchObject({
      code: 'INBOX_ALREADY_DONE',
    });
  });

  it('audits a photo reject', async () => {
    const g = await started();
    g.clock.set(T0 + 10 * MIN);
    await g.engine.submitPhoto(A, PHOTO, 'https://blob/p.jpg');
    await g.engine.rejectPhoto(ADMIN, A, PHOTO, 'Blurry');
    const audit = g.persistence.log.filter(
      (c) => c.kind === 'create' && c.model === 'auditLog' && c.data['action'] === 'REJECT_PHOTO',
    );
    expect(audit).toHaveLength(1);
  });
});

describe('Full Potion Bonus', () => {
  it('is added at the Reveal only when every active team has finished', async () => {
    const g = await started();
    await g.engine.removeTeam(ADMIN, C, 'Left');
    // No team finished: potion 0 of 2, nobody wins.
    for (let i = 0; i < 3; i++) await g.engine.endPhase(ADMIN);
    const lb = g.engine.leaderboard();
    expect(lb.valid).toBe(false);
    expect(lb.entries.map((e) => e.teamId).sort()).toEqual([A, B]);
    expect(lb.entries.every((e) => e.score.potionBonus === 0)).toBe(true);
  });
});
