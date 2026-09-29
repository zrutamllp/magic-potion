import type { NextFunction, Request, Response, Router } from 'express';
import type { z } from 'zod';
import {
  AUTH_ERRORS,
  BulkItemsSchema,
  CreatePackSchema,
  DeleteGameSchema,
  PackItemBodySchema,
  PackNameSchema,
  ReorderItemsSchema,
  SaveInboxSchema,
  SetGameContentSchema,
  UpdatePackItemSchema,
  UpdatePackSchema,
} from '@magic-potion/shared';
import { z as zod } from 'zod';
import type { AdminService } from '../admin/service';
import type { StaffAccount } from '../auth/store';
import type { PackResult, PackService } from '../packs/service';

// Content packs, game content, inbox bonus tasks, archive and delete (Phase 6B), under
// /api/staff. Main admin only.

type StaffResponse = Response<unknown, { staff: StaffAccount }>;
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string; message: string; errors?: unknown };

function send<T>(res: Response, result: Result<T> | PackResult<T>): void {
  if (result.ok) {
    res.json(result.value);
    return;
  }
  const { status, code, message } = result;
  res
    .status(status)
    .json({ code, message, ...('errors' in result ? { errors: result.errors } : {}) });
}

function body<S extends z.ZodType>(schema: S, req: { body: unknown }, res: Response) {
  const parsed = schema.safeParse(req.body ?? {});
  if (parsed.success) return parsed.data as z.infer<S>;
  res.status(400).json({ code: 'INVALID_REQUEST', message: AUTH_ERRORS.INVALID_REQUEST });
  return null;
}

const CopySchema = zod.object({ name: PackNameSchema });

export function addPackRoutes(
  staff: Router,
  packs: PackService,
  admin: AdminService,
  mainAdminOnly: (req: Request, res: StaffResponse, next: NextFunction) => unknown,
): void {
  const id = (v: unknown) => String(v);
  const me = (res: StaffResponse) => res.locals.staff;

  // ---------- Packs ----------

  staff.get('/packs', mainAdminOnly, async (_req, res) => {
    res.json(await packs.list());
  });

  staff.post('/packs', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(CreatePackSchema, req, res);
    if (b) send(res, await packs.create(me(res), b));
  });

  staff.get('/packs/:packId', mainAdminOnly, async (req, res) => {
    send(res, await packs.detail(id(req.params.packId)));
  });

  staff.patch('/packs/:packId', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(UpdatePackSchema, req, res);
    if (b) send(res, await packs.update(me(res), id(req.params.packId), b));
  });

  staff.delete('/packs/:packId', mainAdminOnly, async (req, res: StaffResponse) => {
    send(res, await packs.remove(me(res), id(req.params.packId)));
  });

  staff.post('/packs/:packId/copy', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(CopySchema, req, res);
    if (b) send(res, await packs.copy(me(res), id(req.params.packId), b.name));
  });

  staff.post('/packs/:packId/items', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(PackItemBodySchema, req, res);
    if (b) send(res, await packs.addItem(me(res), id(req.params.packId), b.taskKey, b));
  });

  staff.post('/packs/:packId/items/bulk', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(BulkItemsSchema, req, res);
    if (b) {
      send(res, await packs.addItems(me(res), id(req.params.packId), b.taskKey, b.items, b.mode));
    }
  });

  staff.put('/packs/:packId/items/:itemId', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(UpdatePackItemSchema, req, res);
    if (b) {
      const { packId, itemId } = req.params;
      send(res, await packs.updateItem(me(res), id(packId), id(itemId), b));
    }
  });

  staff.delete('/packs/:packId/items/:itemId', mainAdminOnly, async (req, res: StaffResponse) => {
    const { packId, itemId } = req.params;
    send(res, await packs.deleteItem(me(res), id(packId), id(itemId)));
  });

  staff.put('/packs/:packId/order', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(ReorderItemsSchema, req, res);
    if (b) send(res, await packs.reorder(me(res), id(req.params.packId), b.taskKey, b.itemIds));
  });

  // ---------- A game's content and inbox ----------

  staff.get('/games/:gameId/content', mainAdminOnly, async (req, res) => {
    send(res, await packs.gameContent(id(req.params.gameId)));
  });

  staff.put('/games/:gameId/content', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(SetGameContentSchema, req, res);
    if (b) send(res, await packs.assign(me(res), id(req.params.gameId), b.packId, b.dilemmaItemId));
  });

  staff.get('/games/:gameId/inbox', mainAdminOnly, async (req, res) => {
    send(res, await admin.inbox(id(req.params.gameId)));
  });

  staff.put('/games/:gameId/inbox', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(SaveInboxSchema, req, res);
    if (b) send(res, await admin.saveInbox(me(res), id(req.params.gameId), b.items));
  });

  // ---------- Archive and delete ----------

  staff.post('/games/:gameId/archive', mainAdminOnly, async (req, res: StaffResponse) => {
    send(res, await admin.setArchived(me(res), id(req.params.gameId), true));
  });

  staff.post('/games/:gameId/unarchive', mainAdminOnly, async (req, res: StaffResponse) => {
    send(res, await admin.setArchived(me(res), id(req.params.gameId), false));
  });

  staff.delete('/games/:gameId', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(DeleteGameSchema, req, res);
    if (b) send(res, await admin.deleteGame(me(res), id(req.params.gameId), b.confirmName));
  });
}
