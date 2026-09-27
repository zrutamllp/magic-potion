import { PartyPopper, SearchX } from 'lucide-react';
import { money } from '../../lib/time';
import { useGame } from '../GameContext';
import { ConnectionDot } from '../layout/Shell';
import { PotionMeter } from '../ui/PotionBottle';
import { LeaderboardBody } from './Leaderboard';

// The Reveal: the halftime potion and the final potion side by side, then the result and the
// leaderboard. If the potion is not full, nobody wins, and the scores are still shown.

// The parts appear one after another, like a reveal on stage.
const step = (i: number) => ({ animationDelay: `${i * 0.9}s` });

export function Reveal() {
  const { state } = useGame();
  const { potion, leaderboard } = state;
  const full = potion.totalTeams > 0 && potion.completedTeams === potion.totalTeams;
  const bonus = money(state.settings.scoring.fullPotionBonus);

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="grid grid-cols-3 items-center">
        <span className="text-xl font-bold text-ink-muted">{state.team.name}</span>
        <h1 className="rise-in text-center text-4xl font-extrabold">The Reveal</h1>
        <span className="justify-self-end">
          <ConnectionDot />
        </span>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-5">
        <div className="rise-in rounded-3xl border border-line bg-card p-4" style={step(1)}>
          <PotionMeter
            percent={potion.halftime?.percent ?? 0}
            completedTeams={potion.halftime?.completedTeams ?? 0}
            totalTeams={potion.halftime?.totalTeams ?? potion.totalTeams}
            size="lg"
            label="At halftime"
          />
        </div>
        <div
          className={`rise-in rounded-3xl border p-4 ${full ? 'border-accent bg-accent/10' : 'border-line bg-card'}`}
          style={step(2)}
        >
          <PotionMeter
            percent={potion.percent}
            completedTeams={potion.completedTeams}
            totalTeams={potion.totalTeams}
            size="lg"
            label="At the end"
          />
        </div>
      </section>

      <section
        className={`rise-in mt-5 flex items-center justify-center gap-4 rounded-3xl border-2 p-5 text-center ${
          full ? 'border-success bg-success/15' : 'border-danger bg-danger/15'
        }`}
        style={step(3)}
        role="status"
      >
        {full ? (
          <PartyPopper className="h-12 w-12 shrink-0 text-success" aria-hidden />
        ) : (
          <SearchX className="h-12 w-12 shrink-0 text-danger" aria-hidden />
        )}
        <div>
          <p className={`text-4xl font-extrabold ${full ? 'text-success' : 'text-danger'}`}>
            {full ? 'The potion is full!' : 'The potion is not full. Nobody wins.'}
          </p>
          <p className="mt-1 text-xl">
            {full
              ? `Every team gets the Full Potion Bonus of ${bonus} points.`
              : 'Here are the scores.'}
          </p>
        </div>
      </section>

      {leaderboard && (
        <section className="rise-in mt-8" style={step(4)}>
          <h2 className="mb-4 text-3xl font-extrabold text-alert">Final leaderboard</h2>
          <LeaderboardBody state={state} />
        </section>
      )}
    </main>
  );
}
