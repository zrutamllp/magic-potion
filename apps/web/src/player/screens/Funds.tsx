import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, HandCoins, Hourglass, Lightbulb, Wallet } from 'lucide-react';
import type { FeedItem, PlayerState } from '@magic-potion/shared';
import { formatMs, money } from '../../lib/time';
import { useGame } from '../GameContext';
import { secondsText } from '../rules';
import { Button, Card, Chip, PageTitle, fieldClass } from '../ui/basics';
import { clockTime } from './Chat';

// Funds: both wallets, send and request panels, requests to answer, and a list of this
// team's transfers and requests (pending ones first). No shop, power-ups or "Add Funds".

export function Funds() {
  const { state } = useGame();
  const { taskFunds, supportFunds } = state.team;
  const multiplier = state.settings.scoring.taskFundsMultiplier;
  return (
    <>
      <PageTitle title="Funds" tone="success" />
      <div className="grid gap-5 md:grid-cols-2">
        <div
          className={`rounded-2xl border p-6 ${
            taskFunds < 0
              ? 'border-danger/60 bg-danger/15'
              : 'border-success/50 bg-gradient-to-br from-success/30 to-success/5'
          }`}
        >
          <div className="flex items-center justify-between">
            <Wallet className="h-9 w-9 text-success" aria-hidden />
            <Chip tone="success">Counts ×{multiplier} in your score</Chip>
          </div>
          <p className="mt-4 text-xl font-semibold">Task Funds</p>
          <p
            className={`nums text-5xl font-extrabold ${taskFunds < 0 ? 'text-danger' : 'text-success'}`}
          >
            {money(taskFunds)}
          </p>
          {taskFunds < 0 && (
            <p className="mt-2 text-lg text-danger">
              Below zero: you cannot start a task until this is zero or more.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-info/50 bg-card p-6">
          <div className="flex items-center justify-between">
            <Lightbulb className="h-9 w-9 text-info" aria-hidden />
            <Chip tone="info">For hints only</Chip>
          </div>
          <p className="mt-4 text-xl font-semibold">Support Funds</p>
          <p className="nums text-5xl font-extrabold text-info">{money(supportFunds)}</p>
          <p className="mt-2 text-lg text-ink-muted">Does not count in your score.</p>
        </div>
      </div>

      <IncomingRequests />

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <MoveFunds kind="send" />
        <MoveFunds kind="request" />
      </div>

      <Transactions />
    </>
  );
}

function IncomingRequests() {
  const { state, act, send } = useGame();
  const incoming = state.pendingRequests.filter((r) => r.direction === 'incoming');
  if (incoming.length === 0) return null;
  return (
    <Card tone="warning" className="mt-5">
      <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold text-warning">
        <HandCoins className="h-6 w-6" aria-hidden /> Requests for your funds
      </h2>
      <ul className="space-y-3">
        {incoming.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-card-raised p-4"
          >
            <span className="flex-1 text-xl">
              <strong>{r.otherTeamName}</strong> asks for{' '}
              <strong className="nums">{money(r.amount)}</strong>
            </span>
            <Button
              tone="success"
              onClick={() =>
                act('Request accepted. The funds are on their way.', () =>
                  send('funds:accept', { requestId: r.id }),
                )
              }
            >
              Accept
            </Button>
            <Button
              tone="muted"
              onClick={() =>
                act('Request declined.', () => send('funds:decline', { requestId: r.id }))
              }
            >
              Decline
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MoveFunds({ kind }: { kind: 'send' | 'request' }) {
  const { state, act, send } = useGame();
  const [teamId, setTeamId] = useState('');
  const [amount, setAmount] = useState('');
  const delay = secondsText(state.settings.transfers.delaySeconds);
  const isSend = kind === 'send';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    const ok = isSend
      ? await act(`Funds sent. They arrive in ${delay}.`, () =>
          send('funds:send', { toTeamId: teamId, amount: value }),
        )
      : await act('Request sent.', () =>
          send('funds:request', { payerTeamId: teamId, amount: value }),
        );
    if (ok) setAmount('');
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          {isSend ? (
            <ArrowUpRight className="h-6 w-6 text-success" aria-hidden />
          ) : (
            <ArrowDownLeft className="h-6 w-6 text-info" aria-hidden />
          )}
          {isSend ? 'Send funds' : 'Request funds'}
        </h2>
        <label className="text-lg font-semibold">
          {isSend ? 'To team' : 'From team'}
          <select
            className={`${fieldClass} mt-1`}
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            required
          >
            <option value="">Choose a team</option>
            {state.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-lg font-semibold">
          Amount
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className={`${fieldClass} nums mt-1`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <p className="text-base text-ink-muted">
          {isSend
            ? `Paid from Task Funds. Arrives ${delay} after you send it.`
            : 'The other team can accept or decline.'}
        </p>
        <Button
          type="submit"
          tone={isSend ? 'success' : 'brand'}
          disabled={!state.game.timersRunning}
        >
          {isSend ? 'Send funds' : 'Request funds'}
        </Button>
      </form>
    </Card>
  );
}

// This team's transfers and requests, newest first, with transfers on the way on top.
function Transactions() {
  const { state, feed, act, send, timerMsLeft } = useGame();
  const outgoing = state.pendingRequests.filter((r) => r.direction === 'outgoing');
  const history = feed
    .filter((f): f is Exclude<FeedItem, { kind: 'chat' }> => f.kind !== 'chat')
    .filter((f) => !(f.kind === 'transfer' && !f.arrived))
    .filter((f) => !(f.kind === 'request' && f.status === 'PENDING'))
    .sort((a, b) => b.at - a.at);
  const empty =
    state.pendingTransfers.length === 0 && outgoing.length === 0 && history.length === 0;

  return (
    <Card className="mt-5">
      <h2 className="mb-4 text-2xl font-bold">Transactions</h2>
      {empty && <p className="text-lg text-ink-muted">No transactions yet.</p>}
      <ul className="divide-y divide-line">
        {state.pendingTransfers.map((t) => (
          <Row
            key={t.id}
            icon={<Hourglass className="h-5 w-5 text-warning" aria-hidden />}
            text={
              t.direction === 'out'
                ? `Sending to ${t.otherTeamName}`
                : `On the way from ${t.otherTeamName}`
            }
            amount={t.direction === 'out' ? -t.amount : t.amount}
            note={
              <span className="nums font-bold text-warning">
                Arriving in {formatMs(timerMsLeft(t.msLeft))}
              </span>
            }
          />
        ))}
        {outgoing.map((r) => (
          <Row
            key={r.id}
            icon={<HandCoins className="h-5 w-5 text-info" aria-hidden />}
            text={`You asked ${r.otherTeamName} for ${money(r.amount)}`}
            note={
              <span className="flex items-center gap-3">
                Waiting for an answer
                <Button
                  tone="muted"
                  variant="outline"
                  className="px-3 py-1 text-base"
                  onClick={() =>
                    act('Request cancelled.', () => send('funds:cancel', { requestId: r.id }))
                  }
                >
                  Cancel
                </Button>
              </span>
            }
          />
        ))}
        {history.map((f) => (
          <HistoryRow key={`${f.kind}:${f.id}`} item={f} state={state} />
        ))}
      </ul>
    </Card>
  );
}

function HistoryRow({
  item,
  state,
}: {
  item: Exclude<FeedItem, { kind: 'chat' }>;
  state: PlayerState;
}) {
  const me = state.team.id;
  if (item.kind === 'transfer') {
    const out = item.fromTeamId === me;
    return (
      <Row
        icon={
          out ? (
            <ArrowUpRight className="h-5 w-5 text-danger" aria-hidden />
          ) : (
            <ArrowDownLeft className="h-5 w-5 text-success" aria-hidden />
          )
        }
        text={out ? `Sent to ${item.toTeamName}` : `Received from ${item.fromTeamName}`}
        amount={out ? -item.amount : item.amount}
        note={`Arrived · ${clockTime(item.at)}`}
      />
    );
  }
  const asked = item.requesterTeamId === me;
  const status = {
    PENDING: 'Waiting',
    ACCEPTED: 'Accepted',
    DECLINED: 'Declined',
    CANCELLED: 'Cancelled',
  }[item.status];
  return (
    <Row
      icon={<HandCoins className="h-5 w-5 text-ink-muted" aria-hidden />}
      text={
        asked
          ? `You asked ${item.payerTeamName} for ${money(item.amount)}`
          : `${item.requesterTeamName} asked you for ${money(item.amount)}`
      }
      note={`${status} · ${clockTime(item.at)}`}
    />
  );
}

function Row({
  icon,
  text,
  amount,
  note,
}: {
  icon: ReactNode;
  text: string;
  amount?: number;
  note: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 text-lg">
      {icon}
      <span className="flex-1">{text}</span>
      <span className="text-base text-ink-muted">{note}</span>
      {amount !== undefined && (
        <span
          className={`nums w-28 text-right text-xl font-bold ${amount < 0 ? 'text-danger' : 'text-success'}`}
        >
          {amount > 0 ? '+' : ''}
          {money(amount)}
        </span>
      )}
    </li>
  );
}
