import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  Ack,
  ClientToServerEvents,
  FeedItem,
  FindCodeCipher,
  PlayerState,
  ProjectorState,
  ServerToClientEvents,
  StaffState,
} from '@magic-potion/shared';
import { createApp } from '../app';
import { FakeClock } from '../engine/clock';
import { finishAllTasks } from '../engine/devTools';
import type { GameEngine } from '../engine/engine';
import { memoryEngine } from '../engine/memoryGame';
import { createApiRouter } from '../http/api';
import { ADMIN, COFAC, authFixture, teamPassword } from '../testSupport';
import { Realtime, type EngineSource } from './server';

const T0 = Date.UTC(2026, 8, 27, 9, 0, 0);
const MIN = 60_000;
const [A, B, C] = ['team-1', 'team-2', 'team-3'];

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

// One connected browser, with everything it has received.
interface Browser {
  socket: Client;
  state: () => PlayerState;
  feed: FeedItem[];
  payloads: string[];
  ended: { code: string; message: string }[];
}

let clock: FakeClock;
let engine: GameEngine;
let fx: ReturnType<typeof authFixture>;
let realtime: Realtime;
let engines: EngineSource;
let http: HttpServer;
let url: string;
const open: Client[] = [];

beforeEach(async () => {
  clock = new FakeClock(T0);
  engine = memoryEngine({ teams: 3, clock }).engine;
  fx = authFixture();
  engines = {
    get: async (id) => {
      if (id !== 'game-1') throw new Error('no such game');
      return engine;
    },
  };
  realtime = new Realtime({
    auth: fx.auth,
    engines,
    clock,
    clientOrigins: [],
    devTools: true,
  });
  const api = createApiRouter({
    auth: fx.auth,
    engine: (id) => realtime.engine(id),
    devTools: true,
  });
  http = createServer(createApp({ clientOrigins: [], api }));
  realtime.attach(http);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const s of open.splice(0)) s.disconnect();
  await realtime.close();
});

