import { API_URL } from '../config';

// Small JSON helpers for the REST routes. Errors carry the server's plain-English message.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    // The whole reply, for routes that say more (for example the problems of each field).
    readonly body?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  // A file (picture upload) is sent as it is, with its own type; anything else as JSON.
  const isFile = body instanceof Blob;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body === undefined
          ? {}
          : {
              'Content-Type': isFile ? body.type || 'application/octet-stream' : 'application/json',
            }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : isFile ? body : JSON.stringify(body),
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
      data,
    );
  }
  return data as T;
}

export const apiGet = <T>(path: string, token?: string) => call<T>('GET', path, undefined, token);
export const apiPost = <T>(path: string, body?: unknown, token?: string) =>
  call<T>('POST', path, body ?? {}, token);
export const apiPut = <T>(path: string, body: unknown, token?: string) =>
  call<T>('PUT', path, body, token);
export const apiPatch = <T>(path: string, body: unknown, token?: string) =>
  call<T>('PATCH', path, body, token);
export const apiDelete = <T>(path: string, token?: string, body?: unknown) =>
  call<T>('DELETE', path, body, token);
// Sends one file (a picture) as the request body.
export const apiUpload = <T>(path: string, file: Blob, token?: string) =>
  call<T>('POST', path, file, token);

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
