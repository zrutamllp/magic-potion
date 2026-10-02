import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHECK_BUSY,
  CHECK_NAMESPACE,
  CHECK_TOO_MANY,
  type CheckClientToServerEvents,
  type CheckServerToClientEvents,
} from '@magic-potion/shared';
import { createApp } from '../app';
import { FakeClock } from '../engine/clock';
import { memoryEngine } from '../engine/memoryGame';
import { ADMIN, authFixture, teamPassword } from '../testSupport';
import {
  CheckLimiter,
  attachCheckNamespace,
  clientAddress,
  type CheckNamespaceOptions,
} from './check';
import { Realtime } from './server';

type CheckClient = ClientSocket<CheckServerToClientEvents, CheckClientToServerEvents>;
type Transport = 'polling' | 'websocket';

let realtime: Realtime | null = null;
let http: HttpServer | null = null;
const open: ClientSocket[] = [];

afterEach(async () => {
  for (const s of open.splice(0)) s.disconnect();
  await realtime?.close();
  http?.close();
  realtime = null;
  http = null;
});

// The real game server (a game, logins, the game namespace) with the check namespace beside it.
async function setup(
  check: Partial<CheckNamespaceOptions> = {},
  publicBlobHost: string | null = 'abc123.public.blob.vercel-storage.com',
) {
  const engine = memoryEngine({ teams: 3, clock: new FakeClock(Date.UTC(2026, 9, 2, 9)) }).engine;
  const fx = authFixture();
  realtime = new Realtime({
    auth: fx.auth,
    engines: { get: async () => engine },
    clock: new FakeClock(0),
    clientOrigins: [],
    devTools: false,
    staffRefreshMs: 0,
  });
  const limiter = check.limiter ?? new CheckLimiter();
  http = createServer(createApp({ clientOrigins: [], check: { limiter, publicBlobHost } }));
  const io = realtime.attach(http);
  attachCheckNamespace(io, { ...check, limiter });
  await new Promise<void>((resolve) => http?.listen(0, resolve));
  const url = `http://localhost:${(http.address() as AddressInfo).port}`;
  return { url, engine, fx };
}

function checkSocket(url: string, transports: Transport[] = ['websocket']): CheckClient {
  const socket: CheckClient = connectClient(`${url}${CHECK_NAMESPACE}`, {
    transports,
    upgrade: false,
    forceNew: true,
    reconnection: false,
  });
  open.push(socket);
  return socket;
}

function connected(socket: CheckClient): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
}

function refusedWith(socket: CheckClient): Promise<string> {
  return new Promise((resolve) => socket.on('connect_error', (e) => resolve(e.message)));
}

function ping(socket: CheckClient): Promise<number> {
  return new Promise((resolve) => socket.emit('check:ping', resolve));
}

