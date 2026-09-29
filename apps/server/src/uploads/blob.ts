import { randomUUID } from 'node:crypto';
import { del, put } from '@vercel/blob';

// Where uploaded files are kept. Vercel Blob in the app; a fake in tests.
export interface FileStore {
  // Saves the file and returns its public URL.
  save(folder: string, data: Buffer, contentType: string, extension: string): Promise<string>;
  // Deletes files by their URLs (team photos after the retention time).
  remove(urls: string[]): Promise<void>;
}

// Vercel Blob (public store). File names are random, never the original name or a person's name.
// The token is passed in, never logged.
export class BlobFileStore implements FileStore {
  constructor(private readonly token: string) {}

  async save(folder: string, data: Buffer, contentType: string, extension: string) {
    const result = await put(`${folder}/${randomUUID()}.${extension}`, data, {
      access: 'public',
      token: this.token,
      contentType,
      addRandomSuffix: false,
    });
    return result.url;
  }

  async remove(urls: string[]) {
    if (urls.length > 0) await del(urls, { token: this.token });
  }
}
