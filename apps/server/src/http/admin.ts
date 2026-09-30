import type { NextFunction, Request, Response, Router } from 'express';
import type { z } from 'zod';
import {
  AUTH_ERRORS,
  AddTeamsSchema,
  CreateGameSchema,
  CreateStaffSchema,
  DeleteGameSchema,
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
import { cleanImage } from '../uploads/image';
import { readImage } from './rawImage';

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

  // Pictures: the client logo and task pictures. Each is saved under a random name with all
  // metadata removed; the URL goes into the settings or the pack entry when the admin saves.
  const USES = {
    logo: { folder: 'logos', maxSide: 512 },
    puzzle: { folder: 'tasks', maxSide: 1600 },
    spot: { folder: 'tasks', maxSide: 1600 },
    face: { folder: 'tasks', maxSide: 800 },
    clue: { folder: 'tasks', maxSide: 1200 },
  } as const;
  const uploadImage = async (req: Request, res: StaffResponse, use: keyof typeof USES) => {
    if (!files) {
      res
        .status(503)
        .json({ code: 'NO_UPLOADS', message: 'Uploads are not set up on this server.' });
      return;
    }
    const input = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const image = await cleanImage(input, USES[use].maxSide);
    if (!image.ok) {
      res.status(400).json({ code: 'BAD_IMAGE', message: image.message });
      return;
    }
    try {
      const url = await files.save(USES[use].folder, image.data, 'image/webp', 'webp');
      res.json({ url, width: image.width, height: image.height });
    } catch (error) {
      console.error('Upload failed:', error instanceof Error ? error.message : 'unknown');
      res
        .status(502)
        .json({ code: 'UPLOAD_FAILED', message: 'The upload did not work. Please try again.' });
    }
  };

  staff.post('/uploads/logo', mainAdminOnly, readImage, (req, res: StaffResponse) =>
    uploadImage(req, res, 'logo'),
  );

  staff.post('/uploads/image', mainAdminOnly, readImage, (req, res: StaffResponse) => {
    const use = String(req.query['use'] ?? '');
    if (!(use in USES)) {
      res.status(400).json({ code: 'INVALID_REQUEST', message: AUTH_ERRORS.INVALID_REQUEST });
      return;
    }
    return uploadImage(req, res, use as keyof typeof USES);
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

  // Live-site test clean-up (Phase 7C): only "LOADTEST – …" games and loadtest-N staff.
  staff.post('/games/:gameId/delete-test-game', mainAdminOnly, async (req, res: StaffResponse) => {
    const b = body(DeleteGameSchema, req, res);
    if (b) {
      send(res, await admin.deleteTestGame(res.locals.staff, id(req.params.gameId), b.confirmName));
    }
  });

  staff.delete('/users/:userId', mainAdminOnly, async (req, res: StaffResponse) => {
    send(res, await admin.deleteTestStaff(res.locals.staff, id(req.params.userId)));
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
