import { useEffect, type ComponentType, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, Hourglass, Play, RotateCcw, XCircle } from 'lucide-react';
import type { AttemptResult, PlayerTaskView } from '@magic-potion/shared';
import { formatMs, money } from '../../lib/time';
import { useGame } from '../GameContext';
import { lockTimesText } from '../rules';
import { startBlock } from '../screens/Home';
import { TASK_LOOK } from '../tasks';
import { Button, Card, Chip, TONE_BG, TONE_TEXT } from '../ui/basics';
import { AlienTranslator } from './AlienTranslator';
import { DataStory } from './DataStory';
import { EthicalDilemma } from './EthicalDilemma';
import { FIND_CODE_ELSEWHERE, FindCode } from './FindCode';
import { Hangman } from './Hangman';
import {
  GiveUpCard,
  GiveUpInline,
  HintCard,
  HintInline,
  TriesCard,
  hasHint,
  hasLockout,
  type Running,
} from './parts';
import { PicturePuzzle } from './PicturePuzzle';
import { Riddle } from './Riddle';
import { SpotDifference } from './SpotDifference';
import { VAULT_ELSEWHERE, Vault } from './Vault';

// One task: the brief, then the play screen with timer, hint, tries and Give up, then the
// result. Every answer is checked on the server; this screen only shows and sends.

export interface TaskPlayProps {
  task: PlayerTaskView;
  running: Running;
  view: unknown;
  // Full-width tasks show the hint and Give up themselves, in a compact form.
  hint?: ReactNode;
  giveUp?: ReactNode;
}

// Tasks that need the whole width (pictures, dashboards, long text) to fit 1280x720 without
// scrolling. They have no tries card; the hint and Give up are compact.
const WIDE: readonly PlayerTaskView['key'][] = [
  'alien_translator',
  'ethical_dilemma',
  'picture_puzzle',
  'spot_difference',
  'data_story',
];

// Tasks with their own play screen. The others show a placeholder until their batch is built.
const PLAY: Partial<Record<PlayerTaskView['key'], ComponentType<TaskPlayProps>>> = {
  vault: Vault,
  alien_translator: AlienTranslator,
  find_code: FindCode,
  picture_puzzle: PicturePuzzle,
  spot_difference: SpotDifference,
  data_story: DataStory,
  riddle: Riddle,
  hangman: Hangman,
  ethical_dilemma: EthicalDilemma,
};

// Tasks that need something from outside the team's screen say so, as a plain fact.
const ELSEWHERE: Partial<Record<PlayerTaskView['key'], string>> = {
  vault: VAULT_ELSEWHERE,
  find_code: FIND_CODE_ELSEWHERE,
};

const RESULT_TEXT: Partial<Record<AttemptResult, string>> = {
  FAILED_TIMEOUT: 'The timer ran out.',
  GAVE_UP: 'You gave up.',
  FAILED_WRONG: 'Too many wrong letters.',
  STOPPED_AT_END: 'Play ended before this task was finished.',
};

export function TaskScreen({ taskId }: { taskId: string }) {
  const { state, go } = useGame();
  const task = state.team.tasks.find((t) => t.id === taskId);
  // Each new stage (brief, a try, the result) starts at the top, so its main button shows.
  const stage = task ? `${task.status}:${task.running?.number ?? 0}` : '';
  useEffect(() => {
    document.scrollingElement?.scrollTo?.({ top: 0 });
  }, [stage]);

  if (!task) {
    return (
      <Card>
        <p className="text-xl">That task was not found.</p>
        <Button className="mt-4" onClick={() => go({ tab: 'home' })}>
          Back to Home
        </Button>
      </Card>
    );
  }

  const running = task.running;
  const Play = PLAY[task.key];
  return (
    <div className="space-y-4">
      <TaskHeader task={task} />
      {task.status === 'DONE' ? (
        <Solved task={task} />
      ) : running && Play && WIDE.includes(task.key) ? (
        <Play
          key={running.number}
          task={task}
          running={running}
          view={running.view}
          hint={hasHint(task) ? <HintInline task={task} running={running} /> : null}
          giveUp={<GiveUpInline task={task} />}
        />
      ) : running ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* A new try gets a fresh screen. */}
            {Play ? (
              <Play key={running.number} task={task} running={running} view={running.view} />
            ) : (
              <Placeholder />
            )}
          </div>
          <div className="space-y-4">
            <HintCard task={task} running={running} />
            <TriesCard task={task} running={running} />
            <GiveUpCard task={task} />
          </div>
        </div>
      ) : (
        <Brief task={task} />
      )}
    </div>
  );
}

