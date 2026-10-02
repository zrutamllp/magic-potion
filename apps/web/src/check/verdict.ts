import type { BrowserInfo } from './browser';

// What the connection check found, and what it means in plain English. Pure: the page and the
// "Copy results" text both come from here.

export interface Timed {
  ok: boolean;
  ms?: number;
}

export type Pictures = 'ok' | 'failed' | 'not_set_up';

// Each field is null while that check has not finished.
export interface CheckResults {
  server: Timed | null;
  polling: Timed | null;
  websocket: Timed | null;
  // The median round trip in ms, or 'failed' when no live connection worked.
  speed: number | 'failed' | null;
  pictures: Pictures | null;
  fonts: boolean | null;
  youtube: boolean | null;
  vimeo: boolean | null;
  browser: BrowserInfo;
}

export function emptyResults(browser: BrowserInfo): CheckResults {
  return {
    server: null,
    polling: null,
    websocket: null,
    speed: null,
    pictures: null,
    fonts: null,
    youtube: null,
    vimeo: null,
    browser,
  };
}

export interface Hosts {
  site: string;
  api: string;
  // The public picture store, once known.
  pictures: string | null;
}

export type Status = 'pass' | 'warn' | 'fail' | 'info' | 'running';
export type Overall = 'ready' | 'limited' | 'blocked' | 'checking';

export const OVERALL_TEXT: Record<Overall, string> = {
  ready: 'Ready to play',
  limited: 'Will work, with limits',
  blocked: 'Blocked',
  checking: 'Checking…',
};

// Median round trip bands.
export const SPEED_GOOD_MS = 150;
export const SPEED_OK_MS = 400;

export type SpeedRating = 'Good' | 'OK' | 'Slow';

