import { useEffect, useState, type FormEvent } from 'react';
import type { GamePhase, StaffGameSummary, StaffLoginResponse } from '@magic-potion/shared';
import { apiGet, apiPost, ApiError } from '../lib/api';
import { feedText } from '../lib/feed';
import { useStaffLive } from '../lib/live';
import { load, save } from '../lib/session';
import { formatMs, money, msLeft, useTicker } from '../lib/time';
import type { LiveStatus } from '../lib/live';

// Phase 3 test page for staff: pick a game, start and pause it, watch every team live.
// The real admin panel and facilitator dashboard come in Phase 6.

const LOGIN_KEY = 'mp.staff';
const GAME_KEY = 'mp.staff.game';

const PHASE_LABEL: Record<GamePhase, string> = {
  LOBBY: 'Lobby',
  ROUND1: 'Round 1',
  PAUSE: 'Pause',
  ROUND2: 'Round 2',
  REVEAL: 'Reveal',
};

export function StaffDevPage() {
  const [login, setLogin] = useState(() => load<StaffLoginResponse>(LOGIN_KEY));
  const [gameId, setGameId] = useState(() => load<string>(GAME_KEY));
  const [notice, setNotice] = useState<string | null>(null);

  function logOut(message: string | null) {
    save(LOGIN_KEY, null);
    save(GAME_KEY, null);
    setLogin(null);
    setGameId(null);
    setNotice(message);
  }

  function pick(id: string | null) {
    save(GAME_KEY, id);
    setGameId(id);
  }

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
  if (!gameId) return <GamePicker token={login.token} onPick={pick} onLogOut={logOut} />;
  return (
    <GameControl
      key={gameId}
      token={login.token}
      gameId={gameId}
      onBack={() => pick(null)}
      onLogOut={logOut}
    />
  );
}

