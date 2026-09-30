import type { PrismaClient } from '../generated/prisma/client';
import type { Clock } from './clock';
import { GameEngine } from './engine';
import { loadGame } from './load';
import { PrismaPersistence } from './persistence/prisma';
import { cryptoRng } from './rng';

// Holds one engine per game in this server process (exactly one Render instance).
export class EngineRegistry {
  // Promises, so two callers asking for the same game at once share one load.
  private readonly engines = new Map<string, Promise<GameEngine>>();
  private readonly persistence: PrismaPersistence;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
  ) {
    this.persistence = new PrismaPersistence(prisma);
  }

  // On server start: rebuild every game that has started and not ended, and catch up
  // on anything that fell due while the server was down.
  // One broken game does not stop the others from loading.
  async loadLive(): Promise<{ loaded: string[]; failed: { gameId: string; error: unknown }[] }> {
    const games = await this.prisma.game.findMany({
      where: { startedAt: { not: null }, endedAt: null },
      select: { id: true },
    });
    const loaded: string[] = [];
    const failed: { gameId: string; error: unknown }[] = [];
    for (const g of games) {
      try {
        await this.get(g.id);
        loaded.push(g.id);
      } catch (error) {
        failed.push({ gameId: g.id, error });
      }
    }
    return { loaded, failed };
  }

  // The engine for a game, loading it from the database the first time.
  get(gameId: string): Promise<GameEngine> {
    let engine = this.engines.get(gameId);
    if (!engine) {
      engine = this.load(gameId);
      this.engines.set(gameId, engine);
      // A failed load is not cached, so the next call tries again.
      engine.catch(() => this.engines.delete(gameId));
    }
    return engine;
  }

  // The engine if this game is already in memory, without loading it.
  loaded(gameId: string): Promise<GameEngine> | undefined {
    return this.engines.get(gameId);
  }

  // Drops a Lobby game's engine after the admin changes its settings or teams, so the next
  // get() loads it again from the database. A game that has started is never dropped: its
  // engine holds the live state and timers.
  async evict(gameId: string): Promise<boolean> {
    const pending = this.engines.get(gameId);
    if (!pending) return true;
    const engine = await pending.catch(() => null);
    if (engine && engine.state.phase !== 'LOBBY') return false;
    // Another call may have replaced it while waiting.
    if (this.engines.get(gameId) === pending) this.engines.delete(gameId);
    await engine?.stop();
    return true;
  }

  // Drops a game that is finished or never started, before a live-site test game is deleted
  // (Phase 7C). A game being played is never dropped.
  async forget(gameId: string): Promise<boolean> {
    const pending = this.engines.get(gameId);
    if (!pending) return true;
    const engine = await pending.catch(() => null);
    const phase = engine?.state.phase;
    if (phase && phase !== 'LOBBY' && phase !== 'REVEAL') return false;
    if (this.engines.get(gameId) === pending) this.engines.delete(gameId);
    await engine?.stop();
    return true;
  }

  private async load(gameId: string): Promise<GameEngine> {
    const { state, content } = await loadGame(this.prisma, gameId);
    const engine = new GameEngine({
      state,
      content,
      persistence: this.persistence,
      clock: this.clock,
      rng: cryptoRng(),
      autoTick: true,
    });
    await engine.tick();
    return engine;
  }

  async stop(): Promise<void> {
    await Promise.all(
      [...this.engines.values()].map((p) =>
        p.then(
          (e) => e.stop(),
          () => undefined,
        ),
      ),
    );
  }
}
