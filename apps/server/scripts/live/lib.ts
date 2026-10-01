// Helpers for the live-site tests (Phase 7C): a guarded staff API client, team and staff
// sockets that record every action, and the numbers the pass/fail targets need.
// Nothing here ever prints a password or a token.
import { io, type Socket } from 'socket.io-client';
import {
  ENGINE_ERRORS,
  TEST_GAME_PREFIX,
  TEST_STAFF_EMAIL,
  type Ack,
  type ClientToServerEvents,
  type FeedItem,
  type PlayerState,
  type ServerToClientEvents,
  type StaffGameSummary,
} from '@magic-potion/shared';

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const now = () => Date.now();
export const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
export const pick = <T>(items: readonly T[]): T | undefined =>
  items[Math.floor(Math.random() * items.length)];

// Asks for a password without showing what is typed.
export function hiddenPrompt(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('Run this in a terminal, so the password can be typed.'));
      return;
    }
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

export function waitForEnter(question: string): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

// ---------- Numbers ----------

export class Timings {
  private readonly values: number[] = [];
  add(ms: number) {
    this.values.push(ms);
  }
  get count() {
    return this.values.length;
  }
  summary() {
    const v = [...this.values].sort((a, b) => a - b);
    const at = (p: number) => v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))] ?? 0;
    return { count: v.length, p50: at(50), p95: at(95), p99: at(99), max: v.at(-1) ?? 0 };
  }
}

export interface ActionLog {
  acks: Timings;
  byEvent: Map<string, Timings>;
  refused: Map<string, number>;
  errors: string[];
}

export const newLog = (): ActionLog => ({
  acks: new Timings(),
  byEvent: new Map(),
  refused: new Map(),
  errors: [],
});

const RULE_CODES = new Set(Object.keys(ENGINE_ERRORS));

// Sends one action and records how long the answer took. A refusal by the game rules (not
// enough funds, locked out...) is normal play; anything else is an error.
export function act(
  log: ActionLog,
  socket: Client,
  event: keyof ClientToServerEvents,
  payload: object,
  timeoutMs = 10_000,
): Promise<Ack | null> {
  const started = now();
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      log.errors.push(`${event}: no answer within ${timeoutMs / 1000} s`);
      resolve(null);
    }, timeoutMs);
    const emit = socket.emit as unknown as (e: string, p: object, ack: (a: Ack) => void) => void;
    emit.call(socket, event, payload, (ack: Ack) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const ms = now() - started;
      log.acks.add(ms);
      let t = log.byEvent.get(event);
      if (!t) log.byEvent.set(event, (t = new Timings()));
      t.add(ms);
      if (!ack.ok) {
        if (ack.code && RULE_CODES.has(ack.code)) {
          log.refused.set(ack.code, (log.refused.get(ack.code) ?? 0) + 1);
        } else {
          log.errors.push(`${event}: ${ack.code ?? 'no code'} (${ack.message})`);
        }
      }
      resolve(ack);
    });
  });
}

// ---------- Staff API, guarded ----------

export class StaffApi {
  private token = '';
  // The one test game this run made. Every game call must be for it.
  gameId: string | null = null;
  // The test staff this run made.
  readonly testStaffIds = new Set<string>();

  constructor(
    readonly api: string,
    private readonly log: ActionLog,
  ) {}

