import { formatMs } from '../../lib/time';
import { useGame } from '../GameContext';
import { ConnectionDot } from '../layout/Shell';
import { PotionMeter } from '../ui/PotionBottle';

// The Pause: everything is frozen, and players see only the potion (GAME_RULES section 2).

export function PauseScreen() {
  const { state, phaseMsLeft } = useGame();
  const { potion } = state;
  const left = phaseMsLeft();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="absolute top-5 left-6 text-xl font-bold text-ink-muted">
        {state.team.name}
      </div>
      <div className="absolute top-6 right-6">
        <ConnectionDot />
      </div>
      <h1 className="text-6xl font-extrabold">Pause</h1>
      <PotionMeter
        percent={potion.percent}
        completedTeams={potion.completedTeams}
        totalTeams={potion.totalTeams}
        size="xl"
        label="The Magic Potion"
      />
      <p className="text-3xl">
        {state.game.frozen ? (
          <span className="text-warning">Paused by the facilitator</span>
        ) : (
          <>
            Round 2 starts in{' '}
            <span className="nums font-extrabold text-success">{formatMs(left)}</span>
          </>
        )}
      </p>
    </main>
  );
}
