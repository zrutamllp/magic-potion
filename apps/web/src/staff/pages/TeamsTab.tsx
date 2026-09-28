import { useState, type FormEvent } from 'react';
import { Download, KeyRound, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import {
  MAX_TEAMS,
  type AdminGame,
  type AdminTeam,
  type TeamLoginCard,
} from '@magic-potion/shared';
import { downloadLoginCsv, mergeLogins, printLoginSheet } from '../loginSheet';
import { useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, inputClass, useAction } from '../ui';
import type { GameTabProps } from './GamePage';

// Team names, codes and passwords. Passwords are stored hashed, so they show only right after
// they are made (new teams or a reset), with the printable login sheet.

export function TeamsTab({ game, onChange }: GameTabProps) {
  const { api, freshLogins, setFreshLogins } = useStaff();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const reset = useAction();
  // Teams deleted since their password was shown drop off the sheet.
  const logins =
    freshLogins?.gameId === game.id
      ? freshLogins.logins.filter((l) => game.teams.some((t) => t.code === l.code))
      : [];

  function showLogins(added: TeamLoginCard[]) {
    setFreshLogins({ gameId: game.id, logins: mergeLogins(logins, added) });
  }

  async function resetPasswords() {
    const ids = [...selected];
    const who =
      ids.length === 0 ? 'every team' : `${ids.length} team${ids.length === 1 ? '' : 's'}`;
    if (
      !window.confirm(
        `Make new passwords for ${who}? Their old passwords stop working and they are logged out.`,
      )
    ) {
      return;
    }
    const cards = await reset.run(
      () =>
        api.post<TeamLoginCard[]>(`/games/${game.id}/teams/reset-passwords`, {
          teamIds: ids.length ? ids : undefined,
        }),
      'New passwords made. They are in the login sheet below.',
    );
    if (cards) {
      showLogins(cards);
      setSelected(new Set());
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-[1fr_22rem] items-start gap-5">
      <div className="flex flex-col gap-4">
        {logins.length > 0 && (
          <LoginSheet game={game} logins={logins} onHide={() => setFreshLogins(null)} />
        )}
        <Panel
          title={`Teams (${game.teams.length})`}
          right={
            <SmallButton variant="outline" onClick={resetPasswords} disabled={reset.busy}>
              <KeyRound className="h-4 w-4" aria-hidden />
              {selected.size
                ? `New passwords for ${selected.size} selected`
                : 'New passwords for all'}
            </SmallButton>
          }
        >
          <Status ok={reset.done} error={reset.error} />
          <table className="w-full text-left text-base">
            <thead className="text-sm text-ink-muted">
              <tr>
                <th className="w-8 py-1">
                  <span className="sr-only">Select</span>
                </th>
                <th className="py-1">Team</th>
                <th className="py-1">Team code</th>
                <th className="py-1 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {game.teams.map((t) => (
                <TeamRow
                  key={t.id}
                  game={game}
                  team={t}
                  selected={selected.has(t.id)}
                  onToggle={() => toggle(t.id)}
                  onChange={onChange}
                />
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      <AddTeams game={game} onChange={onChange} onLogins={showLogins} />
    </div>
  );
}

function TeamRow({
  game,
  team,
  selected,
  onToggle,
  onChange,
}: {
  game: AdminGame;
  team: AdminTeam;
  selected: boolean;
  onToggle: () => void;
  onChange: (g: AdminGame) => void;
}) {
  const { api } = useStaff();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const action = useAction();

  async function save(e: FormEvent) {
    e.preventDefault();
    const updated = await action.run(() =>
      api.patch<AdminGame>(`/games/${game.id}/teams/${team.id}`, { name }),
    );
    if (updated) {
      onChange(updated);
      setEditing(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${team.name}? Its login stops working.`)) return;
    const updated = await action.run(() =>
      api.del<AdminGame>(`/games/${game.id}/teams/${team.id}`),
    );
    if (updated) onChange(updated);
  }

  return (
    <tr>
      <td className="py-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${team.name}`}
          className="h-4 w-4 accent-brand"
        />
      </td>
      <td className="py-1.5">
        {editing ? (
          <form onSubmit={save} className="flex items-center gap-2">
            <input
              aria-label="Team name"
              className={`${inputClass} w-56`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
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
          <span className="font-semibold">{team.name}</span>
        )}
        <Status error={action.error} />
      </td>
      <td className="py-1.5 font-mono text-lg tracking-wide">{team.code}</td>
      <td className="py-1.5 text-right whitespace-nowrap">
        {!game.locked && !editing && (
          <>
            <button
              type="button"
              aria-label={`Rename ${team.name}`}
              onClick={() => {
                setName(team.name);
                setEditing(true);
              }}
              className="mr-3 text-ink-muted hover:text-ink"
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Delete ${team.name}`}
              onClick={remove}
              className="text-ink-muted hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function AddTeams({
  game,
  onChange,
  onLogins,
}: GameTabProps & { onLogins: (logins: TeamLoginCard[]) => void }) {
  const { api } = useStaff();
  const [count, setCount] = useState('1');
  const [names, setNames] = useState('');
  const action = useAction();
  const room = MAX_TEAMS - game.teams.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const list = names
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);
    // Names typed in decide the count when there are more of them.
    const n = Math.max(Number(count) || 0, list.length);
    if (n < 1 || n > room) {
      action.setError(`You can add from 1 to ${room} teams.`);
      return;
    }
    if (list.some((name) => name.length > 40)) {
      action.setError('Team names can be up to 40 letters.');
      return;
    }
    const result = await action.run(
      () =>
        api.post<{ game: AdminGame; logins: TeamLoginCard[] }>(`/games/${game.id}/teams`, {
          count: n,
          names: list,
        }),
      `${n} team${n === 1 ? '' : 's'} added.`,
    );
    if (result) {
      onChange(result.game);
      onLogins(result.logins);
      setNames('');
      setCount('1');
    }
  }

  if (game.locked) {
    return (
      <Panel title="Add teams">
        <p className="text-ink-muted">Teams cannot be added after the game has started.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Add teams">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="block font-semibold">
          How many
          <input
            type="number"
            min={1}
            max={Math.max(room, 1)}
            className={`${inputClass} mt-1`}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </label>
        <label className="block font-semibold">
          Names (optional, one per line)
          <textarea
            rows={4}
            className={`${inputClass} mt-1`}
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder={'Owls\nFalcons'}
          />
        </label>
        <p className="text-sm text-ink-muted">
          Teams without a name are called “Team 7” and so on. Every team gets its own code and
          password. {room} more can be added (a game has at most {MAX_TEAMS}).
        </p>
        <Status ok={action.done} error={action.error} />
        <SmallButton type="submit" disabled={action.busy || room === 0}>
          <Plus className="h-4 w-4" aria-hidden /> {action.busy ? 'Adding…' : 'Add teams'}
        </SmallButton>
      </form>
    </Panel>
  );
}

function LoginSheet({
  game,
  logins,
  onHide,
}: {
  game: AdminGame;
  logins: TeamLoginCard[];
  onHide: () => void;
}) {
  const [blocked, setBlocked] = useState(false);
  const client = game.settings.branding.clientName;
  return (
    <Panel
      title="Login sheet"
      className="border-warning/60"
      right={
        <span className="flex gap-2">
          <SmallButton onClick={() => setBlocked(!printLoginSheet(game.name, client, logins))}>
            <Printer className="h-4 w-4" aria-hidden /> Print login sheet
          </SmallButton>
          <SmallButton variant="outline" onClick={() => downloadLoginCsv(game.name, logins)}>
            <Download className="h-4 w-4" aria-hidden /> Download CSV
          </SmallButton>
          <SmallButton variant="outline" tone="muted" onClick={onHide}>
            Hide
          </SmallButton>
        </span>
      }
    >
      <p className="mb-2 text-base text-warning">
        Print or download these now. Passwords are shown only once. If one is lost, make a new
        password for that team.
      </p>
      {blocked && (
        <p role="alert" className="mb-2 text-danger">
          Your browser blocked the print window. Allow pop-ups for this site and try again.
        </p>
      )}
      <ul className="grid grid-cols-3 gap-2">
        {logins.map((l) => (
          <li key={l.code} className="rounded-lg border border-line bg-page px-3 py-1.5">
            <p className="truncate font-semibold">{l.name}</p>
            <p className="font-mono text-sm">
              {l.code} · {l.password}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