  async login(email: string, password: string): Promise<{ id: string; role: string }> {
    const res = await fetch(`${this.api}/api/staff/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = (await res.json()) as { token?: string; staff?: { id: string; role: string } };
    if (!res.ok || !body.token || !body.staff)
      throw new Error(`Staff login failed (${res.status}).`);
    this.token = body.token;
    return body.staff;
  }

  get bearer(): string {
    return this.token;
  }

  // Only the calls this test needs, and only for its own game and staff.
  private allowed(method: string, path: string): boolean {
    if (method === 'GET' && path === '/games') return true;
    if (method === 'POST' && path === '/games') return this.gameId === null;
    if (method === 'GET' && path === '/users') return true;
    if (method === 'POST' && path === '/users') return true;
    const user = /^\/users\/([^/]+)$/.exec(path);
    if (user) return method === 'DELETE' && this.testStaffIds.has(user[1]!);
    const game = /^\/games\/([^/?]+)(\/|$|\?)/.exec(path);
    return game !== null && this.gameId !== null && game[1] === this.gameId;
  }

  async call<T = unknown>(method: string, path: string, body?: object): Promise<T> {
    if (!this.allowed(method, path)) {
      throw new Error(`Refused by the test guard: ${method} ${path} is not for this test.`);
    }
    const started = now();
    const res = await fetch(`${this.api}/api/staff${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ms = now() - started;
    const text = await res.text();
    if (!res.ok) {
      let message = text.slice(0, 200);
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? message;
      } catch {
        // not JSON
      }
      this.log.errors.push(`${method} ${path}: ${res.status} ${message}`);
      throw new Error(`${method} ${path}: ${res.status} ${message}`);
    }
    if (ms > 2_000) console.log(`  (slow: ${method} ${path} took ${ms} ms)`);
    const type = res.headers.get('content-type') ?? '';
    return (type.includes('json') ? JSON.parse(text) : text) as T;
  }

  // Checks that this server has the guarded test-game delete (Phase 7C) before anything is made:
  // asking it to delete a game that does not exist must say "not found" in its own words.
  async preflight(): Promise<void> {
    const res = await fetch(`${this.api}/api/staff/games/no-such-game/delete-test-game`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirmName: '' }),
    });
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    if (res.status !== 404 || body.code !== 'GAME_NOT_FOUND') {
      throw new Error(
        'This server cannot delete test games yet (deploy the Phase 7C code first). Nothing was made.',
      );
    }
  }

  games(): Promise<StaffGameSummary[]> {
    return this.call<StaffGameSummary[]>('GET', '/games');
  }
}

export function isTestGameName(name: string) {
  return name.startsWith(TEST_GAME_PREFIX);
}
export function isTestStaffEmail(email: string) {
  return TEST_STAFF_EMAIL.test(email);
}

// ---------- Team sockets ----------

export interface TeamLogin {
  code: string;
  name: string;
  password: string;
}

export interface Bot {
  login: TeamLogin;
  teamId: string;
  token: string;
  socket: Client;
  transport: 'websocket' | 'polling';
  state: PlayerState | null;
  lastUpdateAt: number;
  lastFullAt: number;
  feed: number;
  connects: number;
  disconnects: number;
}

export async function teamLogin(api: string, login: TeamLogin) {
  const started = now();
  const res = await fetch(`${api}/api/team/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: login.code, password: login.password }),
  });
  const body = (await res.json()) as { token?: string; teamId?: string; message?: string };
  if (!res.ok || !body.token || !body.teamId) {
    throw new Error(`Team ${login.code} login failed (${res.status}): ${body.message ?? ''}`);
  }
  return { token: body.token, teamId: body.teamId, ms: now() - started };
}

export function connectTeam(
  api: string,
  login: TeamLogin,
  auth: { token: string; teamId: string },
  transport: 'websocket' | 'polling',
): Promise<Bot> {
  const socket: Client = io(api, {
    auth: { token: auth.token },
    transports: transport === 'polling' ? ['polling'] : ['websocket'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 3_000,
    timeout: 15_000,
  });
  const bot: Bot = {
    login,
    teamId: auth.teamId,
    token: auth.token,
    socket,
    transport,
    state: null,
    lastUpdateAt: 0,
    lastFullAt: 0,
    feed: 0,
    connects: 0,
    disconnects: 0,
  };
  socket.on('connect', () => bot.connects++);
  socket.on('disconnect', () => bot.disconnects++);
  socket.on('state:full', ({ state }) => {
    bot.state = state;
    bot.lastFullAt = bot.lastUpdateAt = now();
  });
  socket.on('state:update', ({ state }) => {
    bot.state = state;
    bot.lastUpdateAt = now();
  });
  socket.on('feed:item', (_item: FeedItem) => {
    bot.feed++;
    bot.lastUpdateAt = now();
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${login.code}: no full state`)), 20_000);
    socket.once('state:full', () => {
      clearTimeout(timer);
      resolve(bot);
    });
    socket.once('connect_error', (e) => {
      clearTimeout(timer);
      reject(new Error(`${login.code}: ${e.message}`));
    });
  });
}

// When the current phase ends, in server time, as this team last saw it.
export function phaseEndsAt(state: PlayerState | null): number | null {
  if (!state || state.game.phaseMsLeft === null) return null;
  return state.game.serverNow + state.game.phaseMsLeft;
}

// ---------- Staff and projector sockets ----------

export interface Watcher {
  label: string;
  socket: Client;
  updates: number;
  lastPhase: string | null;
  connects: number;
  disconnects: number;
}

