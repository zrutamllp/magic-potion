import {
  DEFAULT_SETTINGS,
  GameSettingsSchema,
  PackOptionsSchema,
  checkPackItem,
  cleanPackItem,
  compileGameContent,
  packReadiness,
  type GameContentInfo,
  type ItemError,
  type PackDetail,
  type PackItem,
  type PackOptions,
  type PackSummary,
  type TaskKey,
} from '@magic-potion/shared';
import type { AdminAuditEntry } from '../admin/store';
import type { StaffAccount } from '../auth/store';
import type { NewItem, PackGame, PackStore } from './store';

// Content packs (Phase 6B). Main admin only; the routes check that. Every change is audited.
// A Lobby game follows its pack: every pack change is compiled into the game's task content at
// once. From Round 1 the game keeps its own frozen copy.

export const PACK_ERRORS = {
  PACK_NOT_FOUND: 'That content pack was not found.',
  ITEM_NOT_FOUND: 'That entry was not found in this pack.',
  BUILT_IN: 'The Sample pack cannot be changed. Copy it and edit the copy.',
  PACK_IN_USE: 'Games use this pack, so it cannot be deleted.',
  GAME_NOT_FOUND: 'That game was not found.',
  GAME_STARTED: 'The game has started, so its content is locked.',
  NOT_READY: 'This pack is not ready to play yet.',
  DILEMMA_NOT_FOUND: 'Choose one of the pack’s Ethical Dilemma scenarios.',
  ITEM_INVALID: 'Some fields need fixing. They are marked in red.',
} as const;
export type PackErrorCode = keyof typeof PACK_ERRORS;

export type PackResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: PackErrorCode; message: string; errors?: ItemError[] };

const fail = <T = never>(
  status: number,
  code: PackErrorCode,
  errors?: ItemError[],
): PackResult<T> => ({
  ok: false,
  status,
  code,
  message: PACK_ERRORS[code],
  ...(errors ? { errors } : {}),
});
const ok = <T>(value: T): PackResult<T> => ({ ok: true, value });

export interface PackServiceOptions {
  store: PackStore;
  audit: (entry: AdminAuditEntry) => Promise<void>;
  // A Lobby game's content changed: reload it (see Realtime.reloadGame).
  onLobbyChange?: (gameId: string) => void;
}

function options(raw: unknown): PackOptions {
  const parsed = PackOptionsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : PackOptionsSchema.parse({});
}

function settingsTasks(game: PackGame | null) {
  const parsed = GameSettingsSchema.safeParse(game?.settings);
  return parsed.success ? parsed.data.tasks : DEFAULT_SETTINGS.tasks;
}

export class PackService {
  private readonly store: PackStore;

  constructor(private readonly opts: PackServiceOptions) {
    this.store = opts.store;
  }

  // ---------- Packs ----------

