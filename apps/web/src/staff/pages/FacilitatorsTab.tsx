import { useEffect, useState } from 'react';
import type { AdminGame, StaffMember } from '@magic-potion/shared';
import { errorText, useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, useAction } from '../ui';
import type { GameTabProps } from './GamePage';

// Which teams each co-facilitator looks after in this game. They see and help only those teams.

export function FacilitatorsTab({ game, onChange }: GameTabProps) {
  const { api, go } = useStaff();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.get<StaffMember[]>('/users').then(setStaff, (e: unknown) => setLoadError(errorText(e)));
  }, [api]);

  const facilitators = staff?.filter((s) => s.role === 'CO_FACILITATOR' && s.active) ?? [];
  const teamName = new Map(game.teams.map((t) => [t.id, t.name]));
  // Teams nobody looks after yet (the main admin always sees every team).
  const unassigned = game.teams.filter(
    (t) => !Object.values(game.assignments).some((ids) => ids.includes(t.id)),
  );

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <Status error={loadError} />
      {staff && facilitators.length === 0 && (
        <Panel>
          <p>No co-facilitators yet.</p>
          <SmallButton className="mt-3" variant="outline" onClick={() => go({ page: 'staff' })}>
            Add a co-facilitator
          </SmallButton>
        </Panel>
      )}
      {facilitators.map((f) => (
        <Assign key={f.id} game={game} member={f} onChange={onChange} />
      ))}
      {facilitators.length > 0 && (
        <p className="text-base text-ink-muted">
          {unassigned.length === 0
            ? 'Every team has a co-facilitator.'
            : `Not given to anyone yet: ${unassigned.map((t) => teamName.get(t.id)).join(', ')}.`}
        </p>
      )}
    </div>
  );
}

function Assign({ game, member, onChange }: GameTabProps & { member: StaffMember }) {
  const { api } = useStaff();
  const saved = game.assignments[member.id] ?? [];
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(saved));
  const action = useAction();
  const dirty = chosen.size !== saved.length || saved.some((id) => !chosen.has(id));

  function toggle(id: string) {
    action.clear();
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    const updated = await action.run(
      () =>
        api.put<AdminGame>(`/games/${game.id}/assignments`, {
          staffUserId: member.id,
          // In the order of the team list.
          teamIds: game.teams.filter((t) => chosen.has(t.id)).map((t) => t.id),
        }),
      'Saved.',
    );
    if (updated) onChange(updated);
  }

  return (
    <Panel
      title={member.name}
      right={
        <span className="flex items-center gap-3">
          <Status ok={action.done} error={action.error} />
          <span className="text-sm text-ink-muted">{chosen.size} teams</span>
          <SmallButton onClick={save} disabled={!dirty || action.busy}>
            {action.busy ? 'Saving…' : 'Save'}
          </SmallButton>
        </span>
      }
    >
      <p className="-mt-2 mb-2 text-sm text-ink-muted">{member.email}</p>
      <div className="grid grid-cols-4 gap-x-4 gap-y-1">
        {game.teams.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={chosen.has(t.id)}
              onChange={() => toggle(t.id)}
              className="h-4 w-4 accent-brand"
            />
            {t.name}
          </label>
        ))}
      </div>
    </Panel>
  );
}
