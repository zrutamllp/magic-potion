import { SERVER_BUSY, SERVER_BUSY_RETRY_SECONDS } from '@magic-potion/shared';
import { API_URL } from '../config';
import { newActionId } from './emit';

// Small JSON helpers for the REST routes. Errors carry the server's plain-English message.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    // The whole reply, for routes that say more (for example the problems of each field).
    readonly body?: unknown,
    // Seconds the server asked us to wait (Retry-After), when it was busy.
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Never sent again by themselves: files and spreadsheets, previews and logins run as before.
const NO_RESEND = [
  /\/uploads\//,
  /\/import(\?|$)/,
  /\/items\/bulk$/,
  /\/preview(\/|$)/,
  /\/login$/,
];
const RESEND_AFTER_MS = 2_000;

// Safe to repeat (Phase 7C): every change carries an Idempotency-Key. If the network drops
// before the answer comes, the same change is sent once more with the same key; the server
// answers a repeat with its first answer and applies it once (so "End phase" pressed during a
// network blip never ends two phases).
async function send(
  method: string,
  path: string,
  init: RequestInit,
  wait: (ms: number) => Promise<void>,
): Promise<Response> {
  const isChange = CHANGES.has(method);
  const headers = new Headers(init.headers);
  if (isChange) headers.set('Idempotency-Key', newActionId());
  const resend = isChange && !(init.body instanceof Blob) && !NO_RESEND.some((r) => r.test(path));
  try {
    return await fetch(`${API_URL}${path}`, { ...init, method, headers });
  } catch {
    if (!resend) throw new ApiError(NO_SERVER, 0);
  }
  await wait(RESEND_AFTER_MS);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, method, headers });
  } catch {
    throw new ApiError(NO_SERVER, 0);
  }
}

const NO_SERVER = 'Cannot reach the server. Check your connection and try again.';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  // A file (picture upload) is sent as it is, with its own type; anything else as JSON.
  const isFile = body instanceof Blob;
  const res = await send(
    method,
    path,
    {
      headers: {
        ...(body === undefined
          ? {}
          : {
              'Content-Type': isFile ? body.type || 'application/octet-stream' : 'application/json',
            }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : isFile ? body : JSON.stringify(body),
    },
    wait,
  );
  const data = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('Retry-After'));
    throw new ApiError(
      data.message ?? 'Something went wrong. Please try again.',
      res.status,
      data.code,
      data,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  return data as T;
}

export const apiGet = <T>(path: string, token?: string) => call<T>('GET', path, undefined, token);
export const apiPost = <T>(path: string, body?: unknown, token?: string) =>
  call<T>('POST', path, body ?? {}, token);
// For tests: a POST with a chosen wait between the two tries.
export const apiPostWithWait = <T>(
  path: string,
  body: unknown,
  token: string | undefined,
  wait: (ms: number) => Promise<void>,
) => call<T>('POST', path, body, token, wait);
export const apiPut = <T>(path: string, body: unknown, token?: string) =>
  call<T>('PUT', path, body, token);
export const apiPatch = <T>(path: string, body: unknown, token?: string) =>
  call<T>('PATCH', path, body, token);
export const apiDelete = <T>(path: string, token?: string, body?: unknown) =>
  call<T>('DELETE', path, body, token);
// Sends one file (a picture) as the request body.
export const apiUpload = <T>(path: string, file: Blob, token?: string) =>
  call<T>('POST', path, file, token);

// Logins (Phase 7C): when a whole room logs in at once the server may answer "busy, try again"
// (503 SERVER_BUSY). Then wait as asked, plus a little random time so the room does not come
// back all at the same moment, and try again by itself. Only after that is the message shown.
export async function apiLogin<T>(
  path: string,
  body: unknown,
  opts: { retries?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await apiPost<T>(path, body);
    } catch (error) {
      const busy = error instanceof ApiError && error.status === 503 && error.code === SERVER_BUSY;
      if (!busy || attempt >= retries) throw error;
      const seconds = error.retryAfter ?? SERVER_BUSY_RETRY_SECONDS;
      await wait(seconds * 1000 + Math.floor(Math.random() * 1500));
    }
  }
}

// Downloads a file (a spreadsheet template) and saves it under `filename`.
export async function apiDownload(path: string, filename: string, token?: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  if (!res.ok) throw new ApiError('The download did not work. Please try again.', res.status);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
