import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, FileSpreadsheet, Plus, Save, Trash2 } from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  IMPORT_TASK_KEYS,
  TASK_DEFINITIONS,
  checkPackItem,
  countLabel,
  isPoolTask,
  type ItemError,
  type PackDetail,
  type PackItem,
  type PackItemData,
  type TaskKey,
} from '@magic-potion/shared';
import { ApiError } from '../../lib/api';
import { confirmLeave, useUnsavedChanges } from '../router';
import { useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, useAction } from '../ui';
import { TextField } from './fields';
import { ImportDialog } from './ImportDialog';
import { PreviewModal } from './PreviewModal';
import { TASK_FORMS, tidyItem } from './taskForms';

// One task's entries in a pack: the list on the left, the selected entry's form on the right,
// with Save, Preview as player and (for pools) Import from Excel/CSV.

const PER_TRY: Partial<Record<TaskKey, string>> = {
  riddle: `Each try draws ${DEFAULT_SETTINGS.tasks.poolPerTry.riddle} riddles (a game setting). More riddles mean a fresh set on every restart.`,
  hangman: 'Each try plays one phrase. A restart gets a phrase the team has not seen yet.',
  pictionary: `Each try draws ${DEFAULT_SETTINGS.tasks.poolPerTry.pictionary} drawings (a game setting).`,
  guess_celebrity: `Each try draws ${DEFAULT_SETTINGS.tasks.guessCelebrityFaces} photos (a game setting).`,
  ethical_dilemma:
    'Each game plays ONE scenario, the same for every team. Choose it on the game’s Content tab.',
  data_story: `Each try asks ${DEFAULT_SETTINGS.tasks.poolPerTry.data_story} questions from the dashboard (a game setting). More dashboards are used in turn on a restart.`,
};

type Selection = { kind: 'item'; id: string } | { kind: 'new' } | null;

const problemsOf = (task: TaskKey, item: PackItemData): ItemError[] =>
  checkPackItem(task, tidyItem(item));

