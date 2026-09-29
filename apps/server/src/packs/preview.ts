import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SETTINGS,
  PackOptionsSchema,
  TASK_DEFINITIONS,
  checkPackItem,
  compileGameContent,
  parseTaskContent,
  type GameSettings,
  type ItemError,
  type PackItemData,
  type PackOptions,
  type PlayerTaskView,
  type TaskKey,
} from '@magic-potion/shared';
import {
  findCodeFragmentValue,
  makeCipher,
  makeCode,
  vaultFragmentDigits,
  vaultFragmentValue,
} from '../engine/assignment';
import {
  applyHint,
  checkSubmission,
  initProgress,
  publicView,
  type CheckerContext,
  type Json,
} from '../engine/checkers';
import { cryptoRng, seededRng, type Rng } from '../engine/rng';
import { VAULT_MARKERS } from '@magic-potion/shared';

// "Preview as player" (Phase 6B): the admin plays a task with draft content, exactly as a team
// would, using the same checkers as the game. Sessions live in memory for 30 minutes and nothing
// is saved. Answers stay on the server; only the player view is sent.

const SESSION_MS = 30 * 60_000;
const MAX_SESSIONS = 200;

export interface PreviewSnapshot {
  id: string;
  task: PlayerTaskView;
  // What another team would hold, so the admin can solve The Vault and Find the Code.
  note: string | null;
}

export type PreviewAck = { ok: true; value: { status: string } } | { ok: false; message: string };

interface Session {
  id: string;
  key: TaskKey;
  ctx: CheckerContext<TaskKey>;
  tasks: GameSettings['tasks'];
  timerSeconds: number;
  points: number;
  name: string;
  note: string | null;
  attempts: { progress: Json; startedAt: number; hintsUsed: number; result: string | null }[];
  status: PlayerTaskView['status'];
  expiresAt: number;
}

export type CreatePreviewResult =
  { ok: true; value: PreviewSnapshot } | { ok: false; message: string; errors?: ItemError[] };

