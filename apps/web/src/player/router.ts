import { useCallback, useEffect, useState } from 'react';

// A tiny hash router: "#/chat", "#/task/abc". The tab survives a refresh and needs no server
// setup. A router library can replace it if the app grows.

export type Tab = 'home' | 'chat' | 'funds' | 'inbox' | 'leaderboard' | 'rules';
export type Route = { tab: Tab } | { tab: 'task'; taskId: string };

const TABS: readonly Tab[] = ['home', 'chat', 'funds', 'inbox', 'leaderboard', 'rules'];

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  const [first, second] = parts;
  if (first === 'task' && second) return { tab: 'task', taskId: decodeURIComponent(second) };
  if (TABS.includes(first as Tab)) return { tab: first as Tab };
  return { tab: 'home' };
}

export function routeHash(route: Route): string {
  return route.tab === 'task' ? `#/task/${encodeURIComponent(route.taskId)}` : `#/${route.tab}`;
}

export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const go = useCallback((next: Route) => {
    window.location.hash = routeHash(next);
    window.scrollTo(0, 0);
  }, []);
  return [route, go];
}
