import { useState, type FormEvent, type ReactNode } from 'react';
import type {
  Ack,
  FeedItem,
  GamePhase,
  PlayerState,
  TeamLoginResponse,
} from '@magic-potion/shared';
import { ServerStatus } from '../components/ServerStatus';
import { apiPost, ApiError } from '../lib/api';
import { feedText } from '../lib/feed';
import { useTeamLive, type LiveStatus } from '../lib/live';
import { load, save } from '../lib/session';
import { formatMs, money, msLeft, useTicker } from '../lib/time';

// Phase 3 test screen for one team: live phase and timer, funds, potion, chat, transfers and
// requests. Plain on purpose; Phase 4 replaces it with the real player screens.

const SESSION_KEY = 'mp.team';

const PHASE_LABEL: Record<GamePhase, string> = {
  LOBBY: 'Lobby: waiting for the game to start',
  ROUND1: 'Round 1',
  PAUSE: 'Pause',
  ROUND2: 'Round 2',
  REVEAL: 'Reveal',
};

export function TeamPage() {
  const [login, setLogin] = useState(() => load<TeamLoginResponse>(SESSION_KEY));
  const [notice, setNotice] = useState<string | null>(null);

  function logOut(message: string | null) {
    save(SESSION_KEY, null);
    setLogin(null);
    setNotice(message);
  }

  if (!login) {
    return (
      <TeamLogin
        notice={notice}
        onLogin={(l) => {
          save(SESSION_KEY, l);
          setNotice(null);
          setLogin(l);
        }}
      />
    );
  }
  return <TeamScreen key={login.token} login={login} onLogOut={logOut} />;
}

function TeamLogin({
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
        className="w-full max-w-md rounded-2xl border border-line bg-card p-8"
      >
        <h1 className="text-3xl font-extrabold">Magic Potion Challenge</h1>
        <p className="mt-1 text-ink-muted">Team login</p>
        {notice && <p className="mt-4 rounded-lg bg-alert/20 p-3 text-lg">{notice}</p>}
        <label className="mt-6 block text-lg">
          Team code
          <input
            className="mt-1 w-full rounded-lg border border-line bg-page p-3 text-xl uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="mt-4 block text-lg">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-line bg-page p-3 text-xl"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="mt-4 text-lg text-danger">{error}</p>}
        <button
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-brand p-3 text-xl font-bold hover:bg-brand-soft disabled:opacity-50"
        >
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <div className="mt-8 text-center text-sm">
          <ServerStatus />
        </div>
      </form>
    </main>
  );
}

