import type { GameContentRow, GamePhase, PackItem, TaskKey } from '@magic-potion/shared';

// Everything content packs need from the database, behind an interface so the route tests run
// without Postgres (same pattern as admin/store.ts).

export interface StoredPack {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  // Raw JSON as saved; the service parses it with PackOptionsSchema.
  taskOptions: unknown;
  updatedAt: Date;
}

export interface PackGame {
  id: string;
  name: string;
  phase: GamePhase;
  startedAt: Date | null;
  contentPackId: string | null;
  dilemmaItemId: string | null;
  // The game's settings JSON (for the per-try counts in the readiness check).
  settings: unknown;
}

export interface NewItem {
  publicData: unknown;
  secretData: unknown;
}

export interface PackStore {
  packs(): Promise<(StoredPack & { items: PackItem[]; gameCount: number })[]>;
  pack(id: string): Promise<(StoredPack & { items: PackItem[] }) | null>;
  builtInPackId(): Promise<string | null>;
  createPack(row: {
    name: string;
    description: string;
    builtIn?: boolean;
    taskOptions: unknown;
    createdById: string | null;
    items?: (NewItem & { taskKey: TaskKey })[];
  }): Promise<string>;
  updatePack(
    id: string,
    patch: { name?: string; description?: string; taskOptions?: unknown },
  ): Promise<void>;
  deletePack(id: string): Promise<void>;

  addItems(packId: string, taskKey: TaskKey, items: NewItem[]): Promise<void>;
  // Replaces every item of one task in the pack.
  replaceItems(packId: string, taskKey: TaskKey, items: NewItem[]): Promise<void>;
  updateItem(itemId: string, data: NewItem): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  // Sets positions 0..n-1 in this order.
  reorderItems(packId: string, itemIds: string[]): Promise<void>;
  // Marks the pack as changed (its updatedAt), after an item change.
  touchPack(id: string): Promise<void>;

  game(gameId: string): Promise<PackGame | null>;
  gamesUsing(packId: string): Promise<PackGame[]>;
  // Replaces a Lobby game's task content with these rows and records the pack it came from.
  setGameContent(
    gameId: string,
    packId: string,
    dilemmaItemId: string | null,
    rows: GameContentRow[],
  ): Promise<void>;
}