export class PreviewService {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly rng: () => Rng = cryptoRng,
  ) {}

  // Pool tasks send the whole pool (all entries); other tasks send the one puzzle.
  create(
    key: TaskKey,
    items: PackItemData[],
    options: Partial<PackOptions> = {},
    settings: GameSettings = DEFAULT_SETTINGS,
  ): CreatePreviewResult {
    for (const item of items) {
      const errors = checkPackItem(key, item);
      if (errors.length > 0) {
        return { ok: false, message: 'Fix the fields marked in red first.', errors };
      }
    }
    const rows = compileGameContent(
      items.map((item, i) => ({ ...item, id: `preview-${i}`, taskKey: key, position: i })),
      PackOptionsSchema.parse(options),
      null,
    ).filter((r) => r.key === key);
    const row = rows[0];
    if (!row) return { ok: false, message: 'Add an entry first.' };

    const rng = this.rng();
    const content = parseTaskContent(key, row);
    let fragment: string | null = null;
    let cipher: CheckerContext<TaskKey>['cipher'] = null;
    let note: string | null = null;
    if (key === 'vault') {
      fragment = vaultFragmentValue(rng, VAULT_MARKERS[0]!);
      note = `In a game another team holds the rest of the code. For this preview it is ${fragment.split(' ')[1] ?? vaultFragmentDigits(fragment)}.`;
    }
    if (key === 'find_code') {
      const secret = content.secretData as {
        symbols: string[];
        codeLength: { min: number; max: number };
      };
      cipher = makeCipher(rng, makeCode(rng, secret.codeLength), secret.symbols);
      fragment = findCodeFragmentValue(cipher);
      note = `In a game another team holds the rest of the key. For this preview it is ${fragment}.`;
    }

    this.sweep();
    const def = TASK_DEFINITIONS.find((d) => d.key === key)!;
    const session: Session = {
      id: randomUUID(),
      key,
      ctx: {
        ...content,
        fragment,
        cipher,
        tasks: settings.tasks,
        rng: seededRng(0),
      } as CheckerContext<TaskKey>,
      tasks: settings.tasks,
      timerSeconds: settings.tasks.timerSeconds[key] ?? 600,
      points: settings.scoring.pointsPerTask,
      name:
        key === 'guess_celebrity'
          ? (content.publicData as { taskName: string }).taskName
          : def.name,
      note,
      attempts: [],
      status: 'NOT_STARTED',
      expiresAt: this.now() + SESSION_MS,
    };
    this.sessions.set(session.id, session);
    return { ok: true, value: this.snapshot(session) };
  }

  get(id: string): PreviewSnapshot | null {
    const s = this.live(id);
    return s ? this.snapshot(s) : null;
  }

  // Start (or restart after a fail): a fresh timer and, for pool tasks, a fresh draw.
  start(id: string): PreviewAck {
    const s = this.live(id);
    if (!s) return gone;
    if (s.status === 'IN_PROGRESS') return { ok: false, message: 'The task is already running.' };
    const ctx = { ...s.ctx, rng: this.rng(), previous: s.attempts.map((a) => a.progress) };
    s.attempts.push({
      progress: initProgress(s.key, ctx),
      startedAt: this.now(),
      hintsUsed: 0,
      result: null,
    });
    s.status = 'IN_PROGRESS';
    return { ok: true, value: { status: 'started' } };
  }

  submit(id: string, submission: unknown): PreviewAck {
    const s = this.live(id);
    const a = s && this.running(s);
    if (!s || !a) return s ? notRunning : gone;
    const r = checkSubmission(s.key, s.ctx, a.progress, submission);
    if (r.status === 'invalid') return { ok: false, message: 'That answer could not be read.' };
    a.progress = r.progress;
    if (r.status === 'solved') this.finish(s, a, 'SOLVED', 'DONE');
    if (r.status === 'failed') this.finish(s, a, 'FAILED_WRONG', 'FAILED');
    return { ok: true, value: { status: r.status } };
  }

  hint(id: string): PreviewAck {
    const s = this.live(id);
    const a = s && this.running(s);
    if (!s || !a) return s ? notRunning : gone;
    if (a.hintsUsed >= s.tasks.hintsPerAttempt) {
      return { ok: false, message: 'The hint for this try is used.' };
    }
    a.progress = applyHint(s.key, { ...s.ctx, rng: this.rng() }, a.progress);
    a.hintsUsed += 1;
    return { ok: true, value: { status: 'hint' } };
  }

  giveUp(id: string): PreviewAck {
    const s = this.live(id);
    const a = s && this.running(s);
    if (!s || !a) return s ? notRunning : gone;
    this.finish(s, a, 'GAVE_UP', 'FAILED');
    return { ok: true, value: { status: 'failed' } };
  }

  private finish(
    s: Session,
    a: Session['attempts'][number],
    result: string,
    status: Session['status'],
  ) {
    a.result = result;
    s.status = status;
  }

  // The running try, or none. A try whose timer ran out fails, as in a game.
  private running(s: Session) {
    const a = s.attempts.at(-1);
    if (!a || s.status !== 'IN_PROGRESS') return null;
    if (this.now() - a.startedAt >= s.timerSeconds * 1000) {
      this.finish(s, a, 'FAILED_TIMEOUT', 'FAILED');
      return null;
    }
    return a;
  }

  private live(id: string): Session | null {
    const s = this.sessions.get(id);
    if (!s || s.expiresAt < this.now()) {
      this.sessions.delete(id);
      return null;
    }
    s.expiresAt = this.now() + SESSION_MS;
    return s;
  }

  private sweep() {
    const now = this.now();
    for (const [id, s] of this.sessions) if (s.expiresAt < now) this.sessions.delete(id);
    // Oldest first, if an unusual number are open.
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
  }

  private snapshot(s: Session): PreviewSnapshot {
    const a = this.running(s);
    const last = s.attempts.at(-1);
    const def = TASK_DEFINITIONS.find((d) => d.key === s.key)!;
    return {
      id: s.id,
      note: s.note,
      task: {
        id: s.id,
        key: s.key,
        name: s.name,
        type: def.type,
        status: s.status,
        attempts: s.attempts.length,
        timerSeconds: s.timerSeconds,
        points: s.points,
        running: a
          ? {
              number: s.attempts.length,
              msLeft: Math.max(0, s.timerSeconds * 1000 - (this.now() - a.startedAt)),
              lockMsLeft: 0,
              hintsUsed: a.hintsUsed,
              wrongCount: 0,
              nextLockSeconds: s.tasks.lockoutSeconds[0] ?? 60,
              view: publicView(s.key, s.ctx, a.progress),
            }
          : null,
        lastResult: (last?.result ?? null) as PlayerTaskView['lastResult'],
        savedAnswer: null,
      },
    };
  }
}

const gone: PreviewAck = {
  ok: false,
  message: 'This preview has ended. Close it and press Preview as player again.',
};
const notRunning: PreviewAck = { ok: false, message: 'Start the task first.' };
