// The Lobby's intro video may only be a YouTube or Vimeo link (played in their own privacy
// players) or a video file in our own public picture store. The server checks the exact store
// host when the link is saved; the web page's Content-Security-Policy allows only that host.

// The WHATWG URL parser, present in Node and every browser. This package is built without the
// DOM or Node type libraries, so only what is used here is declared.
declare const URL: new (url: string) => {
  protocol: string;
  username: string;
  password: string;
  port: string;
  hostname: string;
  pathname: string;
  searchParams: { get(name: string): string | null };
};

export const BLOB_PUBLIC_SUFFIX = '.public.blob.vercel-storage.com';

export const INTRO_VIDEO_REFUSED =
  'Use a YouTube or Vimeo link, or a video file from our own picture store.';

export type IntroVideo =
  | { kind: 'youtube'; id: string }
  | { kind: 'vimeo'; id: string }
  | { kind: 'file'; src: string }
  | { kind: 'refused'; reason: string };

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const YOUTUBE_ID = /^[\w-]{6,20}$/;
const VIDEO_FILE = /\.(mp4|webm|mov)$/i;

const refused: IntroVideo = { kind: 'refused', reason: INTRO_VIDEO_REFUSED };

// ourBlobHost: the public store's host (e.g. "abc123.public.blob.vercel-storage.com"), or null
// when none is set, which refuses every file.
export function parseIntroVideo(url: string, ourBlobHost: string | null): IntroVideo {
  let u: InstanceType<typeof URL>;
  try {
    u = new URL(url);
  } catch {
    return refused;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return refused;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  if (YOUTUBE_HOSTS.has(host)) {
    const id =
      parts[0] === 'watch' && parts.length === 1
        ? u.searchParams.get('v')
        : parts[0] === 'embed' && parts.length === 2
          ? parts[1]
          : null;
    return id && YOUTUBE_ID.test(id) ? { kind: 'youtube', id } : refused;
  }
  if (host === 'youtu.be' || host === 'www.youtube-nocookie.com') {
    const id =
      host === 'youtu.be' ? parts.length === 1 && parts[0] : parts[0] === 'embed' && parts[1];
    return id && YOUTUBE_ID.test(id) ? { kind: 'youtube', id } : refused;
  }
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    return parts.length === 1 && /^\d+$/.test(parts[0]!)
      ? { kind: 'vimeo', id: parts[0]! }
      : refused;
  }
  if (host === 'player.vimeo.com') {
    return parts.length === 2 && parts[0] === 'video' && /^\d+$/.test(parts[1]!)
      ? { kind: 'vimeo', id: parts[1]! }
      : refused;
  }
  if (ourBlobHost && host === ourBlobHost.toLowerCase() && VIDEO_FILE.test(u.pathname)) {
    return { kind: 'file', src: url };
  }
  return refused;
}

// The player address for a parsed link; null for a refused one.
export function introVideoSrc(video: IntroVideo): string | null {
  if (video.kind === 'youtube') return `https://www.youtube-nocookie.com/embed/${video.id}`;
  if (video.kind === 'vimeo') return `https://player.vimeo.com/video/${video.id}`;
  if (video.kind === 'file') return video.src;
  return null;
}

// For the browser, which does not know which store is ours: the link's own host when it is any
// Vercel public store. The server checks the exact store on save, and the web page's
// Content-Security-Policy plays files from our store only.
export function anyPublicStoreHost(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(BLOB_PUBLIC_SUFFIX) ? host : null;
  } catch {
    return null;
  }
}
