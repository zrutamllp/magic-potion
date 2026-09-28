import { useCallback, useEffect, useState } from 'react';

// The admin panel's hash routes: "#/games", "#/games/<id>/teams", "#/staff".
// The page is served at /staff, so a refresh keeps the same screen.

export const GAME_TABS = ['settings', 'branding', 'teams', 'facilitators'] as const;
export type GameTab = (typeof GAME_TABS)[number];

export type StaffRoute =
  { page: 'games' } | { page: 'game'; gameId: string; tab: GameTab } | { page: 'staff' };

export function parseStaffHash(hash: string): StaffRoute {
  const [first, second, third] = hash.replace(/^#\/?/, '').split('/');
  if (first === 'staff') return { page: 'staff' };
  if (first === 'games' && second) {
    const tab = GAME_TABS.includes(third as GameTab) ? (third as GameTab) : 'settings';
    return { page: 'game', gameId: decodeURIComponent(second), tab };
  }
  return { page: 'games' };
}

export function staffHash(route: StaffRoute): string {
  if (route.page === 'game') return `#/games/${encodeURIComponent(route.gameId)}/${route.tab}`;
  return `#/${route.page}`;
}

export function useStaffRoute(): [StaffRoute, (route: StaffRoute) => void] {
  const [route, setRoute] = useState(() => parseStaffHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseStaffHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const go = useCallback((next: StaffRoute) => {
    window.location.hash = staffHash(next);
    window.scrollTo(0, 0);
  }, []);
  return [route, go];
}