export function TaskEditor({
  pack,
  task,
  onPack,
}: {
  pack: PackDetail;
  task: TaskKey;
  onPack: (pack: PackDetail) => void;
}) {
  const { api } = useStaff();
  const def = TASK_DEFINITIONS.find((d) => d.key === task)!;
  const forms = TASK_FORMS[task];
  const items = useMemo(
    () => pack.items.filter((i) => i.taskKey === task).sort((a, b) => a.position - b.position),
    [pack.items, task],
  );
  const readOnly = pack.builtIn;
  const [selection, setSelection] = useState<Selection>(
    items[0] ? { kind: 'item', id: items[0].id } : null,
  );
  const [importing, setImporting] = useState(false);
  const order = useAction();
  const selected =
    selection?.kind === 'item' ? items.find((i) => i.id === selection.id) : undefined;

  // Leaving an entry with unsaved changes asks first (the entry form marks itself unsaved).
  function select(next: Selection) {
    if (!confirmLeave()) return;
    setSelection(next);
  }

  async function move(item: PackItem, by: -1 | 1) {
    const ids = items.map((i) => i.id);
    const at = ids.indexOf(item.id);
    const to = at + by;
    if (to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to]!, ids[at]!];
    const next = await order.run(() =>
      api.put<PackDetail>(`/packs/${pack.id}/order`, { taskKey: task, itemIds: ids }),
    );
    if (next) onPack(next);
  }

  const canImport =
    (IMPORT_TASK_KEYS as readonly TaskKey[]).includes(task) &&
    !readOnly &&
    (task !== 'data_story' || selected !== undefined);
  const nounOne = countLabel(task, 1).replace(/^1 /, '');
  const entryKey = selection?.kind === 'item' ? selection.id : (selection?.kind ?? 'none');

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-extrabold">{def.name}</h2>
          <p className="text-sm text-ink-muted">
            {countLabel(task, items.length)} ·{' '}
            {def.type === 'COMMON' ? 'every team plays it' : 'drawn for some teams'}
          </p>
        </div>
        {!readOnly && (
          <span className="flex gap-2">
            {canImport && (
              <SmallButton variant="outline" onClick={() => setImporting(true)}>
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                {task === 'data_story' ? 'Import questions' : 'Import from Excel/CSV'}
              </SmallButton>
            )}
            <SmallButton variant="outline" onClick={() => select({ kind: 'new' })}>
              <Plus className="h-4 w-4" aria-hidden /> Add {nounOne}
            </SmallButton>
          </span>
        )}
      </div>
      {PER_TRY[task] && (
        <p className="rounded-lg bg-info/10 px-3 py-1.5 text-sm">{PER_TRY[task]}</p>
      )}
      {task === 'guess_celebrity' && (
        <CelebrityName pack={pack} onPack={onPack} readOnly={readOnly} />
      )}

      <div className="grid grid-cols-[15rem_1fr] items-start gap-3">
        <Panel className="max-h-[32rem] overflow-y-auto p-2">
          {items.length === 0 && selection?.kind !== 'new' && (
            <p className="p-2 text-sm text-ink-muted">No entries yet.</p>
          )}
          <Status error={order.error} />
          <ol className="flex flex-col gap-1" aria-label="Entries">
            {items.map((item, i) => {
              const bad = problemsOf(task, item).length > 0;
              const active = selection?.kind === 'item' && selection.id === item.id;
              return (
                <li
                  key={item.id}
                  className={`group flex items-center gap-1 rounded-lg ${active ? 'bg-brand/25' : 'hover:bg-card-raised'}`}
                >
                  <button
                    type="button"
                    onClick={() => select({ kind: 'item', id: item.id })}
                    className="min-w-0 flex-1 px-2 py-1.5 text-left text-sm"
                    aria-current={active ? 'true' : undefined}
                  >
                    <span className="mr-1 text-ink-muted">{i + 1}.</span>
                    <span className={bad ? 'text-danger' : ''}>
                      {forms.label(item) || '(empty)'}
                    </span>
                  </button>
                  {!readOnly && items.length > 1 && (
                    <span className="hidden shrink-0 group-hover:flex">
                      <button
                        type="button"
                        aria-label="Move up"
                        className="p-0.5 text-ink-muted hover:text-ink"
                        onClick={() => move(item, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        className="p-0.5 text-ink-muted hover:text-ink"
                        onClick={() => move(item, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
            {selection?.kind === 'new' && (
              <li className="rounded-lg bg-brand/25 px-2 py-1.5 text-sm font-semibold">
                New {nounOne}
              </li>
            )}
          </ol>
        </Panel>

        {selection && (selection.kind === 'new' || selected) ? (
          <EntryEditor
            key={entryKey}
            pack={pack}
            task={task}
            items={items}
            entry={selected ?? null}
            onPack={onPack}
            onSelect={setSelection}
          />
        ) : (
          <Panel>
            <p className="text-ink-muted">
              {readOnly
                ? 'This task has no entries in this pack.'
                : `Press “Add ${nounOne}” to start.`}
            </p>
          </Panel>
        )}
      </div>

      {importing && (
        <ImportDialog
          pack={pack}
          task={task}
          dashboard={task === 'data_story' ? selected : undefined}
          onDone={(next) => {
            setImporting(false);
            if (next) onPack(next);
          }}
        />
      )}
    </div>
  );
}

// The form of one entry (or a new one). It is remounted for each entry, so it starts from the
// saved values.
function EntryEditor({
  pack,
  task,
  items,
  entry,
  onPack,
  onSelect,
}: {
  pack: PackDetail;
  task: TaskKey;
  items: PackItem[];
  // Null for a new entry.
  entry: PackItem | null;
  onPack: (pack: PackDetail) => void;
  onSelect: (selection: Selection) => void;
}) {
  const { api } = useStaff();
  const forms = TASK_FORMS[task];
  const readOnly = pack.builtIn;
  const [saved, setSaved] = useState<PackItemData>(() =>
    entry ? { publicData: entry.publicData, secretData: entry.secretData } : forms.empty(),
  );
  const [draft, setDraft] = useState<PackItemData>(saved);
  const [errors, setErrors] = useState<ItemError[]>([]);
  const [previewing, setPreviewing] = useState<PackItemData[] | null>(null);
  const action = useAction();
  const dirty = !readOnly && JSON.stringify(draft) !== JSON.stringify(saved);
  useUnsavedChanges(dirty);

  async function save() {
    const clean = tidyItem(draft);
    const found = problemsOf(task, draft);
    setErrors(found);
    if (found.length > 0) {
      action.setError('Some fields need fixing. They are marked in red.');
      return;
    }
    const next = await action.run(async () => {
      try {
        return entry
          ? await api.put<PackDetail>(`/packs/${pack.id}/items/${entry.id}`, clean)
          : await api.post<PackDetail>(`/packs/${pack.id}/items`, { taskKey: task, ...clean });
      } catch (error) {
        if (error instanceof ApiError) {
          setErrors((error.body as { errors?: ItemError[] } | undefined)?.errors ?? []);
        }
        throw error;
      }
    }, 'Saved.');
    if (!next) return;
    // Saved: nothing is unsaved any more, so moving to the saved entry needs no question.
    setSaved(clean);
    setDraft(clean);
    onPack(next);
    if (!entry) {
      const mine = next.items.filter((i) => i.taskKey === task);
      const added = mine.reduce<PackItem | undefined>(
        (a, b) => (!a || b.position > a.position ? b : a),
        undefined,
      );
      if (added) onSelect({ kind: 'item', id: added.id });
    }
  }

  async function remove() {
    if (!entry || !window.confirm('Delete this entry?')) return;
    const next = await action.run(() => api.del<PackDetail>(`/packs/${pack.id}/items/${entry.id}`));
    if (next) {
      onPack(next);
      const rest = next.items.filter((i) => i.taskKey === task);
      onSelect(rest[0] ? { kind: 'item', id: rest[0].id } : null);
    }
  }

  function preview() {
    const found = problemsOf(task, draft);
    setErrors(found);
    if (found.length > 0) {
      action.setError('Fix the fields marked in red first.');
      return;
    }
    const clean = tidyItem(draft);
    // A pool plays from all its entries, with this one as edited; a puzzle plays on its own.
    if (isPoolTask(task)) {
      const others = items
        .filter((i) => i.id !== entry?.id)
        .map((i) => ({ publicData: i.publicData, secretData: i.secretData }))
        .filter((o) => problemsOf(task, o).length === 0);
      setPreviewing([clean, ...others]);
    } else setPreviewing([clean]);
  }

  const Form = forms.Form;
  return (
    <Panel className="min-w-0">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-line bg-card px-4 py-2">
        {!readOnly && (
          <SmallButton onClick={save} disabled={action.busy || !dirty}>
            <Save className="h-4 w-4" aria-hidden /> {action.busy ? 'Saving…' : 'Save'}
          </SmallButton>
        )}
        <SmallButton variant="outline" onClick={preview}>
          <Eye className="h-4 w-4" aria-hidden /> Preview as player
        </SmallButton>
        {!readOnly && entry && (
          <SmallButton variant="outline" tone="danger" onClick={remove} disabled={action.busy}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete
          </SmallButton>
        )}
        {dirty && !action.error && (
          <span className="text-sm font-semibold text-warning">You have unsaved changes</span>
        )}
        <Status ok={dirty ? null : action.done} error={action.error} />
      </div>
      {readOnly && (
        <p className="mb-2 text-sm text-ink-muted">
          The Sample pack is read-only. Copy it to change anything.
        </p>
      )}
      <fieldset disabled={readOnly}>
        <Form
          value={draft}
          onChange={(v) => {
            setDraft(v);
            action.clear();
          }}
          errors={errors}
        />
      </fieldset>
      {previewing && (
        <PreviewModal
          taskKey={task}
          items={previewing}
          options={pack.options}
          onClose={() => setPreviewing(null)}
        />
      )}
    </Panel>
  );
}

// The Guess the Celebrity name players see, for this pack.
function CelebrityName({
  pack,
  onPack,
  readOnly,
}: {
  pack: PackDetail;
  onPack: (p: PackDetail) => void;
  readOnly: boolean;
}) {
  const { api } = useStaff();
  const [name, setName] = useState(pack.options.guessCelebrityTaskName);
  const action = useAction();
  return (
    <div className="flex items-end gap-2">
      <TextField
        className="w-80"
        label="Task name players see"
        value={name}
        onChange={setName}
        maxLength={40}
        help="For example “Guess the Leader”."
      />
      {!readOnly && (
        <SmallButton
          variant="outline"
          disabled={action.busy || name.trim() === pack.options.guessCelebrityTaskName}
          onClick={async () => {
            const next = await action.run(
              () =>
                api.patch<PackDetail>(`/packs/${pack.id}`, {
                  options: { ...pack.options, guessCelebrityTaskName: name },
                }),
              'Saved.',
            );
            if (next) onPack(next);
          }}
        >
          Save name
        </SmallButton>
      )}
      <span className="mb-1.5">
        <Status ok={action.done} error={action.error} />
      </span>
    </div>
  );
}