function TeamScreen({
  login,
  onLogOut,
}: {
  login: TeamLoginResponse;
  onLogOut: (message: string | null) => void;
}) {
  const live = useTeamLive(login.token);
  const now = useTicker();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (live.ended) {
    return <Ended text={live.ended} onOk={() => onLogOut(live.ended)} />;
  }
  if (!live.snapshot) {
    return (
      <main className="p-8 text-2xl text-ink-muted">
        {live.problem ?? 'Connecting to the game…'}
      </main>
    );
  }

  const { state, receivedAt } = live.snapshot;
  const phaseLeft = msLeft(state.game.phaseMsLeft, receivedAt, !state.game.frozen, now);
  const timerLeft = (ms: number) => msLeft(ms, receivedAt, state.game.timersRunning, now);

  // Runs an action and shows the server's answer.
  async function act(done: string, run: () => Promise<Ack>) {
    const ack = await run();
    setMessage(ack.ok ? { ok: true, text: done } : { ok: false, text: ack.message });
    return ack.ok;
  }

  return (
    <main className="mx-auto max-w-7xl p-4 text-lg">
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-card p-4">
        <h1 className="text-3xl font-extrabold">{state.team.name}</h1>
        <span className="rounded-lg bg-card-raised px-3 py-1 text-xl font-bold">
          {state.game.frozen ? 'Paused by the facilitator' : PHASE_LABEL[state.game.phase]}
        </span>
        <span className="font-mono text-3xl font-bold" aria-label="Time left in this phase">
          {formatMs(phaseLeft)}
        </span>
        <Connection status={live.status} />
        <span className="ml-auto text-sm text-ink-muted">Phase 3 test screen</span>
        <button
          onClick={() => onLogOut(null)}
          className="rounded-lg border border-line px-3 py-1 hover:bg-card-raised"
        >
          Log out
        </button>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Task Funds" value={money(state.team.taskFunds)} />
        <Stat label="Support Funds" value={money(state.team.supportFunds)} />
        <Stat
          label="Potion"
          value={`${Math.round(state.potion.percent)}%`}
          note={`${state.potion.completedTeams} of ${state.potion.totalTeams} teams done`}
        />
        <Stat label="Your tasks" value={`${state.team.tasksDone}/5`} />
      </section>

      {message && (
        <p
          role="status"
          className={`mt-4 rounded-lg p-3 ${message.ok ? 'bg-success/20' : 'bg-danger/20'}`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Chat state={state} feed={live.feed} myTeamId={state.team.id} act={act} send={live.send} />
        <div className="space-y-4">
          <Funds state={state} act={act} send={live.send} timerLeft={timerLeft} />
          <Leaderboard state={state} />
          {state.team.foundItems.length > 0 && (
            <Card title="Found items">
              <ul className="flex flex-wrap gap-2">
                {state.team.foundItems.map((f) => (
                  <li key={f} className="rounded-lg bg-card-raised px-3 py-2 font-mono text-xl">
                    Fragment: {f}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

type Act = (done: string, run: () => Promise<Ack>) => Promise<boolean>;
type Send = ReturnType<typeof useTeamLive>['send'];

function Chat({
  state,
  feed,
  myTeamId,
  act,
  send,
}: {
  state: PlayerState;
  feed: FeedItem[];
  myTeamId: string;
  act: Act;
  send: Send;
}) {
  const [body, setBody] = useState('');
  const { messagesLeft, messagesPerRound, maxLength } = state.chat;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await act('Message sent.', () => send('chat:send', { body }))) setBody('');
  }

  return (
    <Card title="Chat (all teams)">
      <ol className="h-96 space-y-2 overflow-y-auto rounded-lg bg-page p-3" aria-label="Chat feed">
        {feed.length === 0 && <li className="text-ink-muted">No messages yet.</li>}
        {feed.map((item) => (
          <li
            key={`${item.kind}:${item.id}`}
            className={item.kind === 'chat' ? '' : 'rounded bg-info/10 px-2 text-info'}
          >
            {item.kind === 'chat' && (
              <span className={`font-bold ${item.teamId === myTeamId ? 'text-brand-soft' : ''}`}>
                {item.teamName}:{' '}
              </span>
            )}
            {feedText(item, money)}
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-line bg-page p-3"
          placeholder={messagesLeft > 0 ? 'Type a message' : 'No messages left this round'}
          value={body}
          maxLength={maxLength}
          disabled={messagesLeft <= 0}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          disabled={messagesLeft <= 0}
          className="rounded-lg bg-brand px-4 font-bold hover:bg-brand-soft disabled:opacity-50"
        >
          Send
        </button>
      </form>
      <p className="mt-2 text-ink-muted">
        Messages left: {messagesLeft} of {messagesPerRound}
      </p>
    </Card>
  );
}

function Funds({
  state,
  act,
  send,
  timerLeft,
}: {
  state: PlayerState;
  act: Act;
  send: Send;
  timerLeft: (ms: number) => number | null;
}) {
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [askFrom, setAskFrom] = useState('');
  const [askAmount, setAskAmount] = useState('');
  const incoming = state.pendingRequests.filter((r) => r.direction === 'incoming');
  const outgoing = state.pendingRequests.filter((r) => r.direction === 'outgoing');

  return (
    <Card title="Funds">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act('Funds sent. They arrive in 60 seconds.', () =>
            send('funds:send', { toTeamId: sendTo, amount: Number(sendAmount) }),
          );
          if (ok) setSendAmount('');
        }}
      >
        <TeamSelect label="Send to" teams={state.teams} value={sendTo} onChange={setSendTo} />
        <AmountInput value={sendAmount} onChange={setSendAmount} />
        <button className="rounded-lg bg-brand px-4 py-2 font-bold hover:bg-brand-soft">
          Send funds
        </button>
      </form>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act('Request sent.', () =>
            send('funds:request', { payerTeamId: askFrom, amount: Number(askAmount) }),
          );
          if (ok) setAskAmount('');
        }}
      >
        <TeamSelect label="Ask" teams={state.teams} value={askFrom} onChange={setAskFrom} />
        <AmountInput value={askAmount} onChange={setAskAmount} />
        <button className="rounded-lg border border-brand px-4 py-2 font-bold hover:bg-card-raised">
          Request funds
        </button>
      </form>

      {state.pendingTransfers.length > 0 && (
        <ul className="mt-4 space-y-1" aria-label="Transfers on the way">
          {state.pendingTransfers.map((t) => (
            <li key={t.id} className="rounded-lg bg-card-raised px-3 py-2">
              {t.direction === 'out'
                ? `Sending ${money(t.amount)} to ${t.otherTeamName}`
                : `${t.otherTeamName} is sending you ${money(t.amount)}`}
              {' · '}
              <span className="font-mono font-bold">
                Arriving in {formatMs(timerLeft(t.msLeft))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {incoming.map((r) => (
        <div
          key={r.id}
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-warning/10 p-3"
        >
          <span>
            {r.otherTeamName} asks you for {money(r.amount)}
          </span>
          <button
            className="rounded-lg bg-success px-3 py-1 font-bold text-page"
            onClick={() =>
              act('Request accepted. The funds arrive in 60 seconds.', () =>
                send('funds:accept', { requestId: r.id }),
              )
            }
          >
            Accept
          </button>
          <button
            className="rounded-lg border border-line px-3 py-1"
            onClick={() =>
              act('Request declined.', () => send('funds:decline', { requestId: r.id }))
            }
          >
            Decline
          </button>
        </div>
      ))}

      {outgoing.map((r) => (
        <div
          key={r.id}
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-card-raised p-3"
        >
          <span>
            You asked {r.otherTeamName} for {money(r.amount)}. Waiting for an answer.
          </span>
          <button
            className="rounded-lg border border-line px-3 py-1"
            onClick={() =>
              act('Request cancelled.', () => send('funds:cancel', { requestId: r.id }))
            }
          >
            Cancel
          </button>
        </div>
      ))}
    </Card>
  );
}

function Leaderboard({ state }: { state: PlayerState }) {
  const board = state.leaderboard;
  if (!board) {
    return (
      <Card title="Leaderboard">
        <p className="text-ink-muted">
          {state.game.phase === 'PAUSE'
            ? 'Pause: only the potion is shown.'
            : 'The leaderboard opens when the game starts.'}
        </p>
      </Card>
    );
  }
  return (
    <Card title={board.final ? 'Final leaderboard' : 'Leaderboard'}>
      {board.final && !board.valid && (
        <p className="mb-2 rounded-lg bg-danger/20 p-2">The potion is not full, so nobody wins.</p>
      )}
      <table className="w-full text-left">
        <thead className="text-ink-muted">
          <tr>
            {board.rows.some((r) => r.rank !== null) && <th>Rank</th>}
            <th>Team</th>
            <th>Tasks</th>
            <th>Task Funds</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((r) => (
            <tr key={r.teamId} className={r.teamId === state.team.id ? 'font-bold' : ''}>
              {r.rank !== null && <td>{r.rank}</td>}
              <td>{r.name}</td>
              <td>{r.tasksDone}/5</td>
              <td>{money(r.taskFunds)}</td>
              <td>{money(r.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------- Small pieces ----------

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-ink-muted">{label}</p>
      <p className="text-3xl font-extrabold">{value}</p>
      {note && <p className="text-sm text-ink-muted">{note}</p>}
    </div>
  );
}

export function Connection({ status }: { status: LiveStatus }) {
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

function TeamSelect({
  label,
  teams,
  value,
  onChange,
}: {
  label: string;
  teams: PlayerState['teams'];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col">
      {label}
      <select
        className="rounded-lg border border-line bg-page p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      >
        <option value="">Choose a team</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col">
      Amount
      <input
        type="number"
        min={1}
        step={1}
        className="w-32 rounded-lg border border-line bg-page p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </label>
  );
}

function Ended({ text, onOk }: { text: string; onOk: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-line bg-card p-8 text-center">
        <p className="text-2xl font-bold">{text}</p>
        <button onClick={onOk} className="mt-6 rounded-lg bg-brand px-6 py-3 text-xl font-bold">
          OK
        </button>
      </div>
    </main>
  );
}
