import type { Change } from '../draft';
import type { Persistence } from './types';

// Keeps changes in memory only. Used by tests and the fast simulation.
export class MemoryPersistence implements Persistence {
  commits = 0;
  // Every saved change, in order, so tests can look at what would be written.
  readonly log: Change[] = [];
  // Set to make the next commit throw, to test that a failed save changes nothing.
  failNext = false;

  async commit(_gameId: string, changes: readonly Change[]): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Simulated database failure');
    }
    this.commits++;
    this.log.push(...changes);
  }
}
