import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Crown, Expand, PartyPopper, SearchX } from 'lucide-react';
import {
  TASKS_PER_TEAM,
  type ProjectorRowView,
  type ProjectorState,
  type ProjectorTeamView,
} from '@magic-potion/shared';
import { formatMs, money, msLeft } from '../lib/time';
import { PHASE_LABEL } from '../player/layout/Shell';
import { Branded } from '../player/PlayerApp';
import { PotionBottle, potionLabel } from '../player/ui/PotionBottle';

// The projector view (Phase 6D): the shared screen in the main Zoom room or on a hall screen.
// Everything is sized from the screen width, so it reads from the back of a room at 1280x720
// and 1920x1080 alike. It only shows what every team may see (GAME_RULES section 10): all teams
// and the potion, and no scores or ranks until Round 2.

const vw = (n: number): CSSProperties => ({ fontSize: `${n}vw` });

export function Projector({
  state,
  receivedAt,
  now,
}: {
  state: ProjectorState;
  receivedAt: number;
  now: number;
}) {
  const { game } = state;
  let body: ReactNode;
  if (game.phase === 'LOBBY') body = <Lobby state={state} />;
  else if (game.phase === 'PAUSE')
    body = <Halftime state={state} receivedAt={receivedAt} now={now} />;
  else if (game.phase === 'REVEAL') body = <Reveal state={state} />;
  else body = <Play state={state} receivedAt={receivedAt} now={now} />;
  return (
    <Branded branding={state.branding}>
      <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-page text-ink">
        <Header state={state} />
        <main className="min-h-0 flex-1">{body}</main>
      </div>
    </Branded>
  );
}

function Header({ state }: { state: ProjectorState }) {
  const { branding } = state;
  const [full, setFull] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  return (
    <header className="flex items-center gap-[1.2vw] px-[2.5vw] pt-[1.6vw]">
      {branding.logoUrl && (
        <img
          src={branding.logoUrl}
          alt=""
          className="h-[3.2vw] w-[3.2vw] rounded-lg object-contain"
        />
      )}
      <span className="font-extrabold" style={vw(1.8)}>
        {branding.clientName || 'Magic Potion'}
      </span>
      {!full && document.fullscreenEnabled !== false && (
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <Expand className="h-4 w-4" aria-hidden /> Full screen
        </button>
      )}
    </header>
  );
}

// ---------- Lobby ----------

function Lobby({ state }: { state: ProjectorState }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2vw]">
      <PotionBottle percent={0} size="fluid" className="w-[14vw]" />
      <h1 className="font-extrabold text-brand-soft" style={vw(5)}>
        The Magic Potion
      </h1>
      <p className="text-ink-muted" style={vw(2.2)}>
        Starting soon · {state.teams.length} teams
      </p>
    </div>
  );
}

// ---------- Round 1 and Round 2 ----------

function Clock({
  state,
  receivedAt,
  now,
}: {
  state: ProjectorState;
  receivedAt: number;
  now: number;
}) {
  const { game } = state;
  const left = msLeft(game.phaseMsLeft, receivedAt, !game.frozen, now);
  return (
    <div className="flex flex-col items-center leading-none">
      <span
        className={`font-bold tracking-wider uppercase ${game.frozen ? 'text-warning' : 'text-ink-muted'}`}
        style={vw(1.8)}
      >
        {game.frozen ? `${PHASE_LABEL[game.phase]} · Paused` : PHASE_LABEL[game.phase]}
      </span>
      {left !== null && (
        <span
          aria-label="Time left"
          className={`nums mt-[0.6vw] font-extrabold ${
            game.frozen ? 'text-warning' : left < 5 * 60_000 ? 'text-alert' : 'text-success'
          }`}
          style={vw(7.5)}
        >
          {formatMs(left)}
        </span>
      )}
    </div>
  );
}

function PotionBlock({ state, label }: { state: ProjectorState; label?: string }) {
  const { potion } = state;
  return (
    <div className="flex flex-col items-center gap-[0.8vw]">
      <PotionBottle percent={potion.percent} size="fluid" className="w-[11vw]" />
      <span className="nums font-extrabold text-accent" style={vw(4)}>
        {potionLabel(potion.percent)}
      </span>
      <span className="text-ink-muted" style={vw(1.5)}>
        {label ?? `${potion.completedTeams} of ${potion.totalTeams} teams done`}
      </span>
    </div>
  );
}

function Play({
  state,
  receivedAt,
  now,
}: {
  state: ProjectorState;
  receivedAt: number;
  now: number;
}) {
  return (
    <div className="grid h-full grid-cols-[30vw_1fr] gap-[2vw] px-[2.5vw] pt-[1vw] pb-[2vw]">
      <aside className="flex flex-col items-center justify-center gap-[2.5vw] rounded-[2vw] border border-line bg-card">
        <Clock state={state} receivedAt={receivedAt} now={now} />
        <PotionBlock state={state} />
      </aside>
      <section className="min-h-0">
        {state.leaderboard ? (
          <RankedList rows={state.leaderboard.rows} />
        ) : (
          <TeamGrid teams={state.teams} />
        )}
      </section>
    </div>
  );
}

