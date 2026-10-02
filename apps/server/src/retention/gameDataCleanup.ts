// Deletes game data once it is due (settings.retention.gameDataDays after End game, or after
// the last activity of a game that was never ended). Runs once when the server starts and then
// every few hours. What is due is worked out from database times on every run, so a restart
// never loses or moves a deletion (see AdminService.deleteDueGameData).

export interface GameDataCleanupOptions {
  // Deletes every due game; returns the ids deleted.
  deleteDue: () => Promise<string[]>;
  everyMs?: number;
}

export class GameDataCleanup {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<string[]> | null = null;

  constructor(private readonly opts: GameDataCleanupOptions) {}

  start(): void {
    const run = () => {
      this.runOnce().catch((error: unknown) =>
        console.error('Game data clean-up failed:', error instanceof Error ? error.message : error),
      );
    };
    run();
    this.timer = setInterval(run, this.opts.everyMs ?? 3 * 60 * 60 * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Two runs never overlap: a second call while one is running shares it.
  runOnce(): Promise<string[]> {
    this.running ??= this.opts.deleteDue().finally(() => {
      this.running = null;
    });
    return this.running;
  }
}