  async list(): Promise<PackSummary[]> {
    const packs = await this.store.packs();
    return packs.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      builtIn: p.builtIn,
      itemCount: p.items.length,
      gameCount: p.gameCount,
      ready: packReadiness(p.items, DEFAULT_SETTINGS.tasks).ready,
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async detail(id: string): Promise<PackResult<PackDetail>> {
    const p = await this.store.pack(id);
    if (!p) return fail(404, 'PACK_NOT_FOUND');
    const games = await this.store.gamesUsing(id);
    return ok({
      id: p.id,
      name: p.name,
      description: p.description,
      builtIn: p.builtIn,
      options: options(p.taskOptions),
      items: p.items,
      readiness: packReadiness(p.items, DEFAULT_SETTINGS.tasks),
      games: games.map((g) => ({ id: g.id, name: g.name, locked: g.startedAt !== null })),
    });
  }

  async create(
    staff: StaffAccount,
    input: { name: string; description: string },
  ): Promise<PackResult<PackDetail>> {
    const id = await this.store.createPack({
      ...input,
      taskOptions: PackOptionsSchema.parse({}),
      createdById: staff.id,
    });
    await this.audit(staff, 'CREATE_PACK', undefined, { id, name: input.name });
    return this.detail(id);
  }

  // A copy with every entry, so a client pack can start from the Sample pack or another pack.
  async copy(staff: StaffAccount, id: string, name: string): Promise<PackResult<PackDetail>> {
    const p = await this.store.pack(id);
    if (!p) return fail(404, 'PACK_NOT_FOUND');
    const copyId = await this.store.createPack({
      name,
      description: p.description,
      taskOptions: p.taskOptions,
      createdById: staff.id,
      items: p.items.map(({ taskKey, publicData, secretData }) => ({
        taskKey,
        publicData,
        secretData,
      })),
    });
    await this.audit(staff, 'COPY_PACK', { id, name: p.name }, { id: copyId, name });
    return this.detail(copyId);
  }

  async update(
    staff: StaffAccount,
    id: string,
    patch: { name?: string; description?: string; options?: PackOptions },
  ): Promise<PackResult<PackDetail>> {
    const p = await this.editable(id);
    if (!p.ok) return p;
    await this.store.updatePack(id, {
      name: patch.name,
      description: patch.description,
      taskOptions: patch.options,
    });
    await this.audit(
      staff,
      'UPDATE_PACK',
      {
        name: p.value.name,
        description: p.value.description,
        options: options(p.value.taskOptions),
      },
      patch,
    );
    // The Guess the Celebrity name players see is part of the game content.
    if (patch.options) await this.follow(id);
    return this.detail(id);
  }

  async remove(staff: StaffAccount, id: string): Promise<PackResult<null>> {
    const p = await this.editable(id);
    if (!p.ok) return p;
    if ((await this.store.gamesUsing(id)).length > 0) return fail(409, 'PACK_IN_USE');
    await this.store.deletePack(id);
    await this.audit(staff, 'DELETE_PACK', { id, name: p.value.name, items: p.value.items.length });
    return ok(null);
  }

  // ---------- Entries ----------

  async addItem(
    staff: StaffAccount,
    packId: string,
    taskKey: TaskKey,
    data: NewItem,
  ): Promise<PackResult<PackDetail>> {
    return this.addItems(staff, packId, taskKey, [data], 'add');
  }

  // Many entries at once (spreadsheet import). Nothing is saved if any entry has a problem.
  async addItems(
    staff: StaffAccount,
    packId: string,
    taskKey: TaskKey,
    items: NewItem[],
    mode: 'add' | 'replace',
  ): Promise<PackResult<PackDetail>> {
    const p = await this.editable(packId);
    if (!p.ok) return p;
    const clean: NewItem[] = [];
    for (const [i, item] of items.entries()) {
      const errors = checkPackItem(taskKey, item);
      if (errors.length > 0) {
        return fail(
          400,
          'ITEM_INVALID',
          items.length > 1 ? errors.map((e) => ({ ...e, path: `${i}.${e.path}` })) : errors,
        );
      }
      clean.push(cleanPackItem(taskKey, item));
    }
    if (mode === 'replace') await this.store.replaceItems(packId, taskKey, clean);
    else await this.store.addItems(packId, taskKey, clean);
    await this.audit(
      staff,
      mode === 'replace' ? 'REPLACE_PACK_ITEMS' : 'ADD_PACK_ITEMS',
      undefined,
      {
        packId,
        taskKey,
        count: clean.length,
      },
    );
    await this.follow(packId);
    return this.detail(packId);
  }

  async updateItem(
    staff: StaffAccount,
    packId: string,
    itemId: string,
    data: NewItem,
  ): Promise<PackResult<PackDetail>> {
    const p = await this.editable(packId);
    if (!p.ok) return p;
    const item = p.value.items.find((i) => i.id === itemId);
    if (!item) return fail(404, 'ITEM_NOT_FOUND');
    const errors = checkPackItem(item.taskKey, data);
    if (errors.length > 0) return fail(400, 'ITEM_INVALID', errors);
    const clean = cleanPackItem(item.taskKey, data);
    await this.store.updateItem(itemId, clean);
    await this.store.touchPack(packId);
    await this.audit(
      staff,
      'UPDATE_PACK_ITEM',
      {
        packId,
        itemId,
        taskKey: item.taskKey,
        publicData: item.publicData,
        secretData: item.secretData,
      },
      { packId, itemId, taskKey: item.taskKey, ...clean },
    );
    await this.follow(packId);
    return this.detail(packId);
  }

  async deleteItem(
    staff: StaffAccount,
    packId: string,
    itemId: string,
  ): Promise<PackResult<PackDetail>> {
    const p = await this.editable(packId);
    if (!p.ok) return p;
    const item = p.value.items.find((i) => i.id === itemId);
    if (!item) return fail(404, 'ITEM_NOT_FOUND');
    await this.store.deleteItem(itemId);
    await this.store.touchPack(packId);
    await this.audit(staff, 'DELETE_PACK_ITEM', {
      packId,
      itemId,
      taskKey: item.taskKey,
      publicData: item.publicData,
      secretData: item.secretData,
    });
    await this.follow(packId);
    return this.detail(packId);
  }

  async reorder(
    staff: StaffAccount,
    packId: string,
    taskKey: TaskKey,
    itemIds: string[],
  ): Promise<PackResult<PackDetail>> {
    const p = await this.editable(packId);
    if (!p.ok) return p;
    const mine = p.value.items.filter((i) => i.taskKey === taskKey).map((i) => i.id);
    if (itemIds.length !== mine.length || !itemIds.every((id) => mine.includes(id))) {
      return fail(404, 'ITEM_NOT_FOUND');
    }
    await this.store.reorderItems(packId, itemIds);
    await this.store.touchPack(packId);
    await this.audit(staff, 'REORDER_PACK_ITEMS', undefined, { packId, taskKey, itemIds });
    await this.follow(packId);
    return this.detail(packId);
  }

  // ---------- Games ----------

  async gameContent(gameId: string): Promise<PackResult<GameContentInfo>> {
    const game = await this.store.game(gameId);
    if (!game) return fail(404, 'GAME_NOT_FOUND');
    const pack = game.contentPackId ? await this.store.pack(game.contentPackId) : null;
    return ok({
      packId: pack?.id ?? null,
      packName: pack?.name ?? null,
      dilemmaItemId: game.dilemmaItemId,
      dilemmas: (pack?.items ?? [])
        .filter((i) => i.taskKey === 'ethical_dilemma' && checkPackItem(i.taskKey, i).length === 0)
        .map((i) => ({ id: i.id, scenario: (i.publicData as { scenario: string }).scenario })),
      readiness: pack ? packReadiness(pack.items, settingsTasks(game)) : null,
      locked: game.startedAt !== null,
    });
  }

  // Gives a Lobby game this pack's content (and the chosen dilemma scenario).
  async assign(
    staff: StaffAccount,
    gameId: string,
    packId: string,
    dilemmaItemId: string | null,
  ): Promise<PackResult<GameContentInfo>> {
    const game = await this.store.game(gameId);
    if (!game) return fail(404, 'GAME_NOT_FOUND');
    if (game.startedAt) return fail(409, 'GAME_STARTED');
    const pack = await this.store.pack(packId);
    if (!pack) return fail(404, 'PACK_NOT_FOUND');
    if (!packReadiness(pack.items, settingsTasks(game)).ready) return fail(400, 'NOT_READY');
    if (
      dilemmaItemId &&
      !pack.items.some((i) => i.id === dilemmaItemId && i.taskKey === 'ethical_dilemma')
    ) {
      return fail(400, 'DILEMMA_NOT_FOUND');
    }
    await this.compileInto(game, pack.items, options(pack.taskOptions), packId, dilemmaItemId);
    await this.opts.audit({
      gameId,
      staffUserId: staff.id,
      action: 'SET_GAME_CONTENT',
      before: { packId: game.contentPackId, dilemmaItemId: game.dilemmaItemId },
      after: { packId, packName: pack.name, dilemmaItemId },
    });
    return this.gameContent(gameId);
  }

  // A new game starts with the built-in Sample pack, when there is one.
  async assignDefault(gameId: string): Promise<void> {
    const packId = await this.store.builtInPackId();
    const game = await this.store.game(gameId);
    const pack = packId ? await this.store.pack(packId) : null;
    if (!game || !pack || game.startedAt) return;
    await this.compileInto(game, pack.items, options(pack.taskOptions), pack.id, null);
  }

  // ---------- Helpers ----------

  private async compileInto(
    game: PackGame,
    items: PackItem[],
    opts: PackOptions,
    packId: string,
    dilemmaItemId: string | null,
  ) {
    const rows = compileGameContent(items, opts, dilemmaItemId);
    await this.store.setGameContent(game.id, packId, dilemmaItemId, rows);
    this.opts.onLobbyChange?.(game.id);
  }

  // Lobby games using the pack take its new content at once. Started games keep their copy.
  // A pack that is no longer ready is not pushed: the game keeps the last content that worked.
  private async follow(packId: string): Promise<void> {
    const pack = await this.store.pack(packId);
    if (!pack) return;
    for (const game of await this.store.gamesUsing(packId)) {
      if (game.startedAt) continue;
      if (!packReadiness(pack.items, settingsTasks(game)).ready) continue;
      const dilemma = pack.items.some((i) => i.id === game.dilemmaItemId)
        ? game.dilemmaItemId
        : null;
      try {
        await this.compileInto(game, pack.items, options(pack.taskOptions), packId, dilemma);
      } catch (error) {
        // The game started in the meantime: it keeps the content it started with.
        console.error(`Could not update the content of game ${game.id}:`, error);
      }
    }
  }

  private async editable(id: string) {
    const p = await this.store.pack(id);
    if (!p) return fail(404, 'PACK_NOT_FOUND');
    if (p.builtIn) return fail(403, 'BUILT_IN');
    return ok(p);
  }

  private audit(staff: StaffAccount, action: string, before?: unknown, after?: unknown) {
    return this.opts.audit({ gameId: null, staffUserId: staff.id, action, before, after });
  }
}

// Creates the built-in Sample pack if there is none yet. Safe to run on every server start.
export async function ensureSamplePack(
  store: PackStore,
  sample: {
    name: string;
    description: string;
    options: PackOptions;
    items: (NewItem & { taskKey: TaskKey })[];
  },
): Promise<string> {
  const existing = await store.builtInPackId();
  if (existing) return existing;
  return store.createPack({
    name: sample.name,
    description: sample.description,
    builtIn: true,
    taskOptions: sample.options,
    createdById: null,
    items: sample.items,
  });
}
