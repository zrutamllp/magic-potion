import { describe, expect, it } from 'vitest';
import { parseIntroVideo } from './introVideo';

// A made-up store host for the tests; the real one is set per server.
const OUR = 'abc123xyz.public.blob.vercel-storage.com';
const parse = (url: string) => parseIntroVideo(url, OUR);

describe('parseIntroVideo', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('accepts the YouTube link %s', (url, id) => {
    expect(parse(url)).toEqual({ kind: 'youtube', id });
  });

  it.each([
    ['https://vimeo.com/76979871', '76979871'],
    ['https://player.vimeo.com/video/76979871', '76979871'],
  ])('accepts the Vimeo link %s', (url, id) => {
    expect(parse(url)).toEqual({ kind: 'vimeo', id });
  });

  it.each(['mp4', 'webm', 'MOV'])('accepts a .%s file from our own picture store', (ext) => {
    const url = `https://${OUR}/videos/intro.${ext}`;
    expect(parse(url)).toEqual({ kind: 'file', src: url });
  });

  it.each([
    // Another customer's Vercel store.
    'https://someoneelse.public.blob.vercel-storage.com/videos/intro.mp4',
    // Our host, but not over https.
    `http://${OUR}/videos/intro.mp4`,
    // Our host, but not a video file.
    `https://${OUR}/logos/logo.webp`,
    // A look-alike host.
    `https://${OUR}.evil.example/videos/intro.mp4`,
    'https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://cdn.example.com/intro.mp4',
    'https://www.youtube.com/watch?v=',
    'https://vimeo.com/channels/staffpicks',
    'javascript:alert(1)',
    'not a link',
  ])('refuses %s', (url) => {
    expect(parse(url).kind).toBe('refused');
  });

  it('refuses every store file when the server has no store set', () => {
    expect(parseIntroVideo(`https://${OUR}/videos/intro.mp4`, null).kind).toBe('refused');
    expect(parseIntroVideo('https://youtu.be/dQw4w9WgXcQ', null)).toEqual({
      kind: 'youtube',
      id: 'dQw4w9WgXcQ',
    });
  });
});
