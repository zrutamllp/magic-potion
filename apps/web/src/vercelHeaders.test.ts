import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The web app's security headers (Phase 7A), served by Vercel from vercel.json. They take effect
// only on Vercel, so the live site is checked in Phase 7B; this keeps the file correct.

interface VercelConfig {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;
const all = config.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
const header = (key: string) => all.find((h) => h.key === key)?.value ?? '';

function directive(name: string): string[] {
  const part = header('Content-Security-Policy')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name} `));
  return part ? part.split(/\s+/).slice(1) : [];
}

describe('web security headers', () => {
  it('only runs the app’s own scripts and cannot be framed', () => {
    expect(directive('script-src')).toEqual(["'self'"]);
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('frame-ancestors')).toEqual(["'none'"]);
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Strict-Transport-Security')).toContain('max-age=');
  });

  it('allows the API and its live connection, and nothing else to connect', () => {
    expect(directive('connect-src')).toEqual([
      "'self'",
      'https://potion-api.zrutam.com',
      'wss://potion-api.zrutam.com',
    ]);
  });

  it('allows the pictures, team photos, fonts and intro videos the app shows', () => {
    const img = directive('img-src');
    // Logos and task pictures (public Blob), and team photos through the API's signed links.
    expect(img).toContain('https://*.public.blob.vercel-storage.com');
    expect(img).toContain('https://potion-api.zrutam.com');
    expect(directive('font-src')).toContain('https://fonts.gstatic.com');
    expect(directive('style-src')).toContain('https://fonts.googleapis.com');
    // The Lobby's intro video: YouTube (privacy mode) and Vimeo embeds.
    expect(directive('frame-src')).toEqual([
      'https://www.youtube-nocookie.com',
      'https://player.vimeo.com',
    ]);
  });

  it('plays intro video files only from our own picture store', () => {
    // YouTube and Vimeo play in frames (frame-src); a file must come from our public Blob
    // store, named exactly: never any https site, nor another customer's store.
    const media = directive('media-src');
    expect(media[0]).toBe("'self'");
    expect(media).toHaveLength(2);
    expect(media[1]).toMatch(/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com$/);
  });

  it('sends every page address to the app, so links such as /staff load in production', () => {
    // Vercel serves real files (such as /assets/*) first; only other addresses are rewritten.
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });
});
