import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { z } from 'zod';
import {
  AUTH_ERRORS,
  StaffLoginSchema,
  TeamLoginSchema,
  type EngineResult,
} from '@magic-potion/shared';
import type { AdminService } from '../admin/service';
import type { AuthResult, AuthService } from '../auth/service';
import type { StaffAccount } from '../auth/store';
import { finishAllTasks } from '../engine/devTools';
import type { GameEngine } from '../engine/engine';
import { addAdminRoutes } from './admin';

// REST routes under /api: logins, and the staff game controls that Phase 6 will build on.
// Everything live (chat, funds, state) goes over Socket.IO instead.

export interface ApiDeps {
  auth: AuthService;
  // Loads the engine for a game; rejects if the game does not exist.
  engine: (gameId: string) => Promise<GameEngine>;
  // The admin panel's setup routes (Phase 6A). Left out by tests that do not need them.
  admin?: AdminService;
  // Registers the dev-only routes. Never true in production.
  devTools: boolean;
}

type StaffLocals = { staff: StaffAccount };

function sendAuth<T>(res: Response, result: AuthResult<T>): void {
  if (result.ok) res.json(result.value);
  else res.status(result.status).json({ code: result.code, message: result.message });
}

function sendEngine(res: Response, result: EngineResult<unknown>): void {
  if (result.ok) res.json({ ok: true, value: result.value ?? null });
  else res.status(400).json({ ok: false, code: result.code, message: result.message });
}

function invalid(res: Response): void {
  res.status(400).json({ code: 'INVALID_REQUEST', message: AUTH_ERRORS.INVALID_REQUEST });
}

function bearer(req: Request): string | undefined {
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

const ExtendSchema = z.object({ seconds: z.number() });
const FinishSchema = z.object({ limit: z.number().int().positive().optional() });

export function createApiRouter({ auth, engine, admin, devTools }: ApiDeps): Router {
  const api = express.Router();

  api.post('/team/login', async (req, res) => {
    const body = TeamLoginSchema.safeParse(req.body);
    if (!body.success) return invalid(res);
    sendAuth(res, await auth.loginTeam(body.data, req.ip ?? ''));
  });

  api.post('/staff/login', async (req, res) => {
    const body = StaffLoginSchema.safeParse(req.body);
    if (!body.success) return invalid(res);
    sendAuth(res, await auth.loginStaff(body.data, req.ip ?? ''));
  });

  // Every route below needs a staff login.
  const staff = express.Router();
  staff.use(async (req: Request, res: Response<unknown, StaffLocals>, next: NextFunction) => {
    const result = await auth.verifyStaff(bearer(req));
    if (!result.ok) return sendAuth(res, result);
    res.locals.staff = result.value;
    next();
  });

  const mainAdminOnly = (
    _req: Request,
    res: Response<unknown, StaffLocals>,
    next: NextFunction,
  ) => {
    if (res.locals.staff.role !== 'MAIN_ADMIN') {
      return res.status(403).json({ code: 'NOT_ALLOWED', message: AUTH_ERRORS.NOT_ALLOWED });
    }
    next();
  };

  // Loads the game's engine, or answers 404.
  async function gameEngine(req: Request, res: Response): Promise<GameEngine | null> {
    try {
      return await engine(String(req.params.gameId));
    } catch (error) {
      console.error(`Could not load game ${String(req.params.gameId)}:`, error);
      res.status(404).json({ code: 'GAME_NOT_FOUND', message: AUTH_ERRORS.GAME_NOT_FOUND });
      return null;
    }
  }

  staff.get('/me', (_req, res: Response<unknown, StaffLocals>) => {
    const { id, name, role } = res.locals.staff;
    res.json({ id, name, role, devTools });
  });

  staff.get('/games', async (_req, res: Response<unknown, StaffLocals>) => {
    res.json(await auth.store.gamesFor(res.locals.staff));
  });

  const control = {
    start: (e: GameEngine, s: StaffAccount) => e.startGame(s.id),
    freeze: (e: GameEngine, s: StaffAccount) => e.freeze(s.id),
    resume: (e: GameEngine, s: StaffAccount) => e.resume(s.id),
    'end-phase': (e: GameEngine, s: StaffAccount) => e.endPhase(s.id),
  } as const;
  for (const [action, run] of Object.entries(control)) {
    staff.post(
      `/games/:gameId/${action}`,
      mainAdminOnly,
      async (req, res: Response<unknown, StaffLocals>) => {
        const e = await gameEngine(req, res);
        if (e) sendEngine(res, await run(e, res.locals.staff));
      },
    );
  }

  staff.post(
    '/games/:gameId/extend',
    mainAdminOnly,
    async (req, res: Response<unknown, StaffLocals>) => {
      const body = ExtendSchema.safeParse(req.body);
      if (!body.success) return invalid(res);
      const e = await gameEngine(req, res);
      if (e) sendEngine(res, await e.extendPhase(res.locals.staff.id, body.data.seconds));
    },
  );

  staff.post('/teams/:teamId/end-session', async (req, res: Response<unknown, StaffLocals>) => {
    sendAuth(res, await auth.endTeamSession(res.locals.staff, String(req.params.teamId)));
  });

  if (admin) addAdminRoutes(staff, admin, mainAdminOnly);

  if (devTools) {
    staff.post(
      '/games/:gameId/dev/finish-tasks/:teamId',
      mainAdminOnly,
      async (req, res: Response<unknown, StaffLocals>) => {
        const body = FinishSchema.safeParse(req.body ?? {});
        if (!body.success) return invalid(res);
        const e = await gameEngine(req, res);
        if (e) {
          const teamId = String(req.params.teamId);
          sendEngine(res, await finishAllTasks(e, teamId, body.data.limit));
        }
      },
    );
  }

  api.use('/staff', staff);
  return api;
}
