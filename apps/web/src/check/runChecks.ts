import { io, type Socket } from 'socket.io-client';
import {
  CHECK_NAMESPACE,
  type CheckClientToServerEvents,
  type CheckInfo,
  type CheckServerToClientEvents,
} from '@magic-potion/shared';
import { API_URL, SOCKET_URL } from '../config';
import { median, type CheckResults, type Pictures, type Timed } from './verdict';

// The connection check's tests, run one after the other in the browser. Each reports as soon as
// it finishes. The live connection is the server's separate check namespace: no login, no game.

type CheckSocket = Socket<CheckServerToClientEvents, CheckClientToServerEvents>;
type Transport = 'polling' | 'websocket';

const TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 10_000;
const PINGS = 10;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

async function checkServer(): Promise<Timed> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_URL}/healthz`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? { ok: true, ms: performance.now() - start } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function ping(socket: CheckSocket): Promise<number> {
  const start = performance.now();
  return withTimeout(
    new Promise<number>((resolve) =>
      socket.emit('check:ping', () => resolve(performance.now() - start)),
    ),
    TIMEOUT_MS,
  );
}

// Opens a check connection on one transport only, and sends one ping through it.
async function openSocket(transport: Transport): Promise<{ result: Timed; socket: CheckSocket }> {
  const start = performance.now();
  const socket: CheckSocket = io(`${SOCKET_URL}${CHECK_NAMESPACE}`, {
    transports: [transport],
    upgrade: false,
    reconnection: false,
    forceNew: true,
    timeout: CONNECT_TIMEOUT_MS,
  });
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      }),
      CONNECT_TIMEOUT_MS,
    );
    const ms = performance.now() - start;
    await ping(socket);
    return { result: { ok: true, ms }, socket };
  } catch {
    socket.disconnect();
    return { result: { ok: false }, socket };
  }
}

async function measureSpeed(socket: CheckSocket): Promise<number | 'failed'> {
  const times: number[] = [];
  try {
    for (let i = 0; i < PINGS; i++) times.push(await ping(socket));
  } catch {
    // Use what was measured.
  }
  return times.length > 0 ? median(times) : 'failed';
}

function loadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    // A fresh copy, so a picture cached earlier on another network cannot pass the test.
    img.src = `${url}?check=${Date.now()}`;
  });
}

async function checkPictures(): Promise<{ pictures: Pictures; host: string | null }> {
  try {
    const res = await fetch(`${API_URL}/check-info`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { pictures: 'failed', host: null };
    const info = (await res.json()) as CheckInfo;
    if (!info.testImageUrl) return { pictures: 'not_set_up', host: null };
    const host = new URL(info.testImageUrl).host;
    return { pictures: (await loadImage(info.testImageUrl)) ? 'ok' : 'failed', host };
  } catch {
    return { pictures: 'failed', host: null };
  }
}

async function checkFonts(): Promise<boolean> {
  try {
    const faces = await withTimeout(document.fonts.load('16px Inter'), TIMEOUT_MS);
    return faces.length > 0 && faces.every((f) => f.status === 'loaded');
  } catch {
    return false;
  }
}

// An opaque answer means the site was reached; a network error means it is blocked.
async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

export interface CheckUpdate extends Partial<Omit<CheckResults, 'browser'>> {
  picturesHost?: string | null;
}

export async function runChecks(update: (patch: CheckUpdate) => void): Promise<void> {
  update({ server: await checkServer() });

  const polling = await openSocket('polling');
  update({ polling: polling.result });
  const websocket = await openSocket('websocket');
  update({ websocket: websocket.result });
  const best = websocket.result.ok ? websocket.socket : polling.result.ok ? polling.socket : null;
  update({ speed: best ? await measureSpeed(best) : 'failed' });
  // Closed straight away; the server would close them soon anyway.
  polling.socket.disconnect();
  websocket.socket.disconnect();

  const { pictures, host } = await checkPictures();
  update({ pictures, picturesHost: host });

  const [fonts, youtube, vimeo] = await Promise.all([
    checkFonts(),
    reachable('https://www.youtube-nocookie.com/'),
    reachable('https://player.vimeo.com/'),
  ]);
  update({ fonts, youtube, vimeo });
}