export function speedRating(medianMs: number): SpeedRating {
  if (medianMs < SPEED_GOOD_MS) return 'Good';
  if (medianMs < SPEED_OK_MS) return 'OK';
  return 'Slow';
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return Number.NaN;
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export interface Row {
  key: string;
  label: string;
  status: Status;
  text: string;
}

const ms = (t: Timed) => (t.ms === undefined ? '' : ` (${Math.round(t.ms)} ms)`);

export function rows(r: CheckResults, hosts: Hosts): Row[] {
  const out: Row[] = [
    { key: 'website', label: 'Website', status: 'pass', text: 'The website loads.' },
  ];

  out.push({
    key: 'server',
    label: 'Game server',
    ...(r.server === null
      ? { status: 'running', text: 'Checking…' }
      : r.server.ok
        ? { status: 'pass', text: `Reachable over HTTPS${ms(r.server)}.` }
        : { status: 'fail', text: `Not reachable. Ask IT to allow https://${hosts.api}.` }),
  });

  out.push({
    key: 'polling',
    label: 'Live connection (basic)',
    ...(r.polling === null
      ? { status: 'running', text: 'Checking…' }
      : r.polling.ok
        ? { status: 'pass', text: `Works${ms(r.polling)}.` }
        : { status: 'fail', text: 'Does not work.' }),
  });

  out.push({
    key: 'websocket',
    label: 'Live connection (WebSocket)',
    ...(r.websocket === null
      ? { status: 'running', text: 'Checking…' }
      : r.websocket.ok
        ? { status: 'pass', text: `Works${ms(r.websocket)}. This is the best connection.` }
        : r.polling?.ok
          ? {
              status: 'warn',
              text: `Blocked. The game still works, slightly slower. Ask IT to allow WebSocket to ${hosts.api}.`,
            }
          : { status: 'fail', text: 'Blocked.' }),
  });

  out.push({
    key: 'speed',
    label: 'Speed',
    ...(r.speed === null
      ? { status: 'running', text: 'Checking…' }
      : r.speed === 'failed'
        ? { status: 'fail', text: 'Could not be measured: no live connection.' }
        : (() => {
            const rating = speedRating(r.speed);
            return {
              status: rating === 'Slow' ? 'warn' : 'pass',
              text: `${rating} (${Math.round(r.speed)} ms round trip).${rating === 'Slow' ? ' The game will feel slow.' : ''}`,
            } as const;
          })()),
  });

  out.push({
    key: 'pictures',
    label: 'Pictures',
    ...(r.pictures === null
      ? { status: 'running', text: 'Checking…' }
      : r.pictures === 'ok'
        ? { status: 'pass', text: 'Pictures load.' }
        : r.pictures === 'not_set_up'
          ? { status: 'warn', text: 'Could not be tested (the test picture is not set up).' }
          : {
              status: 'warn',
              text: `Pictures do not load, so some tasks will not show.${hosts.pictures ? ` Ask IT to allow https://${hosts.pictures}.` : ''}`,
            }),
  });

  out.push({
    key: 'fonts',
    label: 'Fonts',
    ...(r.fonts === null
      ? { status: 'running', text: 'Checking…' }
      : r.fonts
        ? { status: 'pass', text: 'Fonts load.' }
        : {
            status: 'info',
            text: 'Google Fonts is blocked. The game uses a standard font instead.',
          }),
  });

  out.push(videoRow('youtube', 'YouTube', r.youtube));
  out.push(videoRow('vimeo', 'Vimeo', r.vimeo));

  const b = r.browser;
  const name = b.version ? `${b.name} ${b.version}` : b.name;
  out.push({
    key: 'browser',
    label: 'Browser',
    ...(b.supported === true
      ? { status: 'pass', text: name }
      : b.supported === false
        ? { status: 'warn', text: `${name} is too old. Please update it or use another browser.` }
        : { status: 'info', text: `${name}. We could not check its version.` }),
  });
  return out;
}

function videoRow(key: string, label: string, ok: boolean | null): Row {
  if (ok === null) return { key, label, status: 'running', text: 'Checking…' };
  return ok
    ? { key, label, status: 'pass', text: `${label} is reachable.` }
    : {
        key,
        label,
        status: 'info',
        text: `${label} is blocked. Only matters if the event's intro video is on ${label}.`,
      };
}

export function overall(r: CheckResults): Overall {
  if (r.server && !r.server.ok) return 'blocked';
  if (r.polling && r.websocket && !r.polling.ok && !r.websocket.ok) return 'blocked';
  if (
    r.server === null ||
    r.polling === null ||
    r.websocket === null ||
    r.speed === null ||
    r.pictures === null
  ) {
    return 'checking';
  }
  const slow = r.speed === 'failed' || speedRating(r.speed) === 'Slow';
  if (!r.websocket.ok || slow || r.pictures !== 'ok' || r.browser.supported === false) {
    return 'limited';
  }
  return 'ready';
}

// The addresses IT should allow, only for what failed.
export function addressesToAllow(r: CheckResults, hosts: Hosts): string[] {
  const list: string[] = [];
  const add = (a: string) => {
    if (!list.includes(a)) list.push(a);
  };
  if (r.server?.ok === false || r.polling?.ok === false) add(`https://${hosts.api} (port 443)`);
  if (r.websocket?.ok === false) add(`wss://${hosts.api} (WebSocket, port 443)`);
  if (r.pictures === 'failed' && hosts.pictures) add(`https://${hosts.pictures}`);
  if (r.fonts === false) {
    add('https://fonts.googleapis.com');
    add('https://fonts.gstatic.com');
  }
  if (r.youtube === false) {
    add('https://www.youtube-nocookie.com (intro video, optional)');
    add('https://*.googlevideo.com and https://i.ytimg.com (intro video, optional)');
  }
  if (r.vimeo === false) {
    add('https://player.vimeo.com and https://*.vimeocdn.com (intro video, optional)');
  }
  return list;
}

const MARK: Record<Status, string> = {
  pass: '✅',
  warn: '⚠️',
  fail: '❌',
  info: 'ℹ️',
  running: '…',
};

export function formatWhen(now: Date, timeZone?: string): string {
  return now.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  });
}

// The text for "Copy results". Nothing personal: no address, name or game.
export function summaryText(r: CheckResults, hosts: Hosts, now: Date, timeZone?: string): string {
  const lines = [
    'Magic Potion Challenge – Connection check',
    `Date: ${formatWhen(now, timeZone)}`,
    `Result: ${OVERALL_TEXT[overall(r)]}`,
    `Website: ${hosts.site}`,
    '',
    ...rows(r, hosts).map((row) => `${MARK[row.status]} ${row.label}: ${row.text}`),
  ];
  const allow = addressesToAllow(r, hosts);
  if (allow.length > 0) lines.push('', 'Addresses to allow:', ...allow.map((a) => `- ${a}`));
  return lines.join('\n');
}