export function connectStaff(
  api: string,
  token: string,
  gameId: string,
  as: 'staff' | 'projector',
  label: string,
): Promise<Watcher> {
  const socket: Client = io(api, { auth: { token, as, gameId }, transports: ['websocket'] });
  const w: Watcher = { label, socket, updates: 0, lastPhase: null, connects: 0, disconnects: 0 };
  socket.on('connect', () => w.connects++);
  socket.on('disconnect', () => w.disconnects++);
  const seen = (p: { state: { game: { phase: string } } }) => {
    w.updates++;
    w.lastPhase = p.state.game.phase;
  };
  socket.on('staff:full', seen);
  socket.on('staff:update', seen);
  socket.on('projector:full', seen);
  socket.on('projector:update', seen);
  const full = as === 'staff' ? 'staff:full' : 'projector:full';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: no full state`)), 20_000);
    socket.once(full, () => {
      clearTimeout(timer);
      resolve(w);
    });
    socket.once('connect_error', (e) => {
      clearTimeout(timer);
      reject(new Error(`${label}: ${e.message}`));
    });
  });
}

// ---------- A bot's turn ----------

// A well-formed but (almost surely) wrong answer. Bots never know answers: they never reach
// the browser. Null for tasks where the bot gives up or asks for a hint instead.
export function wrongAnswer(key: string): unknown {
  switch (key) {
    case 'vault':
      return { code: '000000' };
    case 'hangman':
      return { letter: pick([...'qxzjkv']) };
    case 'spot_difference':
      return { x: -1000, y: -1000 };
    case 'riddle':
    case 'data_story':
      return { index: 0, answer: 'not this one' };
    case 'picture_puzzle':
    case 'ethical_dilemma':
      return null;
    default:
      return { answer: 'not this one' };
  }
}

export async function botTurn(
  log: ActionLog,
  bot: Bot,
  chatty = true,
): Promise<{ event: string; ok: boolean }> {
  const s = bot.state;
  if (!s || s.game.frozen || !s.game.timersRunning) return { event: 'wait', ok: false };
  const incoming = s.pendingRequests.find((r) => r.direction === 'incoming');
  if (incoming && Math.random() < 0.5) {
    const event = Math.random() < 0.7 ? 'funds:accept' : 'funds:decline';
    const ack = await act(log, bot.socket, event, { requestId: incoming.id });
    return { event: event, ok: ack?.ok === true };
  }
  const r = Math.random();
  const other = pick(s.teams.filter((t) => t.id !== bot.teamId));
  if (chatty && r < 0.15 && s.chat.messagesLeft > 0) {
    const ack = await act(log, bot.socket, 'chat:send', {
      body: `Load test note ${Math.floor(r * 1000)}`,
    });
    return { event: 'chat:send', ok: ack?.ok === true };
  }
  if (r < 0.25 && other && s.team.taskFunds > 200) {
    const ack = await act(log, bot.socket, 'funds:send', { toTeamId: other.id, amount: 100 });
    return { event: 'funds:send', ok: ack?.ok === true };
  }
  if (r < 0.33 && other) {
    const ack = await act(log, bot.socket, 'funds:request', { payerTeamId: other.id, amount: 100 });
    return { event: 'funds:request', ok: ack?.ok === true };
  }
  const running = s.team.tasks.find((t) => t.running);
  if (running) {
    const q = Math.random();
    if (q < 0.15) {
      const ack = await act(log, bot.socket, 'task:hint', { taskId: running.id });
      return { event: 'task:hint', ok: ack?.ok === true };
    }
    const answer = wrongAnswer(running.key);
    if (q < 0.75 && answer !== null && !(running.running && running.running.lockMsLeft > 0)) {
      const ack = await act(log, bot.socket, 'task:submit', {
        taskId: running.id,
        submission: answer,
      });
      return { event: 'task:submit', ok: ack?.ok === true };
    }
    const ack = await act(log, bot.socket, 'task:giveUp', { taskId: running.id });
    return { event: 'task:giveUp', ok: ack?.ok === true };
  }
  // Below zero no task can start: ask another team for money, as a real team would.
  if (s.team.taskFunds < 0) {
    if (!other) return { event: 'idle', ok: false };
    const ack = await act(log, bot.socket, 'funds:request', { payerTeamId: other.id, amount: 300 });
    return { event: 'funds:request', ok: ack?.ok === true };
  }
  const next = pick(s.team.tasks.filter((t) => t.status !== 'DONE'));
  if (next) {
    const ack = await act(log, bot.socket, 'task:start', { taskId: next.id });
    return { event: 'task:start', ok: ack?.ok === true };
  }
  return { event: 'idle', ok: false };
}