function disconnectReason(socket: CheckClient): Promise<string> {
  return new Promise((resolve) => socket.on('disconnect', (reason) => resolve(reason)));
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('the check connection', () => {
  it.each<Transport>(['polling', 'websocket'])(
    'connects with no login over %s and pings',
    async (t) => {
      const { url } = await setup();
      const socket = checkSocket(url, [t]);
      await connected(socket);
      expect(socket.io.engine.transport.name).toBe(t);
      expect(typeof (await ping(socket))).toBe('number');
    },
  );

  it('never sees a game: nothing arrives when the game changes', async () => {
    const { url, engine } = await setup();
    const socket = checkSocket(url);
    const received: string[] = [];
    socket.onAny((event: string) => received.push(event));
    await connected(socket);
    expect((await engine.startGame(ADMIN.id)).ok).toBe(true);
    await pause(200);
    expect(received).toEqual([]);
  });

  it('cannot act in a game: game events get no answer and change nothing', async () => {
    const { url, engine } = await setup();
    await engine.startGame(ADMIN.id);
    const before = JSON.stringify(engine.state);
    const socket = checkSocket(url);
    await connected(socket);
    let answered = false;
    const emit = socket.emit.bind(socket) as unknown as (
      e: string,
      p: unknown,
      ack: () => void,
    ) => void;
    emit('chat:send', { text: 'hello', requestId: 'r-1' }, () => (answered = true));
    emit('staff:watch', { teamId: 'team-1' }, () => (answered = true));
    await pause(200);
    expect(answered).toBe(false);
    expect(JSON.stringify(engine.state)).toBe(before);
  });

  it('is closed by the server after the time limit', async () => {
    const { url } = await setup({ maxMs: 150 });
    const socket = checkSocket(url);
    const reason = disconnectReason(socket);
    await connected(socket);
    expect(await reason).toBe('io server disconnect');
  });

  it('is closed by the server after the ping limit, answering every ping first', async () => {
    const { url } = await setup({ maxPings: 3 });
    const socket = checkSocket(url);
    const reason = disconnectReason(socket);
    await connected(socket);
    const answers = await Promise.all([ping(socket), ping(socket), ping(socket)]);
    expect(answers).toHaveLength(3);
    expect(await reason).toBe('io server disconnect');
  });

  it('limits check connections per address', async () => {
    const { url } = await setup({ limiter: new CheckLimiter({ max: 2, windowMs: 60_000 }) });
    await connected(checkSocket(url));
    await connected(checkSocket(url, ['polling']));
    expect(await refusedWith(checkSocket(url))).toBe(CHECK_TOO_MANY);
  });

  it('caps the number of check connections open at once', async () => {
    const { url } = await setup({ maxOpen: 2 });
    await connected(checkSocket(url));
    await connected(checkSocket(url));
    expect(await refusedWith(checkSocket(url))).toBe(CHECK_BUSY);
  });

  it('does not count towards the login limits, and the game still connects', async () => {
    const { url, fx } = await setup({ limiter: new CheckLimiter({ max: 1, windowMs: 60_000 }) });
    await connected(checkSocket(url));
    expect(await refusedWith(checkSocket(url))).toBe(CHECK_TOO_MANY);
    const login = await fx.auth.loginTeam({ code: 'TEAM1', password: teamPassword(1) }, '::1');
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    const game = connectClient(url, {
      auth: { token: login.value.token, as: 'team' },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    open.push(game);
    await new Promise<void>((resolve) => game.on('state:full', () => resolve()));
  });
});

describe('GET /check-info', () => {
  it('gives the test picture in the public store', async () => {
    const { url } = await setup();
    const res = await fetch(`${url}/check-info`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      testImageUrl: 'https://abc123.public.blob.vercel-storage.com/connection-check/pixel.png',
    });
  });

  it('gives null when the public store is not set up', async () => {
    const { url } = await setup({}, null);
    expect(await (await fetch(`${url}/check-info`)).json()).toEqual({ testImageUrl: null });
  });

  it('shares the per-address limit with the check connections', async () => {
    const { url } = await setup({ limiter: new CheckLimiter({ max: 1, windowMs: 60_000 }) });
    expect((await fetch(`${url}/check-info`)).status).toBe(200);
    const res = await fetch(`${url}/check-info`);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ message: CHECK_TOO_MANY });
    expect(await refusedWith(checkSocket(url))).toBe(CHECK_TOO_MANY);
  });
});

describe('CheckLimiter', () => {
  it('allows the maximum per window, then again after the window', () => {
    let now = 0;
    const limiter = new CheckLimiter({ max: 2, windowMs: 1000, now: () => now });
    expect([limiter.take('a'), limiter.take('a'), limiter.take('a')]).toEqual([true, true, false]);
    expect(limiter.take('b')).toBe(true);
    now = 1000;
    expect(limiter.take('a')).toBe(true);
  });
});

describe('clientAddress', () => {
  it('uses the last forwarded address (the one Render adds), like Express with trust proxy 1', () => {
    expect(clientAddress({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }, '10.0.0.1')).toBe('2.2.2.2');
    expect(clientAddress({ 'x-forwarded-for': '3.3.3.3' }, '10.0.0.1')).toBe('3.3.3.3');
  });

  it('falls back to the connection address', () => {
    expect(clientAddress({}, '10.0.0.1')).toBe('10.0.0.1');
    expect(clientAddress({}, undefined)).toBe('');
  });
});
