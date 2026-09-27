import { useSyncExternalStore } from 'react';

// True on phone-width screens (below Tailwind's "sm", 40rem).
const NARROW = '(max-width: 39.99rem)';

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(NARROW);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isNarrow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches;
}

export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribe, isNarrow, () => false);
}
