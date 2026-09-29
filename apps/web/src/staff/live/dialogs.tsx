import { useState } from 'react';
import {
  forbiddenMatches,
  type AdjustReply,
  type ResetLoginReply,
  type StaffTeamView,
} from '@magic-potion/shared';
import { money } from '../../lib/time';
import { useStaff } from '../StaffContext';
import { Dialog, inputClass, useAction } from '../ui';
import { useLiveView } from './context';
import { signed } from './format';

// The dashboard's action dialogs (Phase 6C). The server checks every rule again; these only
// make the choices clear before anything changes.

// Live routes answer { ok, value }. Errors arrive as thrown ApiErrors with a plain message.
interface Reply<T> {
  ok: true;
  value: T;
}

function useLiveApi() {
  const { api } = useStaff();
  const { gameId } = useLiveView();
  return <T,>(path: string, body: unknown = {}) =>
    api.post<Reply<T>>(`/games/${gameId}/live${path}`, body).then((r) => r.value);
}

// "1,500" or "1500" -> 1500. Null unless a whole number above zero.
function parseAmount(text: string): number | null {
  const clean = text.replace(/[,\s]/g, '');
  if (!/^\d+$/.test(clean)) return null;
  const n = Number(clean);
  return n > 0 ? n : null;
}

export function AdjustDialog({
  team,
  onClose,
  onDone,
}: {
  team: StaffTeamView;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const post = useLiveApi();
  const { state, isAdmin } = useLiveView();
  const [direction, setDirection] = useState<'add' | 'take'>('add');
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const action = useAction();
  const amount = parseAmount(amountText);
  const change = amount === null ? null : direction === 'add' ? amount : -amount;
  const limit = state.limits.coFacilitatorAdjustLimit;
  const needsApproval = !isAdmin && amount !== null && amount > limit;

  async function submit() {
    if (change === null) return;
    const reply = await action.run(() =>
      post<AdjustReply>(`/teams/${team.id}/adjust`, { amount: change, reason }),
    );
    if (!reply) return;
    onDone(
      reply.outcome === 'applied'
        ? `${team.name}: Task Funds ${signed(change)}.`
        : `${team.name}: ${signed(change)} sent to the main admin for approval.`,
    );
  }

  return (
    <Dialog
      title={`Change Task Funds: ${team.name}`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={needsApproval ? 'Send for approval' : 'Change funds'}
      busy={action.busy}
      canSubmit={change !== null && reason.trim() !== ''}
      error={action.error}
    >
      <p className="text-ink-muted">
        Now {money(team.taskFunds)}. The team sees only “Funds adjusted by the facilitator” and the
        amount, never who or why.
      </p>
      <div className="flex gap-2" role="radiogroup" aria-label="Add or take away">
        {(['add', 'take'] as const).map((d) => (
          <label
            key={d}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 ${
              direction === d ? 'border-brand bg-brand/15' : 'border-line'
            }`}
          >
            <input
              type="radio"
              name="direction"
              checked={direction === d}
              onChange={() => setDirection(d)}
            />
            {d === 'add' ? 'Add' : 'Take away'}
          </label>
        ))}
      </div>
      <label className="block font-semibold">
        Amount
        <input
          className={`${inputClass} mt-1`}
          inputMode="numeric"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="1,000"
          autoFocus
        />
      </label>
      {needsApproval && (
        <p className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2">
          Over {money(limit)}: this goes to the main admin for approval. Funds change only when it
          is approved.
        </p>
      )}
      <label className="block font-semibold">
        Reason (staff only)
        <textarea
          className={`${inputClass} mt-1`}
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
    </Dialog>
  );
}

export function RenameDialog({ team, onClose }: { team: StaffTeamView; onClose: () => void }) {
  const post = useLiveApi();
  const [name, setName] = useState(team.name);
  const action = useAction();
  async function submit() {
    const done = await action.run(() => post(`/teams/${team.id}/rename`, { name }));
    if (done !== undefined) onClose();
  }
  return (
    <Dialog
      title={`Rename ${team.name}`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Rename"
      busy={action.busy}
      canSubmit={name.trim() !== '' && name.trim() !== team.name}
      error={action.error}
    >
      <label className="block font-semibold">
        New name
        <input
          className={`${inputClass} mt-1`}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </label>
      <p className="text-ink-muted">Every team sees the new name at once.</p>
    </Dialog>
  );
}

export function ResetLoginDialog({ team, onClose }: { team: StaffTeamView; onClose: () => void }) {
  const post = useLiveApi();
  const action = useAction();
  const [login, setLogin] = useState<ResetLoginReply | null>(null);
  async function submit() {
    const reply = await action.run(() => post<ResetLoginReply>(`/teams/${team.id}/reset-login`));
    if (reply) setLogin(reply);
  }
  if (login) {
    return (
      <Dialog title={`New login for ${login.teamName}`} onClose={onClose} tone="success">
        <p>Give the team these details. The password is shown only now.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-page px-4 py-3 text-lg">
          <dt className="text-ink-muted">Team code</dt>
          <dd className="font-mono font-bold">{login.code}</dd>
          <dt className="text-ink-muted">Password</dt>
          <dd className="font-mono font-bold">{login.password}</dd>
        </dl>
      </Dialog>
    );
  }
  return (
    <Dialog
      title={`Reset the login of ${team.name}?`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Reset login"
      tone="danger"
      busy={action.busy}
      error={action.error}
    >
      <p>
        The team gets a new password and its screen logs out now. Its game, tasks and funds do not
        change.
      </p>
    </Dialog>
  );
}

export function RemoveTeamDialog({ team, onClose }: { team: StaffTeamView; onClose: () => void }) {
  const post = useLiveApi();
  const [reason, setReason] = useState('');
  const action = useAction();
  async function submit() {
    const done = await action.run(() => post(`/teams/${team.id}/remove`, { reason }));
    if (done !== undefined) onClose();
  }
  return (
    <Dialog
      title={`Remove ${team.name} from the game?`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Remove team"
      tone="danger"
      busy={action.busy}
      canSubmit={reason.trim() !== ''}
      error={action.error}
    >
      <p>
        The team leaves the potion (shares are shared out again over the other teams), gets no score
        and no Full Potion Bonus. Transfers it already sent still count. This cannot be undone.
      </p>
      <label className="block font-semibold">
        Reason
        <textarea
          className={`${inputClass} mt-1`}
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
      </label>
    </Dialog>
  );
}

// A yes/no action on the live routes, with an optional note for the audit log.
export function ConfirmPost({
  title,
  body,
  path,
  payload = {},
  label,
  tone = 'brand',
  withReason = false,
  onClose,
}: {
  title: string;
  body: string;
  path: string;
  payload?: object;
  label: string;
  tone?: 'brand' | 'danger';
  withReason?: boolean;
  onClose: () => void;
}) {
  const post = useLiveApi();
  const [reason, setReason] = useState('');
  const action = useAction();
  async function submit() {
    const done = await action.run(() => post(path, withReason ? { ...payload, reason } : payload));
    if (done !== undefined) onClose();
  }
  return (
    <Dialog
      title={title}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={label}
      tone={tone}
      busy={action.busy}
      error={action.error}
    >
      <p>{body}</p>
      {withReason && (
        <label className="block font-semibold">
          Note for the audit log (optional)
          <input
            className={`${inputClass} mt-1`}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      )}
    </Dialog>
  );
}

export function MessageDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const post = useLiveApi();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const action = useAction();
  const flagged = forbiddenMatches(`${title} ${body}`);
  async function submit() {
    const done = await action.run(() => post('/message', { title, body }));
    if (done !== undefined) onDone();
  }
  return (
    <Dialog
      title="Message to every team"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Send to all teams"
      busy={action.busy}
      canSubmit={title.trim() !== '' && body.trim() !== ''}
      error={action.error}
    >
      <p className="text-ink-muted">It appears in every team’s Inbox at once.</p>
      <label className="block font-semibold">
        Title
        <input
          className={`${inputClass} mt-1`}
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </label>
      <label className="block font-semibold">
        Message
        <textarea
          className={`${inputClass} mt-1`}
          rows={3}
          maxLength={500}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      {flagged.length > 0 && (
        <p role="status" className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2">
          Player text should not tell teams to cooperate or help each other (game rules, section
          16). Check these words: <strong>{flagged.join(', ')}</strong>. You can still send it.
        </p>
      )}
    </Dialog>
  );
}
