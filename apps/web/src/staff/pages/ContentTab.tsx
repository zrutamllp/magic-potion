import { useEffect, useState } from 'react';
import type { GameContentInfo, PackDetail, PackSummary } from '@magic-potion/shared';
import { useUnsavedChanges } from '../router';
import { errorText, useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, inputBase, useAction } from '../ui';
import type { GameTabProps } from './GamePage';

// Which content pack the game plays, and the one Ethical Dilemma scenario every team gets.
// In the Lobby the game follows the pack's latest content; from Round 1 it keeps its own copy.

export function ContentTab({ game }: GameTabProps) {
  const { api, go } = useStaff();
  const [info, setInfo] = useState<GameContentInfo | null>(null);
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [packId, setPackId] = useState<string>('');
  const [dilemmaId, setDilemmaId] = useState<string | null>(null);
  const [dilemmas, setDilemmas] = useState<{ id: string; scenario: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // True while another pack's scenarios load: the old ones must not be picked meanwhile.
  const [loadingPack, setLoadingPack] = useState(false);
  const action = useAction();

  useEffect(() => {
    // A load that is no longer current (the tab was left or reloaded) must not overwrite choices.
    let current = true;
    Promise.all([
      api.get<GameContentInfo>(`/games/${game.id}/content`),
      api.get<PackSummary[]>('/packs'),
    ]).then(
      ([i, p]) => {
        if (!current) return;
        setInfo(i);
        setPacks(p);
        setPackId(i.packId ?? '');
        setDilemmaId(i.dilemmaItemId ?? i.dilemmas[0]?.id ?? null);
        setDilemmas(i.dilemmas);
      },
      (e: unknown) => current && setLoadError(errorText(e)),
    );
    return () => {
      current = false;
    };
  }, [api, game.id]);

  // Choosing another pack shows its scenarios before saving.
  async function choosePack(id: string) {
    setPackId(id);
    action.clear();
    if (id === info?.packId) {
      setDilemmas(info.dilemmas);
      setDilemmaId(info.dilemmaItemId ?? info.dilemmas[0]?.id ?? null);
      return;
    }
    setLoadingPack(true);
    const detail = await action.run(() => api.get<PackDetail>(`/packs/${id}`));
    setLoadingPack(false);
    if (!detail) return;
    const list = detail.items
      .filter((i) => i.taskKey === 'ethical_dilemma')
      .map((i) => ({ id: i.id, scenario: (i.publicData as { scenario: string }).scenario }));
    setDilemmas(list);
    setDilemmaId(list[0]?.id ?? null);
  }

  const locked = info?.locked ?? game.locked;
  const dirty =
    !locked &&
    info !== null &&
    (packId !== (info.packId ?? '') ||
      dilemmaId !== (info.dilemmaItemId ?? info.dilemmas[0]?.id ?? null));
  useUnsavedChanges(dirty);

  async function save() {
    const next = await action.run(
      () =>
        api.put<GameContentInfo>(`/games/${game.id}/content`, { packId, dilemmaItemId: dilemmaId }),
      'Saved. Teams in the Lobby get the new content at once.',
    );
    if (next) {
      setInfo(next);
      setDilemmas(next.dilemmas);
      setDilemmaId(next.dilemmaItemId ?? next.dilemmas[0]?.id ?? null);
    }
  }

  if (!info || !packs) return <Status error={loadError} />;
  const chosen = packs.find((p) => p.id === packId);

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-6 flex items-center gap-3 border-b border-line bg-page px-6 py-3">
        <SmallButton
          onClick={save}
          disabled={locked || !dirty || action.busy || loadingPack || !packId}
        >
          {action.busy ? 'Saving…' : 'Save content'}
        </SmallButton>
        {dirty && !action.error && (
          <span className="font-semibold text-warning">You have unsaved changes</span>
        )}
        <Status ok={dirty ? null : action.done} error={action.error} />
      </div>
      <Panel title="Content pack">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Content pack"
            className={`${inputBase} min-w-80`}
            value={packId}
            disabled={locked}
            onChange={(e) => void choosePack(e.target.value)}
          >
            {!info.packId && <option value="">Content from before packs</option>}
            {packs.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.ready}>
                {p.name}
                {p.ready ? '' : ' (not ready)'}
              </option>
            ))}
          </select>
          {chosen && (
            <SmallButton
              variant="outline"
              tone="muted"
              onClick={() => go({ page: 'pack', packId: chosen.id, task: 'vault' })}
            >
              {chosen.builtIn ? 'View pack' : 'Edit pack'}
            </SmallButton>
          )}
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          {locked
            ? 'The game has started, so it keeps the content it started with. Editing the pack no longer changes this game.'
            : 'Until Round 1 starts, this game always uses the pack’s latest content. Packs that are not ready cannot be chosen.'}
        </p>
        {info.readiness && packId === info.packId && info.readiness.warnings.length > 0 && (
          <ul className="mt-2 list-disc pl-6 text-sm text-warning">
            {info.readiness.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Ethical Dilemma scenario">
        <p className="mb-2 text-sm text-ink-muted">
          Every team that draws Ethical Dilemma gets this one scenario.
        </p>
        {dilemmas.length === 0 && (
          <p className="text-ink-muted">This pack has no dilemma scenarios.</p>
        )}
        <fieldset disabled={locked || loadingPack} className="flex flex-col gap-2">
          <legend className="sr-only">Scenario</legend>
          {dilemmas.map((d, i) => (
            <label
              key={d.id}
              className={`flex gap-3 rounded-xl border p-3 ${dilemmaId === d.id ? 'border-brand bg-brand/10' : 'border-line'}`}
            >
              <input
                type="radio"
                name="dilemma"
                className="mt-1 accent-brand"
                checked={dilemmaId === d.id}
                onChange={() => {
                  setDilemmaId(d.id);
                  action.clear();
                }}
                aria-label={`Scenario ${i + 1}`}
              />
              <span className="text-sm">{d.scenario}</span>
            </label>
          ))}
        </fieldset>
      </Panel>
    </div>
  );
}
