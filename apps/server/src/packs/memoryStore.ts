import type { GameContentRow, PackItem, TaskKey } from '@magic-potion/shared';
import type { MemoryAdminStore } from '../admin/memoryStore';
import type { NewItem, PackGame, PackStore, StoredPack } from './store';

// An in-memory PackStore for tests. Games come from a MemoryAdminStore, so the admin routes and
// the pack routes see the same games.

export class MemoryPackStore implements PackStore {
  packsById = new Map<string, StoredPack>();
  items: PackItem[] = [];
  // The task content each game got, by game id.
  gameContent = new Map<string, GameContentRow[]>();
  private nextId = 1;

  constructor(private readonly admin: MemoryAdminStore) {}

  private id(prefix: string) {
    return `${prefix}-${this.nextId++}`;
  }

  private itemsOf(packId: string): PackItem[] {
    return this.items
      .filter((i) => this.packOf(i) === packId)
      .sort((a, b) => a.taskKey.localeCompare(b.taskKey) || a.position - b.position);
  }

  private itemPack = new Map<string, string>();
  private packOf(item: PackItem) {
    return this.itemPack.get(item.id);
  }

  async packs() {
    return [...this.packsById.values()].map((p) => ({
      ...p,
      items: this.itemsOf(p.id),
      gameCount: this.admin.games.filter((g) => g.contentPackId === p.id).length,
    }));
  }

  async pack(id: string) {
    const p = this.packsById.get(id);
    return p ? { ...p, items: this.itemsOf(id) } : null;
  }

  async builtInPackId() {
    return [...this.packsById.values()].find((p) => p.builtIn)?.id ?? null;
  }

  async createPack(row: Parameters<PackStore['createPack']>[0]) {
    const id = this.id('pack');
    this.packsById.set(id, {
      id,
      name: row.name,
      description: row.description,
      builtIn: row.builtIn ?? false,
      taskOptions: row.taskOptions,
      updatedAt: new Date(),
    });
    const byTask = new Map<TaskKey, NewItem[]>();
    for (const item of row.items ?? []) {
      byTask.set(item.taskKey, [...(byTask.get(item.taskKey) ?? []), item]);
    }
    for (const [key, list] of byTask) await this.addItems(id, key, list);
    return id;
  }

  async updatePack(
    id: string,
    patch: { name?: string; description?: string; taskOptions?: unknown },
  ) {
    const p = this.packsById.get(id)!;
    if (patch.name !== undefined) p.name = patch.name;
    if (patch.description !== undefined) p.description = patch.description;
    if (patch.taskOptions !== undefined) p.taskOptions = patch.taskOptions;
    p.updatedAt = new Date();
  }

  async deletePack(id: string) {
    this.packsById.delete(id);
    this.items = this.items.filter((i) => this.packOf(i) !== id);
    for (const g of this.admin.games) if (g.contentPackId === id) g.contentPackId = null;
  }

  async addItems(packId: string, taskKey: TaskKey, items: NewItem[]) {
    const start = this.itemsOf(packId).filter((i) => i.taskKey === taskKey).length;
    items.forEach((item, i) => {
      const id = this.id('item');
      this.itemPack.set(id, packId);
      this.items.push({ id, taskKey, position: start + i, ...item });
    });
  }

  async replaceItems(packId: string, taskKey: TaskKey, items: NewItem[]) {
    this.items = this.items.filter((i) => this.packOf(i) !== packId || i.taskKey !== taskKey);
    await this.addItems(packId, taskKey, items);
  }

  async updateItem(itemId: string, data: NewItem) {
    Object.assign(
      this.items.find((i) => i.id === itemId)!,
      data,
    );
  }

  async deleteItem(itemId: string) {
    this.items = this.items.filter((i) => i.id !== itemId);
  }

  async reorderItems(_packId: string, itemIds: string[]) {
    itemIds.forEach((id, position) => {
      const item = this.items.find((i) => i.id === id);
      if (item) item.position = position;
    });
  }

  async touchPack(id: string) {
    this.packsById.get(id)!.updatedAt = new Date();
  }

  private toGame(g: MemoryAdminStore['games'][number]): PackGame {
    return {
      id: g.id,
      name: g.name,
      phase: g.phase,
      startedAt: g.startedAt,
      contentPackId: g.contentPackId,
      dilemmaItemId: g.dilemmaItemId,
      settings: g.settings,
    };
  }

  async game(gameId: string) {
    const g = this.admin.games.find((x) => x.id === gameId);
    return g ? this.toGame(g) : null;
  }

  async gamesUsing(packId: string) {
    return this.admin.games.filter((g) => g.contentPackId === packId).map((g) => this.toGame(g));
  }

  async setGameContent(
    gameId: string,
    packId: string,
    dilemmaItemId: string | null,
    rows: GameContentRow[],
  ) {
    const g = this.admin.games.find((x) => x.id === gameId)!;
    if (g.startedAt) throw new Error('The game has started; its content is locked.');
    g.contentPackId = packId;
    g.dilemmaItemId = dilemmaItemId;
    this.gameContent.set(gameId, rows);
  }
}
