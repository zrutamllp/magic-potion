import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, Pencil, Trash2 } from 'lucide-react';
import { TASK_DEFINITIONS, type PackDetail, type TaskKey } from '@magic-potion/shared';
import { confirmLeave } from '../router';
import { errorText, useStaff } from '../StaffContext';
import { TaskEditor } from '../packs/TaskEditor';
import { Panel, SmallButton, Status, inputBase, useAction } from '../ui';

// One content pack: its 12 tasks on the left (with how much content each has), the selected
// task's entries on the right.

export function PackPage({ packId, task }: { packId: string; task: TaskKey }) {
  const { api, go } = useStaff();
  const [pack, setPack] = useState<PackDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PackDetail>(`/packs/${packId}`)
      .then(setPack, (e: unknown) => setLoadError(errorText(e)));
  }, [api, packId]);

  if (!pack) {
    return (
      <div>
        <BackLink />
        <Status error={loadError} />
        {!loadError && <p className="text-ink-muted">Loading…</p>}
      </div>
    );
  }

  const byKey = new Map(pack.readiness.tasks.map((t) => [t.key, t]));

  return (
    <div>
      <BackLink />
      <Header pack={pack} onPack={setPack} />
      <Readiness pack={pack} />
      <div className="mt-4 grid grid-cols-[13rem_1fr] items-start gap-4">
        <nav aria-label="Tasks" className="flex flex-col gap-1">
          {TASK_DEFINITIONS.map((d) => {
            const t = byKey.get(d.key)!;
            const active = d.key === task;
            return (
              <button
                key={d.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => go({ page: 'pack', packId, task: d.key })}
                className={`flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-left text-sm ${
                  active ? 'bg-brand/25 font-semibold' : 'hover:bg-card-raised'
                }`}
              >
                <span className="truncate">{d.name}</span>
                <span
                  className={`shrink-0 rounded-full px-2 text-xs ${
                    t.invalid > 0
                      ? 'bg-danger/20 text-danger'
                      : t.count === 0
                        ? 'bg-card-raised text-ink-muted'
                        : 'bg-success/15 text-success'
                  }`}
                >
                  {t.invalid > 0 ? 'fix' : t.count}
                </span>
              </button>
            );
          })}
        </nav>
        <TaskEditor key={task} pack={pack} task={task} onPack={setPack} />
      </div>
    </div>
  );
}

function BackLink() {
  const { go } = useStaff();
  return (
    <button
      type="button"
      onClick={() => go({ page: 'packs' })}
      className="mb-2 inline-flex items-center gap-1 text-base text-ink-muted hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> All content packs
    </button>
  );
}

function Header({ pack, onPack }: { pack: PackDetail; onPack: (p: PackDetail) => void }) {
  const { api, go } = useStaff();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pack.name);
  const action = useAction();

  async function rename(e: FormEvent) {
    e.preventDefault();
    const next = await action.run(() => api.patch<PackDetail>(`/packs/${pack.id}`, { name }));
    if (next) {
      onPack(next);
      setEditing(false);
    }
  }

  async function copy() {
    const copyName = window.prompt('Name for the copy', `${pack.name} (copy)`);
    if (!copyName?.trim() || !confirmLeave()) return;
    const made = await action.run(() =>
      api.post<PackDetail>(`/packs/${pack.id}/copy`, { name: copyName.trim() }),
    );
    if (made) go({ page: 'pack', packId: made.id, task: 'vault' });
  }

  async function remove() {
    if (
      !window.confirm(`Delete the pack “${pack.name}” and all its entries? This cannot be undone.`)
    )
      return;
    const done = await action.run(() => api.del(`/packs/${pack.id}`));
    if (done !== undefined) go({ page: 'packs' });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {editing ? (
        <form onSubmit={rename} className="flex items-center gap-2">
          <input
            aria-label="Pack name"
            className={`${inputBase} w-80 text-xl font-bold`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            autoFocus
          />
          <SmallButton type="submit" disabled={action.busy}>
            Save
          </SmallButton>
          <SmallButton variant="outline" tone="muted" onClick={() => setEditing(false)}>
            Cancel
          </SmallButton>
        </form>
      ) : (
        <>
          <h1 className="text-3xl font-extrabold text-brand-soft">{pack.name}</h1>
          {!pack.builtIn && (
            <button
              type="button"
              aria-label="Rename pack"
              className="text-ink-muted hover:text-ink"
              onClick={() => {
                setName(pack.name);
                setEditing(true);
              }}
            >
              <Pencil className="h-5 w-5" aria-hidden />
            </button>
          )}
        </>
      )}
      {pack.builtIn && (
        <span className="rounded-full bg-card-raised px-3 py-0.5 text-sm text-ink-muted">
          Built in, read-only
        </span>
      )}
      <span className="text-sm text-ink-muted">
        {pack.games.length === 0
          ? 'No games use it'
          : `Used by ${pack.games.map((g) => g.name + (g.locked ? ' (started, keeps its copy)' : '')).join(', ')}`}
      </span>
      <span className="ml-auto flex gap-2">
        <SmallButton variant="outline" tone="muted" onClick={copy} disabled={action.busy}>
          <Copy className="h-4 w-4" aria-hidden /> Copy
        </SmallButton>
        {!pack.builtIn && pack.games.length === 0 && (
          <SmallButton variant="outline" tone="danger" onClick={remove} disabled={action.busy}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete pack
          </SmallButton>
        )}
      </span>
      <div className="w-full">
        <Status error={action.error} />
      </div>
    </div>
  );
}

function Readiness({ pack }: { pack: PackDetail }) {
  const { ready, problems, warnings } = pack.readiness;
  if (ready && warnings.length === 0) {
    return (
      <p className="mt-2 flex items-center gap-2 text-success">
        <CheckCircle2 className="h-5 w-5" aria-hidden /> Ready to play.
      </p>
    );
  }
  return (
    <Panel className={`mt-2 ${ready ? 'border-warning/50' : 'border-danger/50'}`}>
      <p
        className={`flex items-center gap-2 font-semibold ${ready ? 'text-warning' : 'text-danger'}`}
      >
        <AlertTriangle className="h-5 w-5" aria-hidden />
        {ready ? 'Ready to play, with notes:' : 'Not ready to play yet:'}
      </p>
      <ul className="mt-1 list-disc pl-6 text-sm">
        {problems.map((p) => (
          <li key={p} className="text-danger">
            {p}
          </li>
        ))}
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </Panel>
  );
}
