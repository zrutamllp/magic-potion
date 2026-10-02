import { load, save } from './session';

// A hidden switch for our own network tests: open the player screen with ?transport=polling and
// that browser tab uses long-polling only (no WebSocket) for the whole game, even after a
// refresh. ?transport=auto switches it off; closing the tab forgets it. Normal players never
// see the parameter, so they always get the usual polling-then-WebSocket connection.

const KEY = 'mp.transport';
export type Transports = ('polling' | 'websocket')[];

// Reads the parameter once (on load) and removes it from the address bar.
export function readTransportSwitch(): void {
  const url = new URL(window.location.href);
  const value = url.searchParams.get('transport');
  if (value === null) return;
  if (value === 'polling') save(KEY, 'polling');
  else if (value === 'auto') save(KEY, null);
  url.searchParams.delete('transport');
  window.history.replaceState(window.history.state, '', url.toString());
}

export function pollingOnly(): boolean {
  return load<string>(KEY) === 'polling';
}

export function liveTransports(): Transports {
  return pollingOnly() ? ['polling'] : ['polling', 'websocket'];
}
