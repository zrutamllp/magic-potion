import { API_URL } from '../config';

// Small JSON helpers for the REST routes. Errors carry the server's plain-English message.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
  if (!res.ok) {
    throw new ApiError(
      data.message ?? 'Something went wrong. Please try again.',
      res.status,
      data.code,
    );
  }
  return data as T;
}

export const apiGet = <T>(path: string, token?: string) => call<T>('GET', path, undefined, token);
export const apiPost = <T>(path: string, body?: unknown, token?: string) =>
  call<T>('POST', path, body ?? {}, token);
