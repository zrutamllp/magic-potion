import { useEffect, useState, type FormEvent } from 'react';
import { Copy, Plus } from 'lucide-react';
import type { PackDetail, PackSummary } from '@magic-potion/shared';
import { errorText, useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, inputClass, useAction } from '../ui';

// Every content pack. Packs are reusable across games and clients: copy one, edit the copy,
// then choose it on a game's Content tab.

export function PacksPage() {
  const { api, go } = useStaff();
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const copy = useAction();

  useEffect(() => {
    api.get<PackSummary[]>('/packs').then(setPacks, (e: unknown) => setLoadError(errorText(e)));
  }, [api]);

  async function copyPack(p: PackSummary) {
    const name = window.prompt('Name for the copy', `${p.name} (copy)`);
    if (!name?.trim()) return;
    const made = await copy.run(() =>
      api.post<PackDetail>(`/packs/${p.id}/copy`, { name: name.trim() }),
    );
    if (made) go({ page: 'pack', packId: made.id, task: 'vault' });
  }

  return (
    <div className="max-w-5xl">
      <h1 className="mb-4 text-3xl font-extrabold text-brand-soft">Content packs</h1>
      <div className="grid grid-cols-[1fr_22rem] items-start gap-5">
        <Panel title="Packs">
          <Status error={loadError ?? copy.error} />
          {packs === null && !loadError && <p className="text-ink-muted">Loading…</p>}
          <ul className="divide-y divide-line">
            {packs?.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {p.name}
                    {p.builtIn && (
                      <span className="ml-2 rounded-full bg-card-raised px-2 py-0.5 text-xs text-ink-muted">
                        Built in, read-only
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-ink-muted">
                    {p.itemCount} entries · used by {p.gameCount}{' '}
                    {p.gameCount === 1 ? 'game' : 'games'} ·{' '}
                    <span className={p.ready ? 'text-success' : 'text-warning'}>
                      {p.ready ? 'Ready to play' : 'Not ready yet'}
                    </span>
                  </p>
                </div>
                <span className="flex shrink-0 gap-2">
                  <SmallButton
                    variant="outline"
                    tone="muted"
                    onClick={() => copyPack(p)}
                    disabled={copy.busy}
                  >
                    <Copy className="h-4 w-4" aria-hidden /> Copy
                  </SmallButton>
                  <SmallButton
                    variant="outline"
                    onClick={() => go({ page: 'pack', packId: p.id, task: 'vault' })}
                  >
                    {p.builtIn ? 'View' : 'Edit'}
                  </SmallButton>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <NewPack />
      </div>
    </div>
  );
}

function NewPack() {
  const { api, go } = useStaff();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const action = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const made = await action.run(() => api.post<PackDetail>('/packs', { name, description }));
    if (made) go({ page: 'pack', packId: made.id, task: 'vault' });
  }

  return (
    <Panel title="New empty pack">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="block font-semibold">
          Name
          <input
            className={`${inputClass} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            placeholder="Acme 2026"
          />
        </label>
        <label className="block font-semibold">
          Notes (optional)
          <textarea
            rows={2}
            className={`${inputClass} mt-1`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
        </label>
        <p className="text-sm text-ink-muted">
          Tip: copying the Sample pack is quicker. Every task already has content, and you change
          only what you need.
        </p>
        <Status error={action.error} />
        <SmallButton type="submit" disabled={action.busy}>
          <Plus className="h-4 w-4" aria-hidden /> {action.busy ? 'Creating…' : 'Create pack'}
        </SmallButton>
      </form>
    </Panel>
  );
}
