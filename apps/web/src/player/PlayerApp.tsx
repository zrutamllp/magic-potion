import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import type { Ack, GameSettings, TeamLoginResponse } from '@magic-potion/shared';
import { apiPost, ApiError } from '../lib/api';
import { useTeamLive, type Live } from '../lib/live';
import { load, save } from '../lib/session';
import { msLeft, useTicker } from '../lib/time';
import type { PlayerState } from '@magic-potion/shared';
import { GameContext, type Game, type Notice } from './GameContext';
import { routeHash, useHashRoute, type Route } from './router';
import { Shell } from './layout/Shell';
import { Button, fieldClass } from './ui/basics';
import { PotionBottle } from './ui/PotionBottle';
import { Chat } from './screens/Chat';
import { Funds } from './screens/Funds';
import { Home } from './screens/Home';
import { Inbox } from './screens/Inbox';
import { Leaderboard } from './screens/Leaderboard';
import { Lobby } from './screens/Lobby';
import { PauseScreen } from './screens/PauseScreen';
import { Reveal } from './screens/Reveal';
import { Rules } from './screens/Rules';
import { TaskScreen } from './tasks/TaskShell';

// The player app: login, then the screen for the current phase.

const SESSION_KEY = 'mp.team';

export function PlayerApp() {
  const [login, setLogin] = useState(() => load<TeamLoginResponse>(SESSION_KEY));
  const [notice, setNotice] = useState<string | null>(null);

  function logOut(message: string | null) {
    save(SESSION_KEY, null);
    setLogin(null);
    setNotice(message);
  }

  if (!login) {
    return (
      <Login
        notice={notice}
        onLogin={(l) => {
          save(SESSION_KEY, l);
          setNotice(null);
          setLogin(l);
        }}
      />
    );
  }
  return <Connection key={login.token} token={login.token} onLogOut={logOut} />;
}

// Brand colours from the game settings, as CSS variables for everything inside.
export function Branded({
  branding,
  children,
}: {
  branding?: GameSettings['branding'];
  children: ReactNode;
}) {
  const style = branding
    ? ({
        '--color-brand': branding.primaryColor,
        '--color-brand-soft': `color-mix(in srgb, ${branding.primaryColor} 78%, white)`,
        '--color-accent': branding.accentColor,
      } as CSSProperties)
    : undefined;
  return (
    <div style={style} className="min-h-screen">
      {children}
    </div>
  );
}

export function Login({
  notice,
  onLogin,
}: {
  notice: string | null;
  onLogin: (l: TeamLoginResponse) => void;
}) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await apiPost<TeamLoginResponse>('/api/team/login', { code, password }));
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
            <p className="text-lg text-ink-muted">Team login</p>
          </div>
        </div>
        {notice && (
          <p role="status" className="mt-6 rounded-xl bg-alert/20 p-4 text-lg">
            {notice}
          </p>
        )}
        <label className="mt-6 block text-lg font-semibold">
          Team code
          <input
            className={`${fieldClass} mt-2 text-xl uppercase`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="mt-4 block text-lg font-semibold">
          Password
          <input
            type="password"
            className={`${fieldClass} mt-2 text-xl`}
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

function Connection({
  token,
  onLogOut,
}: {
  token: string;
  onLogOut: (message: string | null) => void;
}) {
  const live = useTeamLive(token);

  if (live.ended) {
    return (
      <CenteredMessage>
        <p className="text-3xl font-bold">{live.ended}</p>
        <Button className="mt-8 px-8 py-3 text-xl" onClick={() => onLogOut(live.ended)}>
          Back to login
        </Button>
      </CenteredMessage>
    );
  }
  if (!live.snapshot) {
    return (
      <CenteredMessage>
        <PotionBottle percent={30} size="md" className="mx-auto" />
        <p className="mt-6 text-2xl text-ink-muted">{live.problem ?? 'Connecting to the game…'}</p>
        {live.problem && (
          <Button variant="outline" tone="muted" className="mt-6" onClick={() => onLogOut(null)}>
            Back to login
          </Button>
        )}
      </CenteredMessage>
    );
  }
  return <Screens live={live} snapshot={live.snapshot} onLogOut={onLogOut} />;
}

export function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-xl rounded-3xl border border-line bg-card p-10 text-center">
        {children}
      </div>
    </main>
  );
}

function Screens({
  live,
  snapshot,
  onLogOut,
}: {
  live: Live<PlayerState>;
  snapshot: { state: PlayerState; receivedAt: number };
  onLogOut: (message: string | null) => void;
}) {
  const now = useTicker();
  const [route, go] = useHashRoute();
  const [notice, setNotice] = useState<Notice | null>(null);
  const { state, receivedAt } = snapshot;

  async function act(done: string | null, run: () => Promise<Ack>) {
    // Never fail silently: a click must always show an answer.
    const ack: Ack = await run().catch(() => ({
      ok: false as const,
      message: 'Something went wrong. Please try again.',
    }));
    if (ack.ok && done === null) {
      setNotice(null);
      return true;
    }
    setNotice({
      ok: ack.ok,
      text: ack.ok ? (done ?? '') : ack.message,
      id: Date.now(),
      where: routeHash(route),
    });
    return ack.ok;
  }

  const game: Game = {
    state,
    feed: live.feed,
    status: live.status,
    send: live.send,
    phaseMsLeft: () => msLeft(state.game.phaseMsLeft, receivedAt, !state.game.frozen, now),
    timerMsLeft: (sent) => msLeft(sent, receivedAt, state.game.timersRunning, now) ?? 0,
    act,
    // Only on the screen where the action happened, even after Back or a typed address.
    notice: notice && notice.where === routeHash(route) ? notice : null,
    dismissNotice: () => setNotice(null),
    route,
    go: (next: Route) => {
      setNotice(null);
      go(next);
    },
  };

  return (
    <GameContext.Provider value={game}>
      <Branded branding={state.branding}>
        <PhaseScreen onLogOut={onLogOut} />
      </Branded>
    </GameContext.Provider>
  );
}

// The screen for the current phase. Also used by staff "View as team" (no Log out there).
export function PhaseScreen({ onLogOut }: { onLogOut?: (message: string | null) => void }) {
  return (
    <GameContext.Consumer>
      {(game) => {
        if (!game) return null;
        switch (game.state.game.phase) {
          case 'LOBBY':
            return <Lobby onLogOut={onLogOut} />;
          case 'PAUSE':
            return <PauseScreen />;
          case 'REVEAL':
            return <Reveal />;
          default:
            return (
              <Shell onLogOut={onLogOut}>
                <TabScreen route={game.route} />
              </Shell>
            );
        }
      }}
    </GameContext.Consumer>
  );
}

function TabScreen({ route }: { route: Route }) {
  switch (route.tab) {
    case 'task':
      return <TaskScreen taskId={route.taskId} />;
    case 'chat':
      return <Chat />;
    case 'funds':
      return <Funds />;
    case 'inbox':
      return <Inbox />;
    case 'leaderboard':
      return <Leaderboard />;
    case 'rules':
      return <Rules />;
    case 'home':
      return <Home />;
  }
}
