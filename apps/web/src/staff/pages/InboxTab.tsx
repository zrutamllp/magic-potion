import { useEffect, useMemo, useState } from 'react';
import type { AdminInboxItem } from '@magic-potion/shared';
import { formatMs } from '../../lib/time';
import { AnswersField, TextField, cleanLines } from '../packs/fields';
import { useUnsavedChanges } from '../router';
import { errorText, useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, useAction } from '../ui';
import type { GameTabProps } from './GamePage';

// The 3 inbox bonus tasks: the team photo and 2 questions. Release times and the reward are on
// the Settings tab. Locked when Round 1 starts.

export function InboxTab({ game }: GameTabProps) {
  const { api, go } = useStaff();
  const [saved, setSaved] = useState<AdminInboxItem[] | null>(null);
  const [items, setItems] = useState<AdminInboxItem[]>([]);
  const [locked, setLocked] = useState(game.locked);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const action = useAction();

  useEffect(() => {
    api.get<{ locked: boolean; items: AdminInboxItem[] }>(`/games/${game.id}/inbox`).then(
      (r) => {
        setSaved(r.items);
        setItems(r.items);
        setLocked(r.locked);
      },
      (e: unknown) => setLoadError(errorText(e)),
    );
  }, [api, game.id]);

  const dirty = useMemo(
    () => !locked && saved !== null && JSON.stringify(saved) !== JSON.stringify(items),
    [locked, saved, items],
  );
  useUnsavedChanges(dirty);

  function patch(id: string, p: Partial<AdminInboxItem>) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));
    action.clear();
  }

  async function save() {
    const found: Record<string, string> = {};
    for (const i of items) {
      if (!i.title.trim()) found[`${i.id}.title`] = 'Give it a title.';
      if (!i.body.trim()) found[`${i.id}.body`] = 'Write the text players see.';
      if (i.kind === 'QUESTION' && cleanLines(i.answers).length === 0)
        found[`${i.id}.answers`] = 'Add at least one accepted answer.';
    }
    setProblems(found);
    if (Object.keys(found).length > 0) {
      action.setError('Some fields need fixing. They are marked in red.');
      return;
    }
    const r = await action.run(
      () =>
        api.put<{ locked: boolean; items: AdminInboxItem[] }>(`/games/${game.id}/inbox`, {
          items: items.map((i) => ({
            id: i.id,
            title: i.title.trim(),
            body: i.body.trim(),
            answers: cleanLines(i.answers),
          })),
        }),
      'Saved.',
    );
    if (r) {
      setSaved(r.items);
      setItems(r.items);
    }
  }

  if (!saved) return <Status error={loadError} />;

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-6 flex items-center gap-3 border-b border-line bg-page px-6 py-3">
        <SmallButton onClick={save} disabled={locked || !dirty || action.busy}>
          {action.busy ? 'Saving…' : 'Save inbox'}
        </SmallButton>
        {dirty && !action.error && (
          <span className="font-semibold text-warning">You have unsaved changes</span>
        )}
        <Status ok={dirty ? null : action.done} error={action.error} />
      </div>
      <p className="text-sm text-ink-muted">
        Each bonus task is worth the reward set on the{' '}
        <button
          type="button"
          className="text-brand-soft underline"
          onClick={() => go({ page: 'game', gameId: game.id, tab: 'settings' })}
        >
          Settings
        </button>{' '}
        tab ({game.settings.inbox.reward.toLocaleString('en-IN')} points), and arrives at the play
        time set there. Questions allow {game.settings.inbox.answerAttempts} tries.
      </p>
      <fieldset disabled={locked} className="grid grid-cols-3 items-start gap-4">
        {items.map((item, n) => (
          <Panel key={item.id} title={item.kind === 'PHOTO' ? 'Team photo' : `Question ${n}`}>
            <p className="-mt-2 mb-2 text-xs text-ink-muted">
              Arrives after{' '}
              {item.releaseAtPlaySeconds === null
                ? '—'
                : formatMs(item.releaseAtPlaySeconds * 1000)}{' '}
              of play
            </p>
            <div className="flex flex-col gap-3">
              <TextField
                label="Title"
                value={item.title}
                onChange={(title) => patch(item.id, { title })}
                error={problems[`${item.id}.title`]}
                maxLength={60}
              />
              <TextField
                label={item.kind === 'PHOTO' ? 'What players see' : 'Question'}
                value={item.body}
                onChange={(body) => patch(item.id, { body })}
                error={problems[`${item.id}.body`]}
                multiline
                maxLength={300}
              />
              {item.kind === 'QUESTION' && (
                <AnswersField
                  value={item.answers}
                  onChange={(answers) => patch(item.id, { answers })}
                  error={problems[`${item.id}.answers`]}
                  help="One per line. Case and extra spaces do not matter."
                />
              )}
              {item.kind === 'PHOTO' && (
                <p className="text-xs text-ink-muted">
                  A team uploads a photo of the whole team. It is accepted at once; staff can reject
                  it.
                </p>
              )}
            </div>
          </Panel>
        ))}
      </fieldset>
    </div>
  );
}