function TaskHeader({ task }: { task: PlayerTaskView }) {
  const { go, timerMsLeft } = useGame();
  // The Vault shows its marker (GAME_RULES section 4) next to the name while it is open.
  const marker =
    task.key === 'vault'
      ? ((task.running?.view as { marker?: string | null } | undefined)?.marker ?? null)
      : null;
  const look = TASK_LOOK[task.key];
  const Icon = look.icon;
  return (
    <Card className="flex flex-wrap items-center gap-4 py-3">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-xl ${TONE_BG[look.tone]} ${TONE_TEXT[look.tone]}`}
      >
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={task.type === 'COMMON' ? 'brand' : 'info'}>
            {task.type === 'COMMON' ? 'Common' : 'Unique'}
          </Chip>
          <Chip tone="warning">{money(task.points)} points</Chip>
        </div>
        <h1 className="flex items-center gap-3 text-3xl leading-tight font-extrabold">
          {task.name}
          {marker && (
            <span
              className="flex items-center gap-2 rounded-xl border-2 border-warning/60 bg-warning/10 px-3 py-0.5 text-xl font-bold"
              aria-label={`Vault ${marker}`}
            >
              Vault <span className="text-2xl leading-none">{marker}</span>
            </span>
          )}
        </h1>
      </div>
      {task.running && (
        <div className="text-right leading-tight">
          <span className="text-sm font-bold tracking-wider text-ink-muted uppercase">
            Task timer
          </span>
          <p className="nums text-5xl font-extrabold text-info" aria-label="Task time left">
            {formatMs(timerMsLeft(task.running.msLeft))}
          </p>
        </div>
      )}
      <Button tone="muted" variant="outline" onClick={() => go({ tab: 'home' })}>
        <ArrowLeft className="h-5 w-5" aria-hidden /> Exit
      </Button>
    </Card>
  );
}

// Before Start (or after a fail): the facts of the task, then Start Task / Try again.
function Brief({ task }: { task: PlayerTaskView }) {
  const { state, act, send } = useGame();
  const { tasks } = state.settings;
  const blocked = startBlock(state, task);
  const paused = !state.game.timersRunning;
  const failed = task.status === 'FAILED' || task.lastResult === 'STOPPED_AT_END';
  const minutes = Math.round(task.timerSeconds / 60);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        {failed && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-danger/60 bg-danger/15 px-4 py-3">
            <XCircle className="h-7 w-7 shrink-0 text-danger" aria-hidden />
            <div>
              <p className="text-2xl font-bold text-danger">
                {RESULT_TEXT[task.lastResult ?? 'FAILED_TIMEOUT'] ?? 'This try failed.'}
              </p>
              {task.lastResult !== 'STOPPED_AT_END' && (
                <p className="text-lg">−{money(tasks.failPenalty)} Task Funds.</p>
              )}
            </div>
          </div>
        )}
        <p className="text-2xl font-semibold">{TASK_LOOK[task.key].summary}</p>
        <ul className="mt-3 space-y-1.5 text-xl">
          <li>
            Timer: <strong>{minutes} minutes</strong>. It starts when you press{' '}
            {failed ? 'Try again' : 'Start Task'}.
          </li>
          <li>
            Solve it for <strong>{money(task.points)} points</strong>.
          </li>
          <li>
            {hasHint(task)
              ? `Hint: ${tasks.hintsPerAttempt} per try, costs ${money(tasks.hintCost)}.`
              : 'This task has no hint.'}
          </li>
          <li>Timer runs out or Give up: −{money(tasks.failPenalty)} Task Funds.</li>
          {ELSEWHERE[task.key] && <li>{ELSEWHERE[task.key]}</li>}
          {hasLockout(task) && (
            <li>
              {tasks.lockoutAttempts} wrong tries lock the task:{' '}
              {lockTimesText(tasks.lockoutSeconds)}.
            </li>
          )}
          {failed && (
            <li>
              A new try has a new timer and a new hint.
              {task.key === 'find_code' ? '' : ' The puzzle may change.'}
            </li>
          )}
        </ul>
      </Card>
      <Card className="flex flex-col justify-center text-center">
        {blocked && <p className="mb-4 text-lg text-warning">{blocked}</p>}
        {!blocked && paused && <p className="mb-4 text-lg text-warning">The game is paused.</p>}
        <Button
          className="py-4 text-2xl"
          tone="success"
          disabled={Boolean(blocked) || paused}
          onClick={() => act(null, () => send('task:start', { taskId: task.id }))}
        >
          {failed ? (
            <>
              <RotateCcw className="h-6 w-6" aria-hidden /> Try again
            </>
          ) : (
            <>
              <Play className="h-6 w-6" aria-hidden /> Start Task
            </>
          )}
        </Button>
      </Card>
    </div>
  );
}

function Solved({ task }: { task: PlayerTaskView }) {
  // Ethical Dilemma has no right answer: it shows what the team chose.
  if (task.key === 'ethical_dilemma') {
    return (
      <Card tone="success" className="py-6">
        <div className="flex items-center gap-4">
          <CheckCircle2 className="h-14 w-14 text-success" aria-hidden />
          <div>
            <p className="text-4xl font-extrabold text-success">Answer saved.</p>
            <p className="text-2xl">+{money(task.points)} points.</p>
          </div>
        </div>
        {task.savedAnswer && (
          <dl className="mt-5 space-y-2 text-xl">
            <div>
              <dt className="text-lg font-bold text-ink-muted">Your choice</dt>
              <dd>{task.savedAnswer.option}</dd>
            </div>
            <div>
              <dt className="text-lg font-bold text-ink-muted">Your reason</dt>
              <dd>{task.savedAnswer.reason}</dd>
            </div>
          </dl>
        )}
      </Card>
    );
  }
  return (
    <Card tone="success" className="flex items-center gap-4 py-8">
      <CheckCircle2 className="h-14 w-14 text-success" aria-hidden />
      <div>
        <p className="text-4xl font-extrabold text-success">Solved!</p>
        <p className="text-2xl">+{money(task.points)} points.</p>
      </div>
    </Card>
  );
}

function Placeholder() {
  return (
    <Card className="py-14 text-center">
      <Hourglass className="mx-auto h-14 w-14 text-ink-muted" aria-hidden />
      <p className="mt-4 text-2xl font-bold">
        The puzzle for this task arrives in the next update.
      </p>
      <p className="mt-2 text-lg text-ink-muted">The timer is running. Exit keeps it running.</p>
    </Card>
  );
}
