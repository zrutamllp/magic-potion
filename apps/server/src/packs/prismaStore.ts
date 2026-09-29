import {
  TaskKeySchema,
  type GameContentRow,
  type PackItem,
  type TaskKey,
} from '@magic-potion/shared';
import type { Prisma } from '../generated/prisma/client';
import { type PrismaClient } from '../generated/prisma/client';
import type { NewItem, PackGame, PackStore, StoredPack } from './store';

const json = (v: unknown) => (v ?? {}) as Prisma.InputJsonValue;

const PACK_FIELDS = {
  id: true,
  name: true,
  description: true,
  builtIn: true,
  taskOptions: true,
  updatedAt: true,
} as const;

const GAME_FIELDS = {
  id: true,
  name: true,
  phase: true,
  startedAt: true,
  contentPackId: true,
  dilemmaItemId: true,
  settings: { select: { data: true } },
} as const;

type ItemRow = {
  id: string;
  taskKey: string;
  position: number;
  publicData: unknown;
  secretData: unknown;
};

function toItem(r: ItemRow): PackItem {
  return {
    id: r.id,
    taskKey: TaskKeySchema.parse(r.taskKey),
    position: r.position,
    publicData: r.publicData,
    secretData: r.secretData,
  };
}

function toGame(g: {
  id: string;
  name: string;
  phase: PackGame['phase'];
  startedAt: Date | null;
  contentPackId: string | null;
  dilemmaItemId: string | null;
  settings: { data: unknown } | null;
}): PackGame {
  return { ...g, settings: g.settings?.data ?? null };
}

const ITEM_ORDER = [{ taskKey: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }] as const;

export class PrismaPackStore implements PackStore {
  constructor(private readonly prisma: PrismaClient) {}

  async packs() {
    const rows = await this.prisma.contentPack.findMany({
      select: {
        ...PACK_FIELDS,
        items: { orderBy: [...ITEM_ORDER] },
        _count: { select: { games: true } },
      },
      orderBy: [{ builtIn: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map(({ items, _count, ...p }) => ({
      ...p,
      items: items.map(toItem),
      gameCount: _count.games,
    }));
  }

  async pack(id: string) {
    const p = await this.prisma.contentPack.findUnique({
      where: { id },
      select: { ...PACK_FIELDS, items: { orderBy: [...ITEM_ORDER] } },
    });
    return p ? { ...p, items: p.items.map(toItem) } : null;
  }

  async builtInPackId(): Promise<string | null> {
    const p = await this.prisma.contentPack.findFirst({
      where: { builtIn: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return p?.id ?? null;
  }

  async createPack(row: Parameters<PackStore['createPack']>[0]): Promise<string> {
    const p = await this.prisma.contentPack.create({
      data: {
        name: row.name,
        description: row.description,
        builtIn: row.builtIn ?? false,
        taskOptions: json(row.taskOptions),
        createdById: row.createdById,
        items: {
          create: (row.items ?? []).map((item, position) => ({
            taskKey: item.taskKey,
            position,
            publicData: json(item.publicData),
            secretData: json(item.secretData),
          })),
        },
      },
      select: { id: true },
    });
    return p.id;
  }

  async updatePack(
    id: string,
    patch: { name?: string; description?: string; taskOptions?: unknown },
  ) {
    await this.prisma.contentPack.update({
      where: { id },
      data: {
        name: patch.name,
        description: patch.description,
        taskOptions: patch.taskOptions === undefined ? undefined : json(patch.taskOptions),
      },
    });
  }

  async deletePack(id: string): Promise<void> {
    await this.prisma.contentPack.delete({ where: { id } });
  }

  async addItems(packId: string, taskKey: TaskKey, items: NewItem[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const last = await tx.contentPackItem.aggregate({
        where: { packId, taskKey },
        _max: { position: true },
      });
      const start = (last._max.position ?? -1) + 1;
      await tx.contentPackItem.createMany({
        data: items.map((item, i) => ({
          packId,
          taskKey,
          position: start + i,
          publicData: json(item.publicData),
          secretData: json(item.secretData),
        })),
      });
      await tx.contentPack.update({ where: { id: packId }, data: { updatedAt: new Date() } });
    });
  }

  async replaceItems(packId: string, taskKey: TaskKey, items: NewItem[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.contentPackItem.deleteMany({ where: { packId, taskKey } }),
      this.prisma.contentPackItem.createMany({
        data: items.map((item, position) => ({
          packId,
          taskKey,
          position,
          publicData: json(item.publicData),
          secretData: json(item.secretData),
        })),
      }),
      this.prisma.contentPack.update({ where: { id: packId }, data: { updatedAt: new Date() } }),
    ]);
  }

  async updateItem(itemId: string, data: NewItem): Promise<void> {
    await this.prisma.contentPackItem.update({
      where: { id: itemId },
      data: { publicData: json(data.publicData), secretData: json(data.secretData) },
    });
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.prisma.contentPackItem.delete({ where: { id: itemId } });
  }

  async reorderItems(packId: string, itemIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      itemIds.map((id, position) =>
        this.prisma.contentPackItem.update({ where: { id, packId }, data: { position } }),
      ),
    );
  }

  async touchPack(id: string): Promise<void> {
    await this.prisma.contentPack.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  async game(gameId: string): Promise<PackGame | null> {
    const g = await this.prisma.game.findUnique({ where: { id: gameId }, select: GAME_FIELDS });
    return g ? toGame(g) : null;
  }

  async gamesUsing(packId: string): Promise<PackGame[]> {
    const rows = await this.prisma.game.findMany({
      where: { contentPackId: packId },
      select: GAME_FIELDS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toGame);
  }

  async setGameContent(
    gameId: string,
    packId: string,
    dilemmaItemId: string | null,
    rows: GameContentRow[],
  ): Promise<void> {
    const definitions = await this.prisma.taskDefinition.findMany({
      select: { id: true, key: true },
    });
    const definitionId = new Map(definitions.map((d) => [d.key, d.id]));
    await this.prisma.$transaction(async (tx) => {
      // Only ever called for a Lobby game, so no try points at these rows yet. Checked again
      // here, inside the transaction, so a game that just started keeps its content.
      const game = await tx.game.findUnique({ where: { id: gameId }, select: { startedAt: true } });
      if (!game || game.startedAt) throw new Error('The game has started; its content is locked.');
      await tx.taskContent.deleteMany({ where: { gameId } });
      await tx.taskContent.createMany({
        data: rows.map((r) => {
          const taskDefinitionId = definitionId.get(r.key);
          if (!taskDefinitionId) throw new Error(`Missing task definition ${r.key}`);
          return {
            gameId,
            taskDefinitionId,
            variant: r.variant,
            publicData: json(r.publicData),
            secretData: json(r.secretData),
          };
        }),
      });
      await tx.game.update({
        where: { id: gameId },
        data: { contentPackId: packId, dilemmaItemId },
      });
    });
  }
}

export type { StoredPack };
