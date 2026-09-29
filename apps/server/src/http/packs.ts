import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import type { z } from 'zod';
import {
  AUTH_ERRORS,
  BulkItemsSchema,
  GameSettingsSchema,
  IMPORT_TASK_KEYS,
  PackOptionsSchema,
  TASK_KEYS,
  type ImportTaskKey,
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
import {
  MAX_IMPORT_BYTES,
  previewImport,
  readSheet,
  templateCsv,
  templateXlsx,
} from '../packs/importer';
import type { PreviewService } from '../packs/preview';
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

const PreviewSchema = zod.object({
  taskKey: zod.enum(TASK_KEYS),
  items: zod
    .array(zod.object({ publicData: zod.unknown(), secretData: zod.unknown() }))
    .min(1)
    .max(500),
  options: PackOptionsSchema.partial().optional(),
  // Play with this game's settings (timers, per-try counts). Default settings otherwise.
  gameId: zod.string().optional(),
});

function importTask(value: unknown): ImportTaskKey | null {
  return (IMPORT_TASK_KEYS as readonly string[]).includes(String(value))
    ? (String(value) as ImportTaskKey)
    : null;
}

export function addPackRoutes(
  staff: Router,
  packs: PackService,
  admin: AdminService,
  preview: PreviewService,
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

  // ---------- Spreadsheet import ----------

  staff.get('/packs-import-template', mainAdminOnly, async (req, res) => {
    const task = importTask(req.query['task']);
    if (!task)
      return void res
        .status(400)
        .json({ code: 'INVALID_REQUEST', message: AUTH_ERRORS.INVALID_REQUEST });
    const name = `magic-potion-${task.replace('_', '-')}-template`;
    if (req.query['format'] === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
      // A byte order mark, so Excel opens the file as UTF-8 (₹, é, ’).
      res.send('\ufeff' + templateCsv(task));
      return;
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
    res.send(await templateXlsx(task));
  });

  // Reads an uploaded sheet and checks every row. Nothing is saved: the admin confirms with the
  // bulk route (or, for Data Story questions, by saving the dashboard).
  const readFile = express.raw({ type: () => true, limit: MAX_IMPORT_BYTES });
  staff.post(
    '/packs/:packId/import',
    mainAdminOnly,
    (req: Request, res: Response, next: NextFunction) =>
      readFile(req, res, (error?: unknown) => {
        if (!error) return next();
        res
          .status(413)
          .json({ code: 'FILE_TOO_BIG', message: 'The file is too big. The limit is 1 MB.' });
      }),
    async (req, res: StaffResponse) => {
      const task = importTask(req.query['task']);
      if (!task)
        return void res
          .status(400)
          .json({ code: 'INVALID_REQUEST', message: AUTH_ERRORS.INVALID_REQUEST });
      const pack = await packs.detail(id(req.params.packId));
      if (!pack.ok) return send(res, pack);
      let dashboard: { charts: { id: string; title: string }[] } | undefined;
      if (task === 'data_story') {
        const item = pack.value.items.find((i) => i.id === String(req.query['itemId'] ?? ''));
        dashboard = item?.publicData as typeof dashboard;
      }
      const sheet = await readSheet(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
      if (!sheet.ok) return void res.status(400).json({ code: 'BAD_FILE', message: sheet.message });
      const result = previewImport(task, sheet.rows, dashboard);
      if (!result.ok)
        return void res.status(400).json({ code: 'BAD_FILE', message: result.message });
      res.json(result.value);
    },
  );

  // ---------- Preview as player ----------

  staff.post('/preview', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(PreviewSchema, req, res);
    if (!b) return;
    let settings;
    if (b.gameId) {
      const game = await admin.getGame(b.gameId);
      if (game.ok) settings = GameSettingsSchema.parse(game.value.settings);
    }
    const result = preview.create(b.taskKey, b.items, b.options, settings);
    if (!result.ok) {
      res
        .status(400)
        .json({ code: 'ITEM_INVALID', message: result.message, errors: result.errors ?? [] });
      return;
    }
    res.json(result.value);
  });

  staff.get('/preview/:previewId', mainAdminOnly, (req, res) => {
    const snapshot = preview.get(id(req.params.previewId));
    if (!snapshot) {
      res.status(404).json({ code: 'PREVIEW_ENDED', message: 'This preview has ended.' });
      return;
    }
    res.json(snapshot);
  });

  // Each action answers like the game does ({ ok, value: { status } }) plus the new screen.
  const act =
    (run: (previewId: string, body: unknown) => ReturnType<PreviewService['start']>) =>
    (req: Request, res: Response) => {
      const previewId = id(req.params.previewId);
      const ack = run(previewId, (req.body as { submission?: unknown } | undefined)?.submission);
      res.json({ ack, preview: preview.get(previewId) });
    };
  staff.post(
    '/preview/:previewId/start',
    mainAdminOnly,
    act((p) => preview.start(p)),
  );
  staff.post(
    '/preview/:previewId/submit',
    mainAdminOnly,
    act((p, s) => preview.submit(p, s)),
  );
  staff.post(
    '/preview/:previewId/hint',
    mainAdminOnly,
    act((p) => preview.hint(p)),
  );
  staff.post(
    '/preview/:previewId/give-up',
    mainAdminOnly,
    act((p) => preview.giveUp(p)),
  );

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