function Dots({ done, size }: { done: number; size: number }) {
  return (
    <span className="flex gap-[0.35vw]" aria-hidden>
      {Array.from({ length: TASKS_PER_TEAM }, (_, i) => (
        <span
          key={i}
          className={`rounded-full ${i < done ? 'bg-success' : 'bg-card-raised'}`}
          style={{ width: `${size}vw`, height: `${size}vw` }}
        />
      ))}
    </span>
  );
}

// Text size by how many teams must fit (3 to 25).
function scaleFor(count: number): number {
  if (count <= 6) return 2.4;
  if (count <= 10) return 2;
  if (count <= 16) return 1.6;
  return 1.3;
}

// Round 1: every team's progress, by name. No scores, no ranks.
function TeamGrid({ teams }: { teams: ProjectorTeamView[] }) {
  const cols = teams.length <= 6 ? 2 : teams.length <= 12 ? 3 : 4;
  const size = scaleFor(teams.length);
  return (
    <ul
      className="grid h-full auto-rows-fr gap-[1vw]"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      aria-label="Teams"
    >
      {teams.map((t) => (
        <li
          key={t.id}
          className={`flex flex-col justify-center gap-[0.6vw] rounded-[1.2vw] border px-[1.2vw] ${
            t.tasksDone >= TASKS_PER_TEAM
              ? 'border-success/60 bg-success/10'
              : 'border-line bg-card'
          }`}
        >
          <span className="truncate font-bold" style={vw(size)}>
            {t.name}
          </span>
          <span className="flex items-center gap-[0.8vw]">
            <Dots done={t.tasksDone} size={size * 0.55} />
            <span className="nums font-extrabold" style={vw(size * 0.9)}>
              {t.tasksDone}/{TASKS_PER_TEAM}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Round 2: ranked, with scores.
function RankedList({ rows }: { rows: ProjectorRowView[] }) {
  const twoCols = rows.length > 12;
  const size = scaleFor(twoCols ? Math.ceil(rows.length / 2) * 1.4 : rows.length);
  return (
    <ol
      className={`grid h-full auto-rows-fr gap-x-[1.5vw] gap-y-[0.6vw] ${twoCols ? 'grid-cols-2 grid-flow-col' : ''}`}
      style={
        twoCols
          ? { gridTemplateRows: `repeat(${Math.ceil(rows.length / 2)}, minmax(0, 1fr))` }
          : undefined
      }
      aria-label="Leaderboard"
    >
      {rows.map((r) => (
        <Row key={r.teamId} row={r} size={size} />
      ))}
    </ol>
  );
}

function Row({
  row,
  size,
  winner = false,
}: {
  row: ProjectorRowView;
  size: number;
  winner?: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-[1.2vw] rounded-[1vw] border px-[1.2vw] ${
        winner ? 'border-accent bg-accent/15' : 'border-line bg-card'
      }`}
    >
      <span className="nums w-[3.5vw] font-extrabold text-warning" style={vw(size)}>
        {row.rank}
      </span>
      <span
        className="flex min-w-0 flex-1 items-center gap-[0.6vw] truncate font-bold"
        style={vw(size)}
      >
        {winner && <Crown className="h-[1em] w-[1em] shrink-0 text-accent" aria-hidden />}
        <span className="truncate">{row.name}</span>
      </span>
      <Dots done={row.tasksDone} size={size * 0.45} />
      <span className="nums w-[10vw] text-right font-extrabold" style={vw(size)}>
        {money(row.score)}
      </span>
    </li>
  );
}

// ---------- Pause ----------

function Halftime({
  state,
  receivedAt,
  now,
}: {
  state: ProjectorState;
  receivedAt: number;
  now: number;
}) {
  const half = state.potion.halftime ?? state.potion;
  const left = msLeft(state.game.phaseMsLeft, receivedAt, !state.game.frozen, now);
  return (
    <div className="flex h-full items-center justify-center gap-[5vw] px-[4vw]">
      <PotionBottle percent={half.percent} size="fluid" className="w-[18vw]" />
      <div className="flex flex-col gap-[1vw]">
        <span className="font-bold tracking-wider text-ink-muted uppercase" style={vw(2.4)}>
          Halftime potion
        </span>
        <span
          className="nums leading-none font-extrabold text-accent"
          style={vw(14)}
          aria-label="Halftime potion"
        >
          {potionLabel(half.percent)}
        </span>
        <span className="text-ink-muted" style={vw(2)}>
          {half.completedTeams} of {half.totalTeams} teams done
        </span>
        {left !== null && (
          <span className="mt-[1.5vw] font-semibold" style={vw(2.4)}>
            {state.game.frozen ? 'Paused' : `Round 2 starts in ${formatMs(left)}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------- Reveal ----------

// The Reveal runs one step per click (or Space / → / Page Down, as on a presenter remote):
// the two potions, then the verdict, then the teams from last place up to first.
export function revealSteps(teamCount: number): number {
  return 2 + teamCount;
}

function Reveal({ state }: { state: ProjectorState }) {
  const rows = state.leaderboard?.rows ?? [];
  const total = revealSteps(rows.length);
  const [step, setStep] = useState(0);
  const next = useCallback(() => setStep((s) => Math.min(total - 1, s + 1)), [total]);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ([' ', 'ArrowRight', 'PageDown', 'Enter'].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back]);

  const full = state.leaderboard?.valid ?? false;
  return (
    <div className="relative h-full cursor-pointer" onClick={next}>
      {step === 0 && <PotionPair state={state} />}
      {step === 1 && <Verdict full={full} bonus={state.fullPotionBonus} />}
      {step >= 2 && <RevealBoard rows={rows} shown={step - 1} full={full} />}
      <nav
        className="absolute right-[2vw] bottom-[1.2vw] flex items-center gap-2 text-sm text-ink-muted"
        onClick={(e) => e.stopPropagation()}
      >
        <span>
          Step {step + 1} of {total}
          {step < total - 1 && ' · Space or → for next'}
        </span>
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          aria-label="Previous step"
          className="rounded-md border border-line p-1 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={next}
          disabled={step === total - 1}
          aria-label="Next step"
          className="rounded-md border border-line p-1 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </nav>
    </div>
  );
}

function PotionPair({ state }: { state: ProjectorState }) {
  const half = state.potion.halftime;
  const final = state.finalPotion ?? state.potion;
  const card = (
    title: string,
    p: { percent: number; completedTeams: number; totalTeams: number } | null,
    hi: boolean,
  ) => (
    <div
      className={`rise-in flex flex-1 flex-col items-center gap-[1vw] rounded-[2vw] border py-[2.5vw] ${
        hi ? 'border-accent bg-accent/10' : 'border-line bg-card'
      }`}
    >
      <span className="font-bold tracking-wider text-ink-muted uppercase" style={vw(2)}>
        {title}
      </span>
      <PotionBottle percent={p?.percent ?? 0} size="fluid" className="w-[12vw]" />
      <span className="nums font-extrabold text-accent" style={vw(6)} aria-label={title}>
        {potionLabel(p?.percent ?? 0)}
      </span>
      <span className="text-ink-muted" style={vw(1.6)}>
        {p ? `${p.completedTeams} of ${p.totalTeams} teams done` : 'Not saved'}
      </span>
    </div>
  );
  const fullNow = final.totalTeams > 0 && final.completedTeams === final.totalTeams;
  return (
    <div className="flex h-full items-stretch gap-[3vw] px-[6vw] py-[2.5vw]">
      {card('At halftime', half, false)}
      {card('At the end', final, fullNow)}
    </div>
  );
}

function Verdict({ full, bonus }: { full: boolean; bonus: number }) {
  const Icon = full ? PartyPopper : SearchX;
  return (
    <div
      role="status"
      className="rise-in flex h-full flex-col items-center justify-center gap-[2vw] px-[6vw] text-center"
    >
      <Icon className={`h-[9vw] w-[9vw] ${full ? 'text-accent' : 'text-ink-muted'}`} aria-hidden />
      <h1 className="font-extrabold" style={vw(5.5)}>
        {full ? 'The potion is full!' : 'The potion is not full. Nobody wins.'}
      </h1>
      <p className="text-ink-muted" style={vw(2.4)}>
        {full
          ? `Every team gets the Full Potion Bonus of ${money(bonus)} points.`
          : 'Here are the scores.'}
      </p>
    </div>
  );
}

// The leaderboard, filled in from last place to first. Places not yet shown stay empty.
function RevealBoard({
  rows,
  shown,
  full,
}: {
  rows: ProjectorRowView[];
  shown: number;
  full: boolean;
}) {
  const twoCols = rows.length > 12;
  const perCol = twoCols ? Math.ceil(rows.length / 2) : rows.length;
  const size = scaleFor(twoCols ? perCol * 1.4 : rows.length);
  const firstShown = rows.length - shown;
  return (
    <div className="flex h-full flex-col px-[2.5vw] pt-[0.5vw] pb-[3.5vw]">
      <h1 className="mb-[1vw] font-extrabold text-brand-soft" style={vw(2.8)}>
        Final leaderboard
      </h1>
      <ol
        className={`grid min-h-0 flex-1 auto-rows-fr gap-x-[1.5vw] gap-y-[0.5vw] ${twoCols ? 'grid-cols-2 grid-flow-col' : ''}`}
        style={{ gridTemplateRows: `repeat(${perCol}, minmax(0, 1fr))` }}
        aria-label="Final leaderboard"
      >
        {rows.map((r, i) =>
          i >= firstShown ? (
            <Row key={r.teamId} row={r} size={size} winner={full && r.rank === 1} />
          ) : (
            <li
              key={r.teamId}
              aria-hidden
              className="rounded-[1vw] border border-dashed border-line/60"
            />
          ),
        )}
      </ol>
    </div>
  );
}
