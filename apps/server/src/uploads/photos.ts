import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { del, get, put } from '@vercel/blob';

// Team photos show real employees (Phase 7A). They live in a PRIVATE Blob store: no file has a
// public address. Staff see a photo through a short-lived link that this server signs and then
// serves itself, after checking the signature and the time. Players never get a link.

// Photos are kept under this folder in the private store. The database stores the path.
export const TEAM_PHOTO_FOLDER = 'team-photos';

export function isPhotoKey(value: string | null): value is string {
  return value !== null && value.startsWith(`${TEAM_PHOTO_FOLDER}/`);
}

export interface PhotoStore {
  // Saves a WebP picture under a random name and returns its private path.
  save(data: Buffer): Promise<string>;
  // The picture, or null if it is gone.
  read(key: string): Promise<Buffer | null>;
  remove(keys: string[]): Promise<void>;
}

// The private Vercel Blob store. Its token is passed in and never logged.
export class BlobPhotoStore implements PhotoStore {
  constructor(private readonly token: string) {}

  async save(data: Buffer): Promise<string> {
    const result = await put(`${TEAM_PHOTO_FOLDER}/${randomUUID()}.webp`, data, {
      access: 'private',
      token: this.token,
      contentType: 'image/webp',
      addRandomSuffix: false,
    });
    return result.pathname;
  }

  async read(key: string): Promise<Buffer | null> {
    const result = await get(key, { access: 'private', token: this.token });
    if (!result || result.statusCode !== 200) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length > 0) await del(keys, { token: this.token });
  }
}

// A link is "<payload>.<signature>": the payload names one photo and when the link runs out;
// the signature is an HMAC with PHOTO_LINK_SECRET (its own secret, so rotating the login
// secret never breaks photo links and the other way round).
export const PHOTO_LINK_MS = 5 * 60 * 1000;

export class PhotoLinks {
  constructor(
    private readonly secret: string,
    private readonly ttlMs = PHOTO_LINK_MS,
  ) {}

  private signature(payload: string): Buffer {
    return createHmac('sha256', this.secret).update(payload).digest();
  }

  sign(key: string, now: number): { token: string; expiresAt: number } {
    const expiresAt = now + this.ttlMs;
    const payload = Buffer.from(JSON.stringify({ k: key, e: expiresAt })).toString('base64url');
    return { token: `${payload}.${this.signature(payload).toString('base64url')}`, expiresAt };
  }

  // The photo's path if the link is genuine and still valid, else null.
  verify(token: string, now: number): string | null {
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    const expected = this.signature(payload);
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const { k, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        k?: unknown;
        e?: unknown;
      };
      if (typeof k !== 'string' || typeof e !== 'number' || e <= now || !isPhotoKey(k)) return null;
      return k;
    } catch {
      return null;
    }
  }
}
