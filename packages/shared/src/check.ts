// The public connection check page (/check). Its live connection uses its own Socket.IO
// namespace: no login, no game, one ping event, closed by the server after a short time.

export const CHECK_NAMESPACE = '/check';

// The server closes a check connection after this long, or after this many pings.
export const CHECK_SOCKET_MAX_MS = 30_000;
export const CHECK_MAX_PINGS = 20;

// Per address (offices and VPNs share one, so this is loose: one run opens 2 connections),
// and the total open at once (the real protection).
export const CHECK_LIMITS = {
  perAddress: { max: 400, windowMs: 10 * 60_000 },
  maxOpen: 300,
};

export const CHECK_TOO_MANY =
  'Too many connection checks from your network. Wait a few minutes and try again.';
export const CHECK_BUSY = 'The connection check is busy. Wait a minute and try again.';

export interface CheckClientToServerEvents {
  // Answers with the server time (ms), so the browser can time the round trip.
  'check:ping': (ack: (serverTime: number) => void) => void;
}
// The server sends nothing on its own.
export type CheckServerToClientEvents = Record<string, never>;

// GET /check-info: the tiny test picture in our public store, or null when not set up.
export interface CheckInfo {
  testImageUrl: string | null;
}

export const CHECK_IMAGE_PATH = 'connection-check/pixel.png';