function StaffLogin({
  notice,
  onLogin,
}: {
  notice: string | null;
  onLogin: (l: StaffLoginResponse) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      onLogin(await apiPost<StaffLoginResponse>('/api/staff/login', { email, password }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-line bg-card p-8"
      >
        <h1 className="text-2xl font-extrabold">Staff test page</h1>
        <p className="mt-1 text-ink-muted">For testing Phase 3 only.</p>
        {notice && <p className="mt-4 rounded-lg bg-alert/20 p-3">{notice}</p>}
        <label className="mt-6 block">
          Email
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-line bg-page p-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="mt-4 block">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-line bg-page p-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="mt-4 text-danger">{error}</p>}
        <button className="mt-6 w-full rounded-lg bg-brand p-3 font-bold hover:bg-brand-soft">
          Log in
        </button>
      </form>
    </main>
  );
}

function GamePicker({
  token,
  onPick,
  onLogOut,
}: {
  token: string;
  onPick: (id: string) => void;
  onLogOut: (message: string | null) => void;
}) {
  const [games, setGames] = useState<StaffGameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<StaffGameSummary[]>('/api/staff/games', token).then(setGames, (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) onLogOut(err.message);
      else setError(err instanceof Error ? err.message : 'Could not load games.');
    });
  }, [token, onLogOut]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Choose a game</h1>
        <button className="rounded-lg border border-line px-3 py-1" onClick={() => onLogOut(null)}>
          Log out
        </button>
      </div>
      {error && <p className="mt-4 text-danger">{error}</p>}
      {!games && !error && <p className="mt-4 text-ink-muted">Loading…</p>}
      <ul className="mt-4 space-y-2">
        {games?.map((g) => (
          <li key={g.id}>
            <button
              className="w-full rounded-xl border border-line bg-card p-4 text-left hover:bg-card-raised"
              onClick={() => onPick(g.id)}
            >
              <span className="text-xl font-bold">{g.name}</span>
              <span className="ml-3 text-ink-muted">{PHASE_LABEL[g.phase]}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function GameControl({
  token,
  gameId,
  onBack,
  onLogOut,
}: {
  token: string;
  gameId: string;
  onBack: () => void;
  onLogOut: (message: string | null) => void;
}) {
  const live = useStaffLive(token, gameId);
  const now = useTicker();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(path: string, done: string, body?: unknown) {
    try {
      await apiPost(path, body, token);
      setMessage({ ok: true, text: done });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'That did not work.' });
    }
  }

  if (live.ended) {
    return (
      <main className="p-8">
        <p className="text-xl">{live.ended}</p>
        <button className="mt-4 rounded-lg bg-brand px-4 py-2" onClick={() => onLogOut(live.ended)}>
          Log in again
        </button>
      </main>
    );
  }
  if (!live.snapshot) {
    return (
      <main className="p-8 text-xl text-ink-muted">
        {live.problem ?? 'Connecting…'}
        {live.problem && (
          <button className="ml-4 rounded-lg border border-line px-3 py-1" onClick={onBack}>
            Back
          </button>
        )}
      </main>
    );
  }

  const { state, receivedAt } = live.snapshot;
  const phaseLeft = msLeft(state.game.phaseMsLeft, receivedAt, !state.game.frozen, now);
  const game = `/api/staff/games/${gameId}`;
  const isAdmin = state.staff.role === 'MAIN_ADMIN';

  return (
    <main className="mx-auto max-w-7xl p-4">
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-card p-4">
        <button className="rounded-lg border border-line px-3 py-1" onClick={onBack}>
          ← Games
        </button>
        <h1 className="text-2xl font-extrabold">{state.game.name}</h1>
        <span className="rounded-lg bg-card-raised px-3 py-1 text-lg font-bold">
          {PHASE_LABEL[state.game.phase]}
          {state.game.frozen ? ' (paused)' : ''}
        </span>
        <span className="font-mono text-3xl font-bold">{formatMs(phaseLeft)}</span>
        <span className="text-lg">Potion: {Math.round(state.potion.percent)}%</span>
        <Connection status={live.status} />
        <span className="ml-auto text-ink-muted">
          {state.staff.name} ({isAdmin ? 'main admin' : 'co-facilitator'})
        </span>
        <button className="rounded-lg border border-line px-3 py-1" onClick={() => onLogOut(null)}>
          Log out
        </button>
      </header>

      {isAdmin && (
        <section className="mt-4 flex flex-wrap gap-2">
          <ControlButton onClick={() => call(`${game}/start`, 'Game started.')}>
            Start
          </ControlButton>
          <ControlButton onClick={() => call(`${game}/freeze`, 'Game paused.')}>
            Pause
          </ControlButton>
          <ControlButton onClick={() => call(`${game}/resume`, 'Game resumed.')}>
            Resume
          </ControlButton>
          <ControlButton
            onClick={() => call(`${game}/extend`, 'Added 60 seconds.', { seconds: 60 })}
          >
            Extend +60s
          </ControlButton>
          <ControlButton
            onClick={() => {
              if (window.confirm('End this phase now and move to the next one?')) {
                void call(`${game}/end-phase`, 'Moved to the next phase.');
              }
            }}
          >
            Next phase
          </ControlButton>
        </section>
      )}

      {message && (
        <p className={`mt-4 rounded-lg p-3 ${message.ok ? 'bg-success/20' : 'bg-danger/20'}`}>
          {message.text}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-card p-4 lg:col-span-2">
          <h2 className="mb-3 text-xl font-bold">Teams</h2>
          <table className="w-full text-left">
            <thead className="text-ink-muted">
              <tr>
                <th>Team</th>
                <th>Code</th>
                <th>Online</th>
                <th>Task Funds</th>
                <th>Support</th>
                <th>Tasks</th>
                <th>Messages left</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.teams.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="py-2 font-bold">
                    {t.name}
                    {t.status === 'REMOVED' ? ' (removed)' : ''}
                  </td>
                  <td>{t.code}</td>
                  <td>
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${t.online ? 'bg-success' : 'bg-line'}`}
                      title={t.online ? 'Online' : 'Offline'}
                    />
                  </td>
                  <td>{money(t.taskFunds)}</td>
                  <td>{money(t.supportFunds)}</td>
                  <td>{t.tasksDone}/5</td>
                  <td>{t.messagesLeft}</td>
                  <td className="space-x-2 whitespace-nowrap text-right">
                    {state.devTools && isAdmin && (
                      <button
                        className="rounded-lg bg-warning/20 px-2 py-1 text-sm"
                        onClick={() =>
                          call(
                            `${game}/dev/finish-tasks/${t.id}`,
                            `${t.name}: all 5 tasks finished.`,
                          )
                        }
                      >
                        Finish all 5 tasks
                      </button>
                    )}
                    <button
                      className="rounded-lg border border-line px-2 py-1 text-sm"
                      onClick={() =>
                        call(`/api/staff/teams/${t.id}/end-session`, `${t.name} was logged out.`)
                      }
                    >
                      End login
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-3 text-xl font-bold">Feed (everything)</h2>
          <ol className="max-h-[32rem] space-y-1 overflow-y-auto">
            {live.feed.length === 0 && <li className="text-ink-muted">Nothing yet.</li>}
            {live.feed.map((item) => (
              <li
                key={`${item.kind}:${item.id}`}
                className={item.kind === 'chat' ? '' : 'text-info'}
              >
                {item.kind === 'chat' && <span className="font-bold">{item.teamName}: </span>}
                {feedText(item, money)}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}

function ControlButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg bg-brand px-4 py-2 text-lg font-bold hover:bg-brand-soft"
    >
      {children}
    </button>
  );
}

function Connection({ status }: { status: LiveStatus }) {
  const look = {
    online: ['bg-success', 'Connected'],
    connecting: ['bg-warning', 'Connecting…'],
    offline: ['bg-danger', 'Reconnecting…'],
  }[status];
  return (
    <span className="flex items-center gap-2 text-base">
      <span className={`inline-block h-3 w-3 rounded-full ${look[0]}`} />
      {look[1]}
    </span>
  );
}
