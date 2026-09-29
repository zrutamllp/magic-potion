import type { GamePhase } from '@magic-potion/shared';
import type { GameEngine } from '../engine/engine';
import type { FileStore } from './blob';

// Team photos show real people, so they are deleted a number of days after the game
// (settings.inbox.photoRetentionDays, default 30). The days count from End game; if nobody
// pressed it, from the start of the Reveal; if the game never reached the Reveal, from its
// start. So no photo is kept for ever. The photo's status stays, so its points still count.

const DAY = 24 * 60 * 60 * 1000;

export interface PhotoGame {
  id: string;
  phase: GamePhase;
  startedAt: number | null;
  phaseStartedAt: number | null;
  endedAt: number | null;
  retentionDays: number;
}

// When this game's photos are due for deletion, or null if it never started.
export function photosDueAt(g: PhotoGame): number | null {
  if (g.startedAt === null) return null;
  const from = g.endedAt ?? (g.phase === 'REVEAL' ? g.phaseStartedAt : null) ?? g.startedAt;
  return from + g.retentionDays * DAY;
}

export function dueGames(games: readonly PhotoGame[], now: number): PhotoGame[] {
  return games.filter((g) => {
    const due = photosDueAt(g);
    return due !== null && due <= now;
  });
}

export interface PhotoCleanupStore {
  // Games that still have a photo file (a photo address not yet deleted).
  gamesWithPhotos(): Promise<PhotoGame[]>;
  photoUrls(gameId: string): Promise<string[]>;
  markDeleted(gameId: string, urls: string[], at: number): Promise<void>;
}

export interface PhotoCleanupOptions {
  store: PhotoCleanupStore;
  files: FileStore;
  now: () => number;
  // The game's engine if it is in memory, so its state forgets the addresses too.
  loadedEngine: (gameId: string) => Promise<GameEngine> | undefined;
  everyMs?: number;
}

export class PhotoCleanup {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  constructor(private readonly opts: PhotoCleanupOptions) {}

  start(): void {
    const run = () => {
      this.runOnce().catch((error: unknown) =>
        console.error('Photo clean-up failed:', error instanceof Error ? error.message : error),
      );
    };
    run();
    this.timer = setInterval(run, this.opts.everyMs ?? 60 * 60 * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Deletes every photo that is past its keep time. Returns how many were deleted.
  runOnce(): Promise<number> {
    this.running ??= this.clean().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async clean(): Promise<number> {
    const { store, files, now } = this.opts;
    let deleted = 0;
    for (const game of dueGames(await store.gamesWithPhotos(), now())) {
      const urls = await store.photoUrls(game.id);
      if (urls.length === 0) continue;
      // Files first: if that fails, nothing is marked and the next run tries again.
      await files.remove(urls);
      const engine = await this.opts.loadedEngine(game.id)?.catch(() => undefined);
      if (engine) await engine.forgetPhotos(urls);
      else await store.markDeleted(game.id, urls, now());
      deleted += urls.length;
      console.log(`Deleted ${urls.length} team photo(s) past their keep time.`);
    }
    return deleted;
  }
}
