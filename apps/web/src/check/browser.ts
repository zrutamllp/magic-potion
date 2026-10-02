// The browser name and version for the connection check, from the user agent. The minimums are
// Vite's default build target ("baseline-widely-available"): older browsers may not run the game.

export interface BrowserInfo {
  name: string;
  // Null when it could not be read.
  version: string | null;
  // True: new enough. False: too old. Null: unknown browser, cannot tell.
  supported: boolean | null;
}

export const MIN_VERSIONS = { chromium: 111, firefox: 114, safari: 16.4 };

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number.parseFloat(v.replace('_', '.'));
  return Number.isFinite(n) ? n : null;
}

function major(v: string | undefined): string | null {
  return v ? (v.split('.')[0] ?? null) : null;
}

export function parseBrowser(ua: string): BrowserInfo {
  // On iPhone and iPad every browser uses Safari's engine, so the iOS version decides.
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+[_.]\d+)/.exec(ua);
  if (ios) {
    const name = /CriOS/.test(ua)
      ? 'Chrome (iPhone/iPad)'
      : /FxiOS/.test(ua)
        ? 'Firefox (iPhone/iPad)'
        : /EdgiOS/.test(ua)
          ? 'Edge (iPhone/iPad)'
          : 'Safari (iPhone/iPad)';
    const version = (ios[1] ?? '').replace('_', '.');
    const n = num(version);
    return {
      name: `${name}, iOS`,
      version,
      supported: n === null ? null : n >= MIN_VERSIONS.safari,
    };
  }

  const firefox = /Firefox\/(\d+(?:\.\d+)?)/.exec(ua);
  if (firefox) {
    const n = num(firefox[1]);
    return {
      name: 'Firefox',
      version: major(firefox[1]),
      supported: n === null ? null : n >= MIN_VERSIONS.firefox,
    };
  }

  const chrome = /(?:Chrome|Chromium)\/(\d+)/.exec(ua);
  if (chrome) {
    // Edge, Opera and Samsung Internet are built on Chrome: Chrome's version decides.
    const brands: [RegExp, string][] = [
      [/Edg\/(\d+)/, 'Edge'],
      [/OPR\/(\d+)/, 'Opera'],
      [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    ];
    const n = num(chrome[1]);
    const supported = n === null ? null : n >= MIN_VERSIONS.chromium;
    for (const [re, name] of brands) {
      const m = re.exec(ua);
      if (m) return { name, version: m[1] ?? null, supported };
    }
    return { name: 'Chrome', version: chrome[1] ?? null, supported };
  }

  const safari = /Version\/(\d+(?:\.\d+)?).*Safari\//.exec(ua);
  if (safari) {
    const n = num(safari[1]);
    return {
      name: 'Safari',
      version: safari[1] ?? null,
      supported: n === null ? null : n >= MIN_VERSIONS.safari,
    };
  }

  return { name: 'Unknown browser', version: null, supported: null };
}
