import { describe, expect, it } from 'vitest';
import { parseBrowser, type BrowserInfo } from './browser';
import {
  addressesToAllow,
  emptyResults,
  median,
  overall,
  rows,
  speedRating,
  summaryText,
  type CheckResults,
  type Hosts,
} from './verdict';

const CHROME_NEW: BrowserInfo = { name: 'Chrome', version: '140', supported: true };
const HOSTS: Hosts = {
  site: 'play.example.com',
  api: 'api.example.com',
  pictures: 'abc.public.blob.vercel-storage.com',
};

function allGood(over: Partial<CheckResults> = {}): CheckResults {
  return {
    ...emptyResults(CHROME_NEW),
    server: { ok: true, ms: 80 },
    polling: { ok: true, ms: 120 },
    websocket: { ok: true, ms: 90 },
    speed: 70,
    pictures: 'ok',
    fonts: true,
    youtube: true,
    vimeo: true,
    ...over,
  };
}

describe('overall result', () => {
  it('is Ready to play when everything works', () => {
    expect(overall(allGood())).toBe('ready');
  });

  it('is Checking until the checks that count have finished', () => {
    expect(overall(emptyResults(CHROME_NEW))).toBe('checking');
    expect(overall(allGood({ pictures: null }))).toBe('checking');
  });

  it('is Blocked when the game server cannot be reached, even before the rest finishes', () => {
    expect(overall({ ...emptyResults(CHROME_NEW), server: { ok: false } })).toBe('blocked');
  });

  it('is Blocked when neither live connection works', () => {
    expect(
      overall(allGood({ polling: { ok: false }, websocket: { ok: false }, speed: 'failed' })),
    ).toBe('blocked');
  });

  it('is With limits when only long-polling works', () => {
    expect(overall(allGood({ websocket: { ok: false } }))).toBe('limited');
  });

  it('is With limits when the speed is slow, pictures fail or the browser is too old', () => {
    expect(overall(allGood({ speed: 500 }))).toBe('limited');
    expect(overall(allGood({ pictures: 'failed' }))).toBe('limited');
    expect(overall(allGood({ pictures: 'not_set_up' }))).toBe('limited');
    expect(
      overall(allGood({ browser: { name: 'Chrome', version: '100', supported: false } })),
    ).toBe('limited');
  });

  it('is not changed by fonts, YouTube, Vimeo or an unknown browser (information only)', () => {
    const r = allGood({
      fonts: false,
      youtube: false,
      vimeo: false,
      browser: { name: 'Unknown browser', version: null, supported: null },
    });
    expect(overall(r)).toBe('ready');
  });
});

