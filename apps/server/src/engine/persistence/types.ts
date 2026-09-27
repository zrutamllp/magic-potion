import type { Change } from '../draft';

// Saves one command's changes. Must be all or nothing (one database transaction).
export interface Persistence {
  commit(gameId: string, changes: readonly Change[]): Promise<void>;
}
