import type { IncomingHttpHeaders } from 'node:http';
import type { Namespace } from 'socket.io';
import {
  CHECK_BUSY,
  CHECK_LIMITS,
  CHECK_MAX_PINGS,
  CHECK_NAMESPACE,
  CHECK_SOCKET_MAX_MS,
  CHECK_TOO_MANY,
  type CheckClientToServerEvents,
  type CheckServerToClientEvents,
} from '@magic-potion/shared';

// The public connection check (/check). Its live connection is a Socket.IO namespace of its own
// on the game's server, so it tests the exact address and transports the game uses. The game
// login middleware only guards the main namespace: a check socket never logs in, never loads a
// game, never joins a game room, and can only ping. The server closes it after a short time.
// Its limits are separate from the login limits (in memory, enough for the single instance).

export interface CheckLimiterOptions {
  max: number;
  windowMs: number;
  now?: () => number;
}

// Counts check connections (and /check-info requests) per address in a fixed window.
export class CheckLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly now: () => number;

  constructor(private readonly opts: CheckLimiterOptions = CHECK_LIMITS.perAddress) {
    this.now = opts.now ?? Date.now;
  }

  // Counts one use; false when the address has used up its window.
  take(address: string): boolean {
    this.prune();
    const now = this.now();
    const entry = this.hits.get(address);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(address, { count: 1, resetAt: now + this.opts.windowMs });
      return true;
    }
    if (entry.count >= this.opts.max) return false;
    entry.count++;
    return true;
  }

  private prune(): void {
    if (this.hits.size < 10_000) return;
    const now = this.now();
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

// The browser's address, as Express works it out with `trust proxy` 1 (Render is one proxy in
// front): the last X-Forwarded-For entry, else the connection's own address.
export function clientAddress(headers: IncomingHttpHeaders, remote: string | undefined): string {
  const forwarded = headers['x-forwarded-for'];
  const list = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? ''))
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return list[list.length - 1] ?? remote ?? '';
}

export interface CheckNamespaceOptions {
  limiter: CheckLimiter;
  maxOpen?: number;
  maxMs?: number;
  maxPings?: number;
}

function refused(message: string): Error {
  const error = new Error(message) as Error & { data?: unknown };
  error.data = { code: 'CHECK_LIMIT' };
  return error;
}

type CheckNamespace = Namespace<CheckClientToServerEvents, CheckServerToClientEvents>;

// Takes any Socket.IO server (the game's is typed with the game events).
export function attachCheckNamespace(
  io: { of(name: string): unknown },
  opts: CheckNamespaceOptions,
): void {
  const maxOpen = opts.maxOpen ?? CHECK_LIMITS.maxOpen;
  const maxMs = opts.maxMs ?? CHECK_SOCKET_MAX_MS;
  const maxPings = opts.maxPings ?? CHECK_MAX_PINGS;
  const check = io.of(CHECK_NAMESPACE) as CheckNamespace;

  check.use((socket, next) => {
    if (check.sockets.size >= maxOpen) return next(refused(CHECK_BUSY));
    const address = clientAddress(socket.handshake.headers, socket.handshake.address);
    if (!opts.limiter.take(address)) return next(refused(CHECK_TOO_MANY));
    next();
  });

  check.on('connection', (socket) => {
    // `true` also closes the underlying connection, so nothing stays open after the test.
    const close = () => socket.disconnect(true);
    const timer = setTimeout(close, maxMs);
    timer.unref();
    socket.on('disconnect', () => clearTimeout(timer));
    let pings = 0;
    socket.on('check:ping', (ack) => {
      pings++;
      if (typeof ack === 'function') ack(Date.now());
      if (pings >= maxPings) close();
    });
  });
}
