import { useCallback, useEffect, useState } from 'react';
import { TASK_KEYS, type TaskKey } from '@magic-potion/shared';

// The admin panel's hash routes: "#/games", "#/games/<id>/teams", "#/staff".
// The page is served at /staff, so a refresh keeps the same screen.

export const GAME_TABS = [
  'live',
  'settings',
  'branding',
  'content',
  'inbox',
  'teams',
  'facilitators',
] as const;
export type GameTab = (typeof GAME_TABS)[number];

export type StaffRoute =
  | { page: 'games' }
  | { page: 'game'; gameId: string; tab: GameTab }
  | { page: 'staff' }
  | { page: 'packs' }
  | { page: 'pack'; packId: string; task: TaskKey };

export function parseStaffHash(hash: string): StaffRoute {
  const [first, second, third] = hash.replace(/^#\/?/, '').split('/');
  if (first === 'staff') return { page: 'staff' };
  if (first === 'packs' && second) {
    const task = TASK_KEYS.includes(third as TaskKey) ? (third as TaskKey) : 'vault';
    return { page: 'pack', packId: decodeURIComponent(second), task };
  }
  if (first === 'packs') return { page: 'packs' };
  if (first === 'games' && second) {
    const tab = GAME_TABS.includes(third as GameTab) ? (third as GameTab) : 'settings';
    return { page: 'game', gameId: decodeURIComponent(second), tab };
  }
  return { page: 'games' };
}

export function staffHash(route: StaffRoute): string {
  if (route.page === 'game') return `#/games/${encodeURIComponent(route.gameId)}/${route.tab}`;
  if (route.page === 'pack') return `#/packs/${encodeURIComponent(route.packId)}/${route.task}`;
  return `#/${route.page}`;
}

// ---------- Unsaved changes ----------

export const UNSAVED_MESSAGE = 'You have unsaved changes. Leave without saving?';

// Set by a form with unsaved changes. Every way of leaving the page asks first: the app's own
// links (go), the browser Back and Forward buttons (hashchange), and closing or reloading the
// tab (beforeunload, where the browser shows its own wording).
let unsaved = false;

export function hasUnsavedChanges(): boolean {
  return unsaved;
}

// True when it is fine to leave: nothing unsaved, or the person agreed to lose it.
export function confirmLeave(): boolean {
  if (!unsaved || window.confirm(UNSAVED_MESSAGE)) {
    unsaved = false;
    return true;
  }
  return false;
}

export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    unsaved = dirty;
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need a return value to show the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      unsaved = false;
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);
}

export function useStaffRoute(): [StaffRoute, (route: StaffRoute) => void] {
  const [route, setRoute] = useState(() => parseStaffHash(window.location.hash));
  useEffect(() => {
    let current = window.location.hash;
    const onChange = () => {
      if (window.location.hash === current) return;
      // Back or Forward with unsaved changes: stay unless the person agrees to leave.
      if (!confirmLeave()) {
        window.history.pushState(null, '', current);
        return;
      }
      current = window.location.hash;
      setRoute(parseStaffHash(current));
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const go = useCallback((next: StaffRoute) => {
    if (!confirmLeave()) return;
    window.location.hash = staffHash(next);
    window.scrollTo(0, 0);
  }, []);
  return [route, go];
}