async function waitFor(check: () => boolean, what = 'condition'): Promise<void> {
  const until = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function teamToken(i: number): Promise<string> {
  const r = await fx.auth.loginTeam({ code: `TEAM${i}`, password: teamPassword(i) }, 'test');
  if (!r.ok) throw new Error(r.message);
  return r.value.token;
}

function socketFor(auth: object, transports: ('polling' | 'websocket')[] = ['websocket']): Client {
  const socket: Client = connectClient(url, {
    auth,
    transports,
    forceNew: true,
    reconnection: false,
  });
  open.push(socket);
  return socket;
}

async function browser(token: string, transports?: ('polling' | 'websocket')[]): Promise<Browser> {
  const socket = socketFor({ token, as: 'team' }, transports);
  let state: PlayerState | null = null;
  const b: Browser = {
    socket,
    state: () => {
      if (!state) throw new Error('no state yet');
      return state;
    },
    feed: [],
    payloads: [],
    ended: [],
  };
  socket.onAny((_event, payload: unknown) => b.payloads.push(JSON.stringify(payload)));
  socket.on('state:full', (p) => {
    state = p.state;
    b.feed = [...p.feed];
  });
  socket.on('state:update', (p) => {
    state = p.state;
  });
  socket.on('feed:item', (item) => {
    const i = b.feed.findIndex((x) => x.kind === item.kind && x.id === item.id);
    if (i >= 0) b.feed[i] = item;
    else b.feed.push(item);
  });
  socket.on('session:ended', (p) => b.ended.push(p));
  await waitFor(() => state !== null, 'state:full');
  return b;
}

async function team(i: number, transports?: ('polling' | 'websocket')[]) {
  return browser(await teamToken(i), transports);
}

function send<E extends keyof ClientToServerEvents>(
  b: { socket: Client },
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<Ack> {
  return new Promise((resolve) => {
    (b.socket.emit as (e: string, p: unknown, ack: (a: Ack) => void) => void)(
      event,
      payload,
      resolve,
    );
  });
}

function connectError(auth: object): Promise<{ message: string; data?: { code?: string } }> {
  const socket = socketFor(auth);
  return new Promise((resolve) => socket.on('connect_error', (e) => resolve(e as never)));
}

async function staffToken(who = ADMIN): Promise<string> {
  const r = await fx.auth.loginStaff({ email: who.email, password: who.password }, 'test');
  if (!r.ok) throw new Error(r.message);
  return r.value.token;
}

async function staffBrowser(who = ADMIN) {
  const socket = socketFor({ token: await staffToken(who), as: 'staff', gameId: 'game-1' });
  let state: StaffState | null = null;
  const feed: FeedItem[] = [];
  socket.on('staff:full', (p) => {
    state = p.state;
    feed.push(...p.feed);
  });
  socket.on('staff:update', (p) => {
    state = p.state;
  });
  socket.on('feed:item', (item) => {
    const i = feed.findIndex((x) => x.kind === item.kind && x.id === item.id);
    if (i >= 0) feed[i] = item;
    else feed.push(item);
  });
  await waitFor(() => state !== null, 'staff:full');
  return {
    socket,
    feed,
    state: () => state as unknown as StaffState,
  };
}

async function started() {
  const r = await engine.startGame(ADMIN.id);
  expect(r.ok).toBe(true);
}

describe('connecting', () => {
  it('sends the full state on connect and pushes phase changes', async () => {
    const a = await team(1);
    expect(a.state().game.phase).toBe('LOBBY');
    expect(a.state().team).toMatchObject({ id: A, name: 'Team 1' });
    expect(a.state().teams.map((t) => t.id)).toEqual([B, C]);
    await started();
    await waitFor(() => a.state().game.phase === 'ROUND1', 'Round 1');
    expect(a.state().game.phaseMsLeft).toBe(35 * MIN);
    expect(a.state().team.taskFunds).toBe(10_000);
    expect(a.state().team.tasks).toHaveLength(5);
  });

  it('refuses a missing or forged token', async () => {
    expect((await connectError({ token: 'nope', as: 'team' })).data?.code).toBe('NOT_LOGGED_IN');
    expect((await connectError({})).data?.code).toBe('NOT_LOGGED_IN');
  });

  it('works over long-polling only', async () => {
    await started();
    const a = await team(1, ['polling']);
    const b = await team(2, ['polling']);
    expect(await send(a, 'chat:send', { body: 'over polling' })).toMatchObject({ ok: true });
    await waitFor(() => b.feed.some((f) => f.kind === 'chat' && f.body === 'over polling'));
  });

  it('never resets a timer on reconnect', async () => {
    await started();
    const token = await teamToken(1);
    const first = await browser(token);
    first.socket.disconnect();
    clock.advance(10_000);
    const again = await browser(token);
    expect(again.state().game.phaseMsLeft).toBe(35 * MIN - 10_000);
  });
});

describe('chat', () => {
  it('reaches every team at once and counts down the limit', async () => {
    await started();
    const a = await team(1);
    const b = await team(2);
    const ack = await send(a, 'chat:send', { body: 'hello from Team 1' });
    expect(ack).toMatchObject({ ok: true, value: { messagesLeft: 4 } });
    for (const x of [a, b]) {
      await waitFor(() => x.feed.some((f) => f.kind === 'chat' && f.body === 'hello from Team 1'));
    }
    await waitFor(() => a.state().chat.messagesLeft === 4);
    expect(b.state().chat.messagesLeft).toBe(5);
    expect(b.feed.find((f) => f.kind === 'chat')).toMatchObject({ teamName: 'Team 1' });
  });

  it('refuses the 6th message and bad payloads', async () => {
    await started();
    const a = await team(1);
    for (let i = 0; i < 5; i++) await send(a, 'chat:send', { body: `m${i}` });
    const sixth = await send(a, 'chat:send', { body: 'one too many' });
    expect(sixth).toMatchObject({ ok: false, code: 'CHAT_LIMIT_REACHED' });
    const bad = await send(a, 'chat:send', { body: 42 } as never);
    expect(bad).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
  });

  it('is blocked while the game is paused', async () => {
    await started();
    const a = await team(1);
    await engine.freeze(ADMIN.id);
    await waitFor(() => a.state().game.frozen);
    expect(a.state().game.timersRunning).toBe(false);
    expect(await send(a, 'chat:send', { body: 'hi' })).toMatchObject({
      ok: false,
      message: 'The game is paused. Please wait.',
    });
  });

  it('loads the chat history for a team that connects later', async () => {
    await started();
    const a = await team(1);
    await send(a, 'chat:send', { body: 'early message' });
    const c = await team(3);
    expect(c.feed).toEqual([expect.objectContaining({ kind: 'chat', body: 'early message' })]);
  });
});

describe('funds', () => {
  it('shows a pending transfer to the two teams only, then delivers it after 60 seconds', async () => {
    await started();
    const a = await team(1);
    const b = await team(2);
    const c = await team(3);
    const ack = await send(a, 'funds:send', { toTeamId: B, amount: 500 });
    expect(ack).toMatchObject({ ok: true });
    await waitFor(() => a.state().team.taskFunds === 9_500, 'sender debited');
    expect(a.state().pendingTransfers).toEqual([
      expect.objectContaining({
        direction: 'out',
        otherTeamName: 'Team 2',
        amount: 500,
        msLeft: MIN,
      }),
    ]);
    await waitFor(() => b.state().pendingTransfers.length === 1, 'receiver sees pending');
    expect(b.state().pendingTransfers[0]).toMatchObject({ direction: 'in', otherTeamId: A });
    for (const x of [a, b]) {
      await waitFor(() => x.feed.some((f) => f.kind === 'transfer' && !f.arrived));
    }

    clock.advance(MIN);
    await engine.tick();
    await waitFor(() => b.state().team.taskFunds === 10_500, 'funds arrived');
    await waitFor(() => a.feed.some((f) => f.kind === 'transfer' && f.arrived));
    expect(b.state().pendingTransfers).toEqual([]);
    // Team 3 was told nothing about it.
    await send(c, 'chat:send', { body: 'sync' });
    await waitFor(() => c.feed.some((f) => f.kind === 'chat'));
    expect(c.feed.some((f) => f.kind === 'transfer')).toBe(false);
    expect(c.payloads.join('')).not.toContain('"kind":"transfer"');
  });

  it('sends requests, and accepting one starts a transfer', async () => {
    await started();
    const a = await team(1);
    const b = await team(2);
    const req = await send(b, 'funds:request', { payerTeamId: A, amount: 300 });
    expect(req.ok).toBe(true);
    await waitFor(() => a.state().pendingRequests.length === 1, 'request arrives');
    const incoming = a.state().pendingRequests[0];
    expect(incoming).toMatchObject({ direction: 'incoming', otherTeamName: 'Team 2', amount: 300 });
    expect(await send(a, 'funds:accept', { requestId: incoming?.id ?? '' })).toMatchObject({
      ok: true,
    });
    await waitFor(() => b.state().pendingTransfers.length === 1, 'transfer pending');
    await waitFor(() => b.feed.some((f) => f.kind === 'request' && f.status === 'ACCEPTED'));
  });

  it('explains refusals in plain English', async () => {
    await started();
    const a = await team(1);
    expect(await send(a, 'funds:send', { toTeamId: B, amount: 999_999 })).toMatchObject({
      ok: false,
      message: 'You do not have enough Task Funds.',
    });
    expect(await send(a, 'funds:send', { toTeamId: A, amount: 1 })).toMatchObject({
      code: 'CANNOT_SEND_TO_SELF',
    });
  });
});

describe('potion and leaderboard', () => {
  it('pours a team share into the potion for everyone at once', async () => {
    await started();
    const a = await team(1);
    const b = await team(2);
    expect(b.state().potion.percent).toBe(0);
    expect((await finishAllTasks(engine, A)).ok).toBe(true);
    await waitFor(() => b.state().potion.completedTeams === 1, 'potion update');
    await waitFor(() => a.state().potion.completedTeams === 1, 'potion update for team 1');
    expect(a.state().potion.percent).toBeCloseTo(100 / 3);
    expect(a.state().team.tasksDone).toBe(5);
  });

  it('follows the visibility rules for each phase', async () => {
    const a = await team(1);
    expect(a.state().leaderboard).toBeNull();
    await started();
    await waitFor(() => a.state().game.phase === 'ROUND1');
    expect(a.state().leaderboard?.rows).toEqual([
      expect.objectContaining({ teamId: A, rank: null }),
    ]);
    await engine.endPhase(ADMIN.id);
    await waitFor(() => a.state().game.phase === 'PAUSE');
    expect(a.state().leaderboard).toBeNull();
    await engine.endPhase(ADMIN.id);
    await waitFor(() => a.state().game.phase === 'ROUND2');
    expect(a.state().leaderboard?.rows).toHaveLength(3);
    expect(a.state().leaderboard?.rows.every((r) => r.rank !== null)).toBe(true);
    expect(a.state().chat.messagesLeft).toBe(5);
  });
});

describe('sessions', () => {
  it('ends the older window when the team logs in again', async () => {
    await started();
    const oldToken = await teamToken(1);
    const first = await browser(oldToken);
    const disconnected = new Promise<string>((r) => first.socket.on('disconnect', r));
    const second = await team(1);
    await waitFor(() => first.ended.length === 1, 'session:ended');
    expect(first.ended[0]).toEqual({
      code: 'SESSION_REPLACED',
      message: 'Your team logged in on another device.',
    });
    expect(await disconnected).toBe('io server disconnect');
    expect(second.socket.connected).toBe(true);
    expect((await connectError({ token: oldToken, as: 'team' })).data?.code).toBe('SESSION_ENDED');
  });
});

describe('secrets', () => {
  it('never sends answers or other teams’ fragments to a team', async () => {
    await started();
    const a = await team(1);
    // Open a task so its public view is part of the state.
    const vault = a.state().team.tasks.find((t) => t.key === 'vault');
    expect(await send(a, 'task:start', { taskId: vault?.id ?? '' })).toMatchObject({ ok: true });
    await waitFor(() => a.state().team.tasks.some((t) => t.running !== null));
    await send(a, 'chat:send', { body: 'hi' });
    await waitFor(() => a.feed.length === 1);

    const own = new Set(a.state().team.foundItems);
    const secrets = new Set<string>();
    for (const f of Object.values(engine.state.fragments)) {
      if (!own.has(f.value)) secrets.add(f.value);
      const cipher = f.secretData as FindCodeCipher | null;
      if (cipher?.word) secrets.add(cipher.word);
    }
    for (const item of Object.values(engine.state.inboxItems)) {
      for (const answer of item.secretAnswer ?? []) secrets.add(answer);
    }
    expect(secrets.size).toBeGreaterThan(3);

    const all = a.payloads.join('\n');
    expect(all.length).toBeGreaterThan(1000);
    // The same search does find what the team may see: its own found items.
    expect(own.size).toBeGreaterThan(0);
    for (const v of own) expect(all).toContain(JSON.stringify(v));
    for (const s of secrets) expect(all).not.toContain(JSON.stringify(s));
    for (const key of ['secretData', 'secretAnswer', 'passwordHash', 'hiddenKey', 'clueDigits']) {
      expect(all).not.toContain(`"${key}"`);
    }
  });
});

describe('staff', () => {
  it('shows the main admin every team, who is online, and every feed line', async () => {
    await started();
    const admin = await staffBrowser();
    expect(admin.state().teams.map((t) => t.id)).toEqual([A, B, C]);
    expect(admin.state().devTools).toBe(true);
    const a = await team(1);
    await waitFor(() => admin.state().teams.find((t) => t.id === A)?.online === true, 'online');
    await send(a, 'funds:send', { toTeamId: B, amount: 100 });
    await waitFor(() => admin.feed.some((f) => f.kind === 'transfer'), 'transfer line');
    a.socket.disconnect();
    await waitFor(() => admin.state().teams.find((t) => t.id === A)?.online === false, 'offline');
  });

  it('shows the main admin who holds which fragment (dev tools), never the players', async () => {
    await started();
    const admin = await staffBrowser();
    const fragments = admin.state().devFragments;
    expect(fragments).toHaveLength(6);
    expect(fragments?.filter((f) => f.kind === 'VAULT').map((f) => f.neededByTeamName)).toEqual([
      'Team 1',
      'Team 2',
      'Team 3',
    ]);
    const cofac = await staffBrowser(COFAC);
    expect(cofac.state().devFragments).toBeNull();
    const a = await team(1);
    await send(a, 'chat:send', { body: 'hi' });
    await waitFor(() => a.feed.length === 1);
    const all = a.payloads.join('');
    expect(all).not.toContain('devFragments');
    expect(all).not.toContain('devDilemmaAnswers');
    expect(all).not.toContain('holderTeamName');
  });

  it('shows a co-facilitator only their assigned teams', async () => {
    await started();
    const cofac = await staffBrowser(COFAC);
    expect(cofac.state().teams.map((t) => t.id)).toEqual([A]);
    const b = await team(2);
    await send(b, 'funds:send', { toTeamId: C, amount: 100 });
    await send(b, 'chat:send', { body: 'from team 2' });
    await engine.sendFunds(A, B, 50);
    await waitFor(() => cofac.feed.some((f) => f.kind === 'transfer'), 'own team transfer');
    expect(cofac.feed.filter((f) => f.kind === 'transfer')).toEqual([
      expect.objectContaining({ fromTeamId: A }),
    ]);
    expect(cofac.feed.some((f) => f.kind === 'chat')).toBe(false);
  });

  it('refuses a co-facilitator for a game with no assigned teams', async () => {
    fx.store.assignments = [];
    const token = await staffToken(COFAC);
    expect((await connectError({ token, as: 'staff', gameId: 'game-1' })).data?.code).toBe(
      'NOT_ALLOWED',
    );
  });
});

describe('reloading a Lobby game', () => {
  it('disconnects the game so browsers reconnect and get the fresh state', async () => {
    const a = await team(1);
    const reasons: string[] = [];
    a.socket.on('disconnect', (reason) => reasons.push(reason));
    await realtime.reloadGame('game-1');
    await waitFor(() => reasons.length === 1, 'disconnect');
    expect(reasons).toEqual(['io server disconnect']);
    expect(a.ended).toEqual([]);

    let full = 0;
    a.socket.on('state:full', () => full++);
    a.socket.connect();
    await waitFor(() => full === 1, 'state:full after reconnect');
  });

  it('keeps a started game connected', async () => {
    await started();
    const a = await team(1);
    const evicted: string[] = [];
    // The registry refuses to drop a game that has started.
    engines.evict = async (id) => {
      evicted.push(id);
      return false;
    };
    await realtime.reloadGame('game-1');
    expect(evicted).toEqual(['game-1']);
    await new Promise((r) => setTimeout(r, 50));
    expect(a.socket.connected).toBe(true);
  });
});

describe('facilitator dashboard (Phase 6C)', () => {
  it('sends tasks, a live score and pending requests to staff', async () => {
    await started();
    const s = await staffBrowser();
    const row = s.state().teams.find((t) => t.id === A);
    expect(row?.tasks).toHaveLength(5);
    expect(row?.tasks[0]).toMatchObject({ status: 'NOT_STARTED', running: null });
    expect(row?.score).toBe(20_000);
    expect(s.state().limits).toEqual({ coFacilitatorAdjustLimit: 2_000, stuckIdleSeconds: 300 });
    await engine.requestAdjustment({ id: COFAC.id, name: 'Co-facilitator' }, A, 3_000, 'x');
    await waitFor(() => s.state().pendingAdjustments.length === 1, 'pending request');
    expect(s.state().pendingAdjustments[0]).toMatchObject({ teamName: 'Team 1', amount: 3_000 });
  });

  it('flags a team with Task Funds below zero, or idle for 5 minutes in a round', async () => {
    await started();
    const s = await staffBrowser();
    const stuck = (id: string) => s.state().teams.find((t) => t.id === id)?.stuck;
    expect(stuck(A)).toEqual([]);
    await engine.adjustFunds(ADMIN.id, A, -10_001, 'x');
    await waitFor(() => stuck(A)?.includes('NEGATIVE_FUNDS') === true, 'negative funds flag');

    clock.advance(2 * MIN);
    await engine.sendChat(B, 'hello');
    clock.advance(3 * MIN - 1);
    realtime.refreshStaff();
    await waitFor(() => stuck(C)?.length === 0, 'fresh state');
    clock.advance(1);
    realtime.refreshStaff();
    await waitFor(() => stuck(C)?.includes('IDLE') === true, 'idle flag');
    expect(stuck(B)).toEqual([]);
    // Not while the game is paused.
    await engine.freeze(ADMIN.id);
    await waitFor(() => stuck(C)?.length === 0, 'no flag while paused');
  });

  it('records a team login as activity', async () => {
    await started();
    clock.advance(MIN);
    await team(1);
    await engine.idle();
    expect(engine.state.teams[A]?.lastActionAt).toBe(T0 + MIN);
  });

  it('"View as team" sends exactly what the team sees, for allowed teams only', async () => {
    await started();
    const a = await team(1);
    const s = await staffBrowser();
    const seen: { state: PlayerState; feed?: FeedItem[] }[] = [];
    s.socket.on('staff:team', (p) => seen.push(p));
    expect(await send(s, 'staff:watch', { teamId: A })).toEqual({ ok: true });
    await waitFor(() => seen.length === 1, 'first team view');
    expect(seen[0]?.feed).toEqual([]);

    await send(a, 'chat:send', { body: 'hello' });
    await waitFor(() => seen.some((p) => p.feed?.length === 1), 'feed change');
    await waitFor(() => a.feed.length === 1, 'team feed');
    expect(seen.at(-1)?.state).toEqual(a.state());
    expect(seen.at(-1)?.feed).toEqual(a.feed);

    const cofac = await staffBrowser(COFAC);
    expect(await send(cofac, 'staff:watch', { teamId: B })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
    expect(await send(cofac, 'staff:watch', { teamId: A })).toEqual({ ok: true });
  });

  it('tells dashboards to reload the audit log after a staff change', async () => {
    await started();
    const s = await staffBrowser();
    let nudges = 0;
    s.socket.on('staff:audit', () => nudges++);
    await engine.adjustFunds(ADMIN.id, A, 100, 'x');
    await waitFor(() => nudges === 1, 'audit nudge');
    await engine.sendChat(B, 'hi');
    await engine.idle();
    expect(nudges).toBe(1);
  });

  it('resends the whole feed with the new name after a live rename', async () => {
    await started();
    const a = await team(1);
    await send(a, 'chat:send', { body: 'hello' });
    await waitFor(() => a.feed.length === 1, 'chat line');
    await engine.renameTeam(ADMIN.id, A, 'Owls');
    await waitFor(() => a.feed[0]?.kind === 'chat' && a.feed[0].teamName === 'Owls', 'new name');
    expect(a.state().team.name).toBe('Owls');
  });
});

describe('projector (Phase 6D)', () => {
  async function projector(who = ADMIN) {
    const socket = socketFor({ token: await staffToken(who), as: 'projector', gameId: 'game-1' });
    let state: ProjectorState | null = null;
    socket.on('projector:full', (p) => (state = p.state));
    socket.on('projector:update', (p) => (state = p.state));
    await waitFor(() => state !== null, 'projector:full');
    return () => state as unknown as ProjectorState;
  }

  it('shows every team, even to a co-facilitator, and updates live', async () => {
    await started();
    const view = await projector(COFAC);
    expect(view().teams.map((t) => t.name)).toEqual(['Team 1', 'Team 2', 'Team 3']);
    await finishAllTasks(engine, B, 2);
    await waitFor(() => view().teams.find((t) => t.id === B)?.tasksDone === 2, 'tasks x/5');
  });

  it('never shows scores or ranks in Round 1 or the Pause', async () => {
    await started();
    await finishAllTasks(engine, A, 3);
    const view = await projector();
    expect(view().leaderboard).toBeNull();
    expect(JSON.stringify(view())).not.toMatch(/"score"|"rank"/);
    await engine.endPhase(ADMIN.id);
    await waitFor(() => view().game.phase === 'PAUSE', 'pause');
    expect(view().leaderboard).toBeNull();
    expect(view().potion.halftime).not.toBeNull();
  });

  it('ranks teams from Round 2, and shows halftime and final potion at the Reveal', async () => {
    await started();
    await finishAllTasks(engine, A, 3);
    await engine.endPhase(ADMIN.id);
    await engine.endPhase(ADMIN.id);
    const view = await projector();
    expect(view().game.phase).toBe('ROUND2');
    expect(view().leaderboard?.rows[0]).toMatchObject({ teamId: A, rank: 1, tasksDone: 3 });
    expect(view().leaderboard?.final).toBe(false);
    expect(view().finalPotion).toBeNull();
    await engine.endPhase(ADMIN.id);
    await waitFor(() => view().game.phase === 'REVEAL', 'reveal');
    expect(view().leaderboard).toMatchObject({ final: true, valid: false });
    expect(view().finalPotion).toMatchObject({ completedTeams: 0, totalTeams: 3 });
  });

  it('has no actions: a projector cannot follow a team', async () => {
    await started();
    const socket = socketFor({ token: await staffToken(), as: 'projector', gameId: 'game-1' });
    await new Promise((r) => socket.on('projector:full', r));
    const ack = await Promise.race([
      new Promise((resolve) =>
        (socket.emit as (e: string, p: unknown, a: (x: unknown) => void) => void)(
          'staff:watch',
          { teamId: A },
          resolve,
        ),
      ),
      new Promise((resolve) => setTimeout(() => resolve('no answer'), 300)),
    ]);
    expect(ack).toBe('no answer');
  });
});
