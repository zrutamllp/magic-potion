import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { Gamepad2, LogOut, Users, type LucideIcon } from 'lucide-react';
import type { StaffLoginResponse } from '@magic-potion/shared';
import { ApiError, apiPost } from '../lib/api';
import { load, save } from '../lib/session';
import { Button, fieldClass } from '../player/ui/basics';
import { PotionBottle } from '../player/ui/PotionBottle';
import { GamePage } from './pages/GamePage';
import { GamesPage } from './pages/GamesPage';
import { StaffPage } from './pages/StaffPage';
import { useStaffRoute, type StaffRoute } from './router';
import { StaffProvider, useStaffApi, type FreshLogins } from './StaffContext';

// The staff side: login, then the admin panel (Phase 6A: games, settings, teams, staff).
// Co-facilitators see their games; the live dashboard for them comes in 6C.

const LOGIN_KEY = 'mp.staffLogin';

export function StaffApp() {
  const [login, setLogin] = useState(() => load<StaffLoginResponse>(LOGIN_KEY));
  const [notice, setNotice] = useState<string | null>(null);

  const logOut = useCallback((message: string | null) => {
    save(LOGIN_KEY, null);
    setLogin(null);
    setNotice(message);
  }, []);

  if (!login) {
    return (
      <StaffLogin
        notice={notice}
        onLogin={(l) => {
          save(LOGIN_KEY, l);
          setNotice(null);
          setLogin(l);
        }}
      />
    );
  }
  return <Panel key={login.token} login={login} onLogOut={logOut} />;
}

function Panel({
  login,
  onLogOut,
}: {
  login: StaffLoginResponse;
  onLogOut: (message: string | null) => void;
}) {
  const [route, go] = useStaffRoute();
  const [freshLogins, setFreshLogins] = useState<FreshLogins | null>(null);
  const loggedOut = useCallback((message: string) => onLogOut(message), [onLogOut]);
  const api = useStaffApi(login.token, loggedOut);

  return (
    <StaffProvider value={{ login, api, go, freshLogins, setFreshLogins }}>
      <div className="min-h-screen">
        <Sidebar route={route} go={go} login={login} onLogOut={() => onLogOut(null)} />
        <main className="ml-60 p-6">
          {route.page === 'games' && <GamesPage />}
          {route.page === 'game' && (
            <GamePage key={route.gameId} gameId={route.gameId} tab={route.tab} />
          )}
          {route.page === 'staff' && <StaffPage />}
        </main>
      </div>
    </StaffProvider>
  );
}

function Sidebar({
  route,
  go,
  login,
  onLogOut,
}: {
  route: StaffRoute;
  go: (r: StaffRoute) => void;
  login: StaffLoginResponse;
  onLogOut: () => void;
}) {
  const isAdmin = login.staff.role === 'MAIN_ADMIN';
  return (
    <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-line bg-sidebar">
      <div className="flex items-center gap-3 border-b border-line p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent">
          <PotionBottle percent={70} size="sm" className="w-6" />
        </span>
        <span className="text-base leading-tight font-extrabold">
          Magic Potion
          <span className="block text-sm font-semibold text-ink-muted">Staff</span>
        </span>
      </div>
      <nav className="flex flex-col gap-1 p-3" aria-label="Staff menu">
        <NavLink
          icon={Gamepad2}
          active={route.page !== 'staff'}
          onClick={() => go({ page: 'games' })}
        >
          Games
        </NavLink>
        {isAdmin && (
          <NavLink
            icon={Users}
            active={route.page === 'staff'}
            onClick={() => go({ page: 'staff' })}
          >
            Staff
          </NavLink>
        )}
      </nav>
      <div className="mt-auto border-t border-line p-4">
        <p className="font-semibold">{login.staff.name}</p>
        <p className="text-sm text-ink-muted">{isAdmin ? 'Main admin' : 'Co-facilitator'}</p>
        <button
          type="button"
          onClick={onLogOut}
          className="mt-3 inline-flex items-center gap-2 text-base text-ink-muted hover:text-ink"
        >
          <LogOut className="h-4 w-4" aria-hidden /> Log out
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  icon: Icon,
  active,
  onClick,
  children,
}: {
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left text-base font-semibold transition ${
        active ? 'bg-brand/25 text-ink' : 'text-ink-muted hover:bg-card-raised hover:text-ink'
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden />
      {children}
    </button>
  );
}

export function StaffLogin({
  notice,
  onLogin,
}: {
  notice: string | null;
  onLogin: (l: StaffLoginResponse) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await apiPost<StaffLoginResponse>('/api/staff/login', { email, password }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-3xl border border-line bg-card p-8 shadow-2xl"
      >
        <div className="flex items-center gap-4">
          <PotionBottle percent={60} size="sm" />
          <div>
            <h1 className="text-3xl font-extrabold">Magic Potion Challenge</h1>
            <p className="text-lg text-ink-muted">Staff login</p>
          </div>
        </div>
        {notice && (
          <p role="status" className="mt-6 rounded-xl bg-alert/20 p-4 text-lg">
            {notice}
          </p>
        )}
        <label className="mt-6 block text-lg font-semibold">
          Email
          <input
            type="email"
            className={`${fieldClass} mt-2`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="mt-4 block text-lg font-semibold">
          Password
          <input
            type="password"
            className={`${fieldClass} mt-2`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p role="alert" className="mt-4 text-lg text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="mt-6 w-full py-3 text-xl">
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </main>
  );
}