describe('speed', () => {
  it('rates the median round trip', () => {
    expect(speedRating(149)).toBe('Good');
    expect(speedRating(150)).toBe('OK');
    expect(speedRating(399)).toBe('OK');
    expect(speedRating(400)).toBe('Slow');
  });

  it('takes the median, so one slow ping does not spoil it', () => {
    expect(median([50, 60, 2000, 55, 58])).toBe(58);
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe('rows', () => {
  const status = (r: CheckResults) =>
    Object.fromEntries(rows(r, HOSTS).map((row) => [row.key, row.status]));

  it('shows green for everything when it all works, with the times taken', () => {
    const list = rows(allGood(), HOSTS);
    expect(list.every((row) => row.status === 'pass')).toBe(true);
    expect(list.find((r) => r.key === 'server')?.text).toContain('80 ms');
    expect(list.find((r) => r.key === 'speed')?.text).toMatch(/^Good \(70 ms/);
  });

  it('polling only: WebSocket is amber and tells IT what to allow', () => {
    const ws = rows(allGood({ websocket: { ok: false } }), HOSTS).find(
      (r) => r.key === 'websocket',
    );
    expect(ws?.status).toBe('warn');
    expect(ws?.text).toContain('allow WebSocket to api.example.com');
  });

  it('neither connection: both red', () => {
    const s = status(
      allGood({ polling: { ok: false }, websocket: { ok: false }, speed: 'failed' }),
    );
    expect([s.polling, s.websocket, s.speed]).toEqual(['fail', 'fail', 'fail']);
  });

  it('fonts and video sites blocked are information, not problems', () => {
    const s = status(allGood({ fonts: false, youtube: false, vimeo: false }));
    expect([s.fonts, s.youtube, s.vimeo]).toEqual(['info', 'info', 'info']);
  });

  it('warns about a browser that is too old', () => {
    const old = allGood({ browser: { name: 'Firefox', version: '100', supported: false } });
    expect(rows(old, HOSTS).find((r) => r.key === 'browser')).toMatchObject({
      status: 'warn',
      text: 'Firefox 100 is too old. Please update it or use another browser.',
    });
  });
});

describe('addresses to allow', () => {
  it('lists nothing when everything works', () => {
    expect(addressesToAllow(allGood(), HOSTS)).toEqual([]);
  });

  it('lists only what failed', () => {
    expect(addressesToAllow(allGood({ websocket: { ok: false } }), HOSTS)).toEqual([
      'wss://api.example.com (WebSocket, port 443)',
    ]);
    expect(addressesToAllow(allGood({ pictures: 'failed', fonts: false }), HOSTS)).toEqual([
      'https://abc.public.blob.vercel-storage.com',
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
    ]);
    expect(addressesToAllow(allGood({ server: { ok: false } }), HOSTS)).toEqual([
      'https://api.example.com (port 443)',
    ]);
  });
});

describe('Copy results text', () => {
  const now = new Date(Date.UTC(2026, 9, 2, 9, 30));

  it('has the title, date and time, result, each check and the addresses', () => {
    const text = summaryText(allGood({ websocket: { ok: false } }), HOSTS, now, 'Asia/Kolkata');
    expect(text).toContain('Magic Potion Challenge – Connection check');
    expect(text).toMatch(/Date: 2 Oct 2026, 15:00 GMT\+5:30/);
    expect(text).toContain('Result: Will work, with limits');
    expect(text).toContain('⚠️ Live connection (WebSocket): Blocked.');
    expect(text).toContain('✅ Speed: Good (70 ms round trip).');
    expect(text).toContain('Addresses to allow:\n- wss://api.example.com (WebSocket, port 443)');
  });

  it('holds nothing personal: no client address, login, team or game', () => {
    const text = summaryText(allGood(), HOSTS, now, 'UTC');
    expect(text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(text).not.toMatch(/team|game code|password|@/i);
  });
});

describe('browser', () => {
  const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
  const webkit = 'AppleWebKit/537.36 (KHTML, like Gecko)';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  const ua = {
    chrome: `${win} ${webkit} Chrome/140.0.0.0 Safari/537.36`,
    oldChrome: `${win} ${webkit} Chrome/109.0.0.0 Safari/537.36`,
    edge: `${win} ${webkit} Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0`,
    firefox: `${win}; rv:128.0) Gecko/20100101 Firefox/128.0`,
    oldFirefox: `${win}; rv:102.0) Gecko/20100101 Firefox/102.0`,
    safari: `${mac} (KHTML, like Gecko) Version/17.5 Safari/605.1.15`,
    oldSafari: `${mac} (KHTML, like Gecko) Version/15.6 Safari/605.1.15`,
    iphone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    oldIphoneChrome:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
    samsung:
      'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  };

  it.each([
    ['chrome', 'Chrome', '140', true],
    ['oldChrome', 'Chrome', '109', false],
    ['edge', 'Edge', '140', true],
    ['firefox', 'Firefox', '128', true],
    ['oldFirefox', 'Firefox', '102', false],
    ['safari', 'Safari', '17.5', true],
    ['oldSafari', 'Safari', '15.6', false],
    ['iphone', 'Safari (iPhone/iPad), iOS', '17.5', true],
    ['oldIphoneChrome', 'Chrome (iPhone/iPad), iOS', '15.7', false],
    ['samsung', 'Samsung Internet', '25', true],
  ] as const)('reads %s', (key, name, version, supported) => {
    expect(parseBrowser(ua[key])).toEqual({ name, version, supported });
  });

  it('cannot tell for an unknown browser', () => {
    expect(parseBrowser('curl/8.0')).toEqual({
      name: 'Unknown browser',
      version: null,
      supported: null,
    });
  });
});
