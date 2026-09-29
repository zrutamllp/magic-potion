import { useProjectorLive } from '../lib/live';
import { useTicker } from '../lib/time';
import { useStaff } from '../staff/StaffContext';
import { Projector } from './Projector';

// The projector window: opened from the live dashboard, shown full screen to the room.
export function ProjectorPage({ gameId }: { gameId: string }) {
  const { login } = useStaff();
  const live = useProjectorLive(login.token, gameId);
  const now = useTicker(250);
  if (live.ended || live.problem || !live.snapshot) {
    return (
      <main className="flex h-screen items-center justify-center p-8 text-2xl text-ink-muted">
        {live.ended ?? live.problem ?? 'Connecting to the game…'}
      </main>
    );
  }
  return <Projector state={live.snapshot.state} receivedAt={live.snapshot.receivedAt} now={now} />;
}
