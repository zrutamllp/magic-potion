import type { StaffTeamView } from '@magic-potion/shared';
import { useStaff } from '../StaffContext';
import { SmallButton, Status, useAction } from '../ui';
import { useLiveView } from './context';

// Testing aids, shown only when the server runs with ENABLE_DEV_TOOLS (never in production) and
// only to the main admin: the fragment values this team needs, and "Finish all 5 tasks".
// Players never see any of this.
export function DevTools({ team }: { team: StaffTeamView }) {
  const { api } = useStaff();
  const { state, isAdmin, gameId } = useLiveView();
  const action = useAction();
  if (!state.devTools || !isAdmin) return null;
  const fragments = (state.devFragments ?? []).filter((f) => f.neededByTeamId === team.id);
  return (
    <section
      aria-label="Dev tools"
      className="rounded-xl border border-dashed border-warning/60 bg-warning/5 p-3"
    >
      <h3 className="text-sm font-bold tracking-wide text-warning uppercase">
        Dev tools (testing only)
      </h3>
      {fragments.length > 0 && (
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-0.5">Fragment</th>
              <th className="py-0.5">Held by</th>
              <th className="py-0.5">Value</th>
            </tr>
          </thead>
          <tbody>
            {fragments.map((f) => (
              <tr key={`${f.kind}:${f.holderTeamName}`}>
                <td className="py-0.5">{f.kind === 'VAULT' ? 'Vault' : 'Find the Code'}</td>
                <td className="py-0.5">{f.holderTeamName}</td>
                <td className="py-0.5 font-mono">{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <SmallButton
        variant="outline"
        className="mt-2 px-2 py-0.5 text-sm"
        disabled={action.busy || team.status === 'REMOVED'}
        onClick={() =>
          action.run(
            () => api.post(`/games/${gameId}/dev/finish-tasks/${team.id}`),
            'All 5 tasks finished.',
          )
        }
      >
        Finish all 5 tasks
      </SmallButton>
      <Status ok={action.done} error={action.error} />
    </section>
  );
}
