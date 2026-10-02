import { afterEach, describe, expect, it } from 'vitest';
import { liveTransports, pollingOnly, readTransportSwitch } from './transport';

function openAt(path: string) {
  window.history.replaceState(null, '', path);
  readTransportSwitch();
}

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('the hidden ?transport=polling switch', () => {
  it('is off by default: polling first, then WebSocket', () => {
    openAt('/');
    expect(pollingOnly()).toBe(false);
    expect(liveTransports()).toEqual(['polling', 'websocket']);
  });

  it('forces long-polling for this tab and keeps it after a refresh', () => {
    openAt('/?transport=polling#home');
    expect(liveTransports()).toEqual(['polling']);
    // The parameter is removed from the address bar, the rest is kept.
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#home');
    openAt('/');
    expect(liveTransports()).toEqual(['polling']);
  });

  it('is switched off with ?transport=auto', () => {
    openAt('/?transport=polling');
    openAt('/?transport=auto');
    expect(pollingOnly()).toBe(false);
  });

  it('ignores any other value', () => {
    openAt('/?transport=websocket');
    expect(liveTransports()).toEqual(['polling', 'websocket']);
  });

  it('belongs to this tab only (sessionStorage), so other tabs and players are not affected', () => {
    openAt('/?transport=polling');
    expect(window.sessionStorage.getItem('mp.transport')).toBe('"polling"');
    expect(window.localStorage.getItem('mp.transport')).toBeNull();
  });
});
