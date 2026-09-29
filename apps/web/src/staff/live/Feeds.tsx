import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import type { AuditRowView, FeedItem, StaffAdjustmentRequestView } from '@magic-potion/shared';
import { feedText } from '../../lib/feed';
import { money } from '../../lib/time';
import { errorText, useStaff } from '../StaffContext';
import { Dialog, SmallButton, Status, inputClass, useAction } from '../ui';
import { useLiveView } from './context';
import { auditText, clockTime, signed } from './format';
import { PhotoGrid } from './photos';

// The right-hand column: chat, transfers, fund change approvals and the audit log.

type FeedTab = 'chat' | 'transfers' | 'approvals' | 'photos' | 'audit';

export function Feeds({ feed }: { feed: FeedItem[] }) {
  const { state, isAdmin } = useLiveView();
  const [tab, setTab] = useState<FeedTab>('chat');
  const pending = state.pendingAdjustments.length;
  const tabs: { id: FeedTab; label: string }[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'transfers', label: 'Transfers' },
    {
      id: 'approvals',
      label: `${isAdmin ? 'Approvals' : 'Requests'}${pending ? ` (${pending})` : ''}`,
    },
    { id: 'photos', label: 'Photos' },
    { id: 'audit', label: 'Audit' },
  ];
  return (
    <section className="flex min-h-0 w-[380px] shrink-0 flex-col rounded-2xl border border-line bg-card">
      <nav className="flex border-b border-line" aria-label="Live feeds">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`-mb-px flex-1 border-b-2 px-2 py-2 text-sm font-semibold ${
              tab === t.id
                ? 'border-brand text-ink'
                : 'border-transparent text-ink-muted hover:text-ink'
            } ${t.id === 'approvals' && pending > 0 && isAdmin ? 'text-warning' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {tab === 'chat' && (
          <FeedList items={feed.filter((f) => f.kind === 'chat')} empty="No chat yet." />
        )}
        {tab === 'transfers' && (
          <FeedList
            items={feed.filter((f) => f.kind !== 'chat')}
            empty="No transfers or requests yet."
          />
        )}
        {tab === 'approvals' && <Approvals requests={state.pendingAdjustments} />}
        {tab === 'photos' && <PhotoGrid />}
        {tab === 'audit' && <AuditLog />}
      </div>
    </section>
  );
}

function FeedList({ items, empty }: { items: FeedItem[]; empty: string }) {
  if (items.length === 0) return <p className="py-2 text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {[...items].reverse().map((item) => (
        <li key={`${item.kind}:${item.id}`} className="text-sm">
          <span className="mr-2 text-xs text-ink-muted">{clockTime(item.at)}</span>
          {item.kind === 'chat' ? (
            <>
              <strong>{item.teamName}: </strong>
              <span className="break-words">{item.body}</span>
            </>
          ) : (
            <span className="text-info">{feedText(item, money)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Approvals({ requests }: { requests: StaffAdjustmentRequestView[] }) {
  const { isAdmin } = useLiveView();
  if (requests.length === 0) {
    return (
      <p className="py-2 text-sm text-ink-muted">
        {isAdmin
          ? 'No fund changes waiting for approval.'
          : 'None of your fund changes are waiting for the main admin.'}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {requests.map((r) => (
        <Approval key={r.id} request={r} />
      ))}
    </ul>
  );
}

function Approval({ request: r }: { request: StaffAdjustmentRequestView }) {
  const { api } = useStaff();
  const { gameId, isAdmin } = useLiveView();
  const action = useAction();
  const decide = (approve: boolean) =>
    action.run(() => api.post(`/games/${gameId}/live/adjustments/${r.id}`, { approve }));
  return (
    <li className="rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
      <p>
        <strong>{r.teamName}</strong>{' '}
        <span className={`nums font-bold ${r.amount < 0 ? 'text-danger' : 'text-success'}`}>
          {signed(r.amount)}
        </span>
      </p>
      <p className="text-ink-muted">
        {r.requestedByName} at {clockTime(r.createdAt)}: {r.reason}
      </p>
      {isAdmin ? (
        <div className="mt-2 flex gap-2">
          <SmallButton
            tone="success"
            className="px-3 py-0.5 text-sm"
            onClick={() => decide(true)}
            disabled={action.busy}
          >
            Approve
          </SmallButton>
          <SmallButton
            variant="outline"
            tone="danger"
            className="px-3 py-0.5 text-sm"
            onClick={() => decide(false)}
            disabled={action.busy}
          >
            Turn down
          </SmallButton>
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">Waiting for the main admin.</p>
      )}
      <Status error={action.error} />
    </li>
  );
}

function AuditLog() {
  const { api } = useStaff();
  const { gameId, auditVersion } = useLiveView();
  const [rows, setRows] = useState<AuditRowView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<AuditRowView | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<AuditRowView[]>(`/games/${gameId}/live/audit`).then(
      (r) => {
        if (!cancelled) {
          setRows(r);
          setError(null);
        }
      },
      (e: unknown) => !cancelled && setError(errorText(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [api, gameId, auditVersion]);

  if (error) return <Status error={error} />;
  if (!rows) return <p className="py-2 text-sm text-ink-muted">Loading…</p>;
  if (rows.length === 0) return <p className="py-2 text-sm text-ink-muted">No changes yet.</p>;
  return (
    <>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className={r.undoneAt ? 'text-ink-muted line-through' : ''}>
                <span className="mr-2 text-xs text-ink-muted">{clockTime(r.at)}</span>
                {r.teamName && <strong>{r.teamName}: </strong>}
                {auditText(r)}
              </p>
              {r.canUndo && (
                <button
                  type="button"
                  onClick={() => setUndo(r)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs font-semibold hover:bg-card-raised"
                >
                  <Undo2 className="h-3 w-3" aria-hidden /> Undo
                </button>
              )}
            </div>
            <p className="text-xs text-ink-muted">
              {r.staffName}
              {r.reason && ` · “${r.reason}”`}
              {r.undoneAt && ' · undone'}
            </p>
          </li>
        ))}
      </ul>
      {undo && <UndoDialog row={undo} onClose={() => setUndo(null)} />}
    </>
  );
}

function UndoDialog({ row, onClose }: { row: AuditRowView; onClose: () => void }) {
  const { api } = useStaff();
  const { gameId } = useLiveView();
  const [reason, setReason] = useState('');
  const action = useAction();
  async function submit() {
    const done = await action.run(() =>
      api.post(`/games/${gameId}/live/audit/${row.id}/undo`, { reason }),
    );
    if (done !== undefined) onClose();
  }
  return (
    <Dialog
      title="Undo this change?"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Undo"
      busy={action.busy}
      error={action.error}
    >
      <p>
        {row.teamName && <strong>{row.teamName}: </strong>}
        {auditText(row)}
      </p>
      <p className="text-ink-muted">
        {row.action === 'ADJUST_FUNDS'
          ? 'The same amount goes back the other way. The team sees another “Funds adjusted by the facilitator” line.'
          : 'The team gets its old name back.'}
      </p>
      <label className="block font-semibold">
        Note for the audit log (optional)
        <input
          className={`${inputClass} mt-1`}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
    </Dialog>
  );
}
