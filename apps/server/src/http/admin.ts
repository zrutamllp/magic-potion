import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import type { z } from 'zod';
import {
  AUTH_ERRORS,
  AddTeamsSchema,
  CreateGameSchema,
  CreateStaffSchema,
  RenameGameSchema,
  RenameTeamSchema,
  ResetPasswordsSchema,
  ResetStaffPasswordSchema,
  SaveSettingsSchema,
  SetAssignmentsSchema,
  UpdateStaffSchema,
} from '@magic-potion/shared';
import type { AdminResult, AdminService } from '../admin/service';
import type { StaffAccount } from '../auth/store';
import type { FileStore } from '../uploads/blob';
import { MAX_UPLOAD_BYTES, cleanImage } from '../uploads/image';

// Admin panel setup routes (Phase 6A), under /api/staff. Main admin only.

type StaffLocals = { staff: StaffAccount };
type StaffResponse = Response<unknown, StaffLocals>;

function send<T>(res: Response, result: AdminResult<T>): void {
  if (result.ok) res.json(result.value);
  else res.status(result.status).json({ code: result.code, message: result.message });
}

// The body checked with a schema, or a 400 sent and null returned.
function body<S extends z.ZodType>(schema: S, req: { body: unknown }, res: Response) {
  const parsed = schema.safeParse(req.body ?? {});
  if (parsed.success) return parsed.data as z.infer<S>;
  res.status(400).json({ code: 'INVALID_REQUEST', message: AUTH_ERRORS.INVALID_REQUEST });
  return null;
}

export function addAdminRoutes(
  staff: Router,
  admin: AdminService,
  mainAdminOnly: (req: Request, res: StaffResponse, next: NextFunction) => unknown,
  // Where uploaded pictures go. Missing when BLOB_READ_WRITE_TOKEN is not set.
  files: FileStore | undefined,
): void {
  const id = (v: unknown) => String(v);

  // The picture is the raw request body (Content-Type image/...), not a form.
  const rawImage = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });
  const readImage = (req: Request, res: Response, next: NextFunction) =>
    rawImage(req, res, (error?: unknown) => {
      if (!error) return next();
      res.status(413).json({
        code: 'FILE_TOO_BIG',
        message: `That picture is too big. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      });
    });

  // The client logo. Saved under a random name with all metadata removed; the URL goes into
  // the branding settings when the admin saves them.
  staff.post('/uploads/logo', mainAdminOnly, readImage, async (req, res: StaffResponse) => {
    if (!files) {
      res
        .status(503)
        .json({ code: 'NO_UPLOADS', message: 'Uploads are not set up on this server.' });
      return;
    }
    const input = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const image = await cleanImage(input, 512);
    if (!image.ok) {
      res.status(400).json({ code: 'BAD_IMAGE', message: image.message });
      return;
    }
    try {
      const url = await files.save('logos', image.data, 'image/webp', 'webp');
      res.json({ url, width: image.width, height: image.height });
    } catch (error) {
      console.error('Logo upload failed:', error instanceof Error ? error.message : 'unknown');
      res
        .status(502)
        .json({ code: 'UPLOAD_FAILED', message: 'The upload did not work. Please try again.' });
    }
  });

  staff.post('/games', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(CreateGameSchema, req, res);
    if (b) send(res, await admin.createGame(res.locals.staff, b));
  });

  staff.get('/games/:gameId', mainAdminOnly, async (req, res) => {
    send(res, await admin.getGame(id(req.params.gameId)));
  });

  staff.patch('/games/:gameId', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(RenameGameSchema, req, res);
    if (b) send(res, await admin.renameGame(res.locals.staff, id(req.params.gameId), b.name));
  });

  staff.put('/games/:gameId/settings', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(SaveSettingsSchema, req, res);
    if (b) {
      send(res, await admin.saveSettings(res.locals.staff, id(req.params.gameId), b.settings));
    }
  });

  staff.post('/games/:gameId/teams', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(AddTeamsSchema, req, res);
    if (b) send(res, await admin.addTeams(res.locals.staff, id(req.params.gameId), b));
  });

  staff.patch('/games/:gameId/teams/:teamId', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(RenameTeamSchema, req, res);
    if (b) {
      const { gameId, teamId } = req.params;
      send(res, await admin.renameTeam(res.locals.staff, id(gameId), id(teamId), b.name));
    }
  });

  staff.delete('/games/:gameId/teams/:teamId', mainAdminOnly, async (req, res: StaffResponse) => {
    const { gameId, teamId } = req.params;
    send(res, await admin.deleteTeam(res.locals.staff, id(gameId), id(teamId)));
  });

  staff.post(
    '/games/:gameId/teams/reset-passwords',
    mainAdminOnly,
    async (req, res: StaffResponse) => {
      const b = body(ResetPasswordsSchema, req, res);
      if (b) {
        send(res, await admin.resetPasswords(res.locals.staff, id(req.params.gameId), b.teamIds));
      }
    },
  );

  staff.put('/games/:gameId/assignments', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(SetAssignmentsSchema, req, res);
    if (b) {
      const gameId = id(req.params.gameId);
      send(res, await admin.setAssignments(res.locals.staff, gameId, b.staffUserId, b.teamIds));
    }
  });

  staff.get('/users', mainAdminOnly, async (_req, res) => {
    res.json(await admin.staffList());
  });

  staff.post('/users', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(CreateStaffSchema, req, res);
    if (b) send(res, await admin.createStaff(res.locals.staff, b));
  });

  staff.patch('/users/:userId', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(UpdateStaffSchema, req, res);
    if (b) send(res, await admin.updateStaff(res.locals.staff, id(req.params.userId), b));
  });

  staff.post('/users/:userId/password', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(ResetStaffPasswordSchema, req, res);
    if (b) {
      send(
        res,
        await admin.resetStaffPassword(res.locals.staff, id(req.params.userId), b.password),
      );
    }
  });
}
