import type { NextFunction, Request, Response, Router } from 'express';
import type { z } from 'zod';
import {
  AUTH_ERRORS,
  AdjustFundsSchema,
  BroadcastMessageSchema,
  DecideAdjustmentSchema,
  LiveRenameSchema,
  RejectPhotoSchema,
  ReleaseFragmentSchema,
  RemoveTeamSchema,
  StopTaskSchema,
  TaskActionSchema,
  UNDOABLE_ACTIONS,
  type AdjustReply,
  type AuditRowView,
  type EngineResult,
  type PhotoLinkReply,
  type ResetLoginReply,
} from '@magic-potion/shared';
import type { AdminService } from '../admin/service';
import type { AuthService } from '../auth/service';
import type { StaffAccount } from '../auth/store';
import type { Json } from '../engine/checkers';
import type { GameEngine } from '../engine/engine';
import type { LiveStore, StoredAuditRow } from '../live/store';
import { isPhotoKey, type PhotoLinks } from '../uploads/photos';

// Live control and the facilitator dashboard (Phase 6C), under /api/staff/games/:gameId/live.
// Who may do what follows GAME_RULES section 11 and is checked here, on the server:
// the main admin may act on any team; a co-facilitator only on their assigned teams, with
// fund changes up to the limit (larger ones wait for the admin).

type StaffLocals = { staff: StaffAccount };
type Res = Response<unknown, StaffLocals>;
type Guard = (req: Request, res: Res, next: NextFunction) => void;

export interface LiveDeps {
  auth: AuthService;
  gameEngine: (req: Request, res: Response) => Promise<GameEngine | null>;
  mainAdminOnly: Guard;
  store: LiveStore;
  // Login resets need the admin service (new passwords).
  admin?: AdminService;
  // Tells open dashboards the audit log changed, for changes made outside the engine.
  onAudit?: (gameId: string) => void;
  // Signs short-lived links to team photos (Phase 7A).
  photoLinks?: PhotoLinks;
  now?: () => number;
}

const AUDIT_LIMIT = 300;

function refuse(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ ok: false, code, message });
}

function notAllowed(res: Response): void {
  refuse(res, 403, 'NOT_ALLOWED', AUTH_ERRORS.NOT_ALLOWED);
}

function send(res: Response, result: EngineResult<unknown>, value?: unknown): void {
  if (result.ok) res.json({ ok: true, value: value ?? result.value ?? null });
  else refuse(res, 400, result.code, result.message);
}

function parse<S extends z.ZodType>(schema: S, req: Request, res: Response): z.infer<S> | null {
  const body = schema.safeParse(req.body ?? {});
  if (body.success) return body.data;
  const message = body.error.issues[0]?.message;
  refuse(
    res,
    400,
    'INVALID_REQUEST',
    message && !message.startsWith('Invalid') ? message : AUTH_ERRORS.INVALID_REQUEST,
  );
  return null;
}

const isAdmin = (staff: StaffAccount) => staff.role === 'MAIN_ADMIN';

export function canUndo(row: StoredAuditRow, staff: StaffAccount): boolean {
  if (!(UNDOABLE_ACTIONS as readonly string[]).includes(row.action)) return false;
  if (row.undoneAt !== null || row.undoOfId !== null) return false;
  // Main admin: any change. Co-facilitator: their own changes only.
  return isAdmin(staff) || row.staffUserId === staff.id;
}

export function addLiveRoutes(staff: Router, deps: LiveDeps): void {
  const { auth, gameEngine, mainAdminOnly, store } = deps;
  const base = '/games/:gameId/live';

  // The engine, if this staff member may act on this team of this game.
  async function teamEngine(req: Request, res: Res, teamId: string): Promise<GameEngine | null> {
    const engine = await gameEngine(req, res);
    if (!engine) return null;
    if (!engine.state.teams[teamId]) {
      refuse(res, 404, 'TEAM_NOT_FOUND', 'That team is not in this game.');
      return null;
    }
    if (!(await auth.canManageTeam(res.locals.staff, engine.state.id, teamId))) {
      notAllowed(res);
      return null;
    }
    return engine;
  }

  // ---------- Admin and co-facilitator (assigned teams) ----------

  staff.post(`${base}/teams/:teamId/adjust`, async (req, res: Res) => {
    const body = parse(AdjustFundsSchema, req, res);
    if (!body) return;
    const teamId = String(req.params.teamId);
    const engine = await teamEngine(req, res, teamId);
    if (!engine) return;
    const me = res.locals.staff;
    const limit = engine.state.settings.staff.coFacilitatorAdjustLimit;
    if (isAdmin(me) || Math.abs(body.amount) <= limit) {
      const result = await engine.adjustFunds(me.id, teamId, body.amount, body.reason);
      send(res, result, { outcome: 'applied' } satisfies AdjustReply);
      return;
    }
    const result = await engine.requestAdjustment(me, teamId, body.amount, body.reason);
    send(res, result, { outcome: 'requested' } satisfies AdjustReply);
  });

  staff.post(`${base}/teams/:teamId/rename`, async (req, res: Res) => {
    const body = parse(LiveRenameSchema, req, res);
    if (!body) return;
    const teamId = String(req.params.teamId);
    const engine = await teamEngine(req, res, teamId);
    if (!engine) return;
    const me = res.locals.staff;
    // Before the start the admin panel's rename applies (the Lobby reloads the game).
    if (engine.state.phase === 'LOBBY' && deps.admin) {
      const result = await deps.admin.renameTeam(me, engine.state.id, teamId, body.name);
      if (result.ok) res.json({ ok: true, value: null });
      else refuse(res, result.status, result.code, result.message);
      return;
    }
    send(res, await engine.renameTeam(me.id, teamId, body.name));
  });

  staff.post(`${base}/teams/:teamId/reset-login`, async (req, res: Res) => {
    const teamId = String(req.params.teamId);
    const engine = await teamEngine(req, res, teamId);
    if (!engine) return;
    if (!deps.admin) return refuse(res, 503, 'NOT_SET_UP', 'Login reset is not set up.');
    const gameId = engine.state.id;
    const result = await deps.admin.resetPasswords(res.locals.staff, gameId, [teamId]);
    if (!result.ok) return refuse(res, result.status, result.code, result.message);
    const card = result.value[0];
    if (!card) return refuse(res, 404, 'TEAM_NOT_FOUND', 'That team is not in this game.');
    deps.onAudit?.(gameId);
    // The new password is shown once, to the staff member who reset it.
    const value: ResetLoginReply = {
      teamId,
      teamName: card.name,
      code: card.code,
      password: card.password,
    };
    res.json({ ok: true, value });
  });

  staff.post(`${base}/release-fragment`, async (req, res: Res) => {
    const body = parse(ReleaseFragmentSchema, req, res);
    if (!body) return;
    const engine = await gameEngine(req, res);
    if (!engine) return;
    const fragment = engine.state.fragments[body.fragmentId];
    if (!fragment) return refuse(res, 404, 'FRAGMENT_NOT_FOUND', 'That fragment was not found.');
    // Allowed for the team that needs the fragment (GAME_RULES section 15, answer 2).
    const needs = fragment.neededByTeamId;
    if (!(await auth.canManageTeam(res.locals.staff, engine.state.id, needs))) {
      return notAllowed(res);
    }
    send(res, await engine.releaseFragment(res.locals.staff.id, body.fragmentId));
  });

  // A link to the team's photo for this staff member, valid for a few minutes. Admin: any team;
  // co-facilitator: assigned teams only. Players never get one.
  staff.get(`${base}/teams/:teamId/photo-link`, async (req, res: Res) => {
    const teamId = String(req.params.teamId);
    const engine = await teamEngine(req, res, teamId);
    if (!engine) return;
    if (!deps.photoLinks) return refuse(res, 503, 'NO_UPLOADS', 'Team photos are not set up.');
    const key = Object.values(engine.state.teams[teamId]?.inbox ?? {})
      .filter((r) => engine.state.inboxItems[r.inboxItemId]?.kind === 'PHOTO')
      .map((r) => r.photoUrl)
      .find(isPhotoKey);
    if (!key) return refuse(res, 404, 'NO_PHOTO', 'This team has no photo.');
    const link = deps.photoLinks.sign(key, (deps.now ?? Date.now)());
    const value: PhotoLinkReply = { url: `/api/photo/${link.token}`, expiresAt: link.expiresAt };
    res.json(value);
  });

  // Rejecting a team photo removes its 1,000 until the team sends an accepted one. The team
  // may upload again.
  staff.post(`${base}/teams/:teamId/photo/reject`, async (req, res: Res) => {
    const body = parse(RejectPhotoSchema, req, res);
    if (!body) return;
    const teamId = String(req.params.teamId);
    const engine = await teamEngine(req, res, teamId);
    if (!engine) return;
    const team = engine.state.teams[teamId];
    const itemId = Object.values(team?.inbox ?? {}).find(
      (r) => engine.state.inboxItems[r.inboxItemId]?.kind === 'PHOTO',
    )?.inboxItemId;
    if (!itemId) return refuse(res, 400, 'NO_PHOTO', 'This team has not sent a photo.');
    send(res, await engine.rejectPhoto(res.locals.staff.id, teamId, itemId, body.reason));
  });

  // ---------- Audit log and undo ----------

  staff.get(`${base}/audit`, async (req, res: Res) => {
    const engine = await gameEngine(req, res);
    if (!engine) return;
    const me = res.locals.staff;
    const teams = isAdmin(me) ? null : await auth.store.assignedTeamIds(me.id, engine.state.id);
    const rows = await store.auditRows(engine.state.id, teams, AUDIT_LIMIT);
    const view: AuditRowView[] = rows.map((r) => ({
      id: r.id,
      at: r.createdAt,
      staffName: r.staffName,
      teamName: r.teamName,
      action: r.action,
      before: r.before,
      after: r.after,
      reason: r.reason,
      undoneAt: r.undoneAt,
      undoOfId: r.undoOfId,
      canUndo: canUndo(r, me),
    }));
    res.json(view);
  });

  staff.post(`${base}/audit/:auditId/undo`, async (req, res: Res) => {
    const engine = await gameEngine(req, res);
    if (!engine) return;
    const me = res.locals.staff;
    const row = await store.auditRow(String(req.params.auditId));
    if (!row || row.gameId !== engine.state.id) {
      return refuse(res, 404, 'NOTHING_TO_UNDO', 'That change was not found.');
    }
    if (!isAdmin(me) && row.staffUserId !== me.id) return notAllowed(res);
    if (row.teamId && !(await auth.canManageTeam(me, engine.state.id, row.teamId))) {
      return notAllowed(res);
    }
    const reason =
      typeof req.body?.reason === 'string' ? String(req.body.reason).slice(0, 300) : '';
    try {
      const result = await engine.undo(
        me.id,
        {
          id: row.id,
          action: row.action,
          teamId: row.teamId,
          before: (row.before ?? null) as Json,
          after: (row.after ?? null) as Json,
          undoneAt: row.undoneAt,
          undoOfId: row.undoOfId,
        },
        reason,
      );
      send(res, result);
    } catch (error) {
      // Two undos at once: the database allows only one row to undo each change.
      console.error('Undo failed:', error);
      refuse(res, 409, 'ALREADY_UNDONE', 'That change has already been undone.');
    }
  });

  // ---------- Main admin only ----------

  staff.post(`${base}/message`, mainAdminOnly, async (req, res: Res) => {
    const body = parse(BroadcastMessageSchema, req, res);
    if (!body) return;
    const engine = await gameEngine(req, res);
    if (engine) send(res, await engine.postMessage(res.locals.staff.id, body.title, body.body));
  });

  staff.post(`${base}/teams/:teamId/clear-lockout`, mainAdminOnly, async (req, res: Res) => {
    const body = parse(TaskActionSchema, req, res);
    if (!body) return;
    const teamId = String(req.params.teamId);
    const engine = await teamEngine(req, res, teamId);
    if (engine) send(res, await engine.clearLockout(res.locals.staff.id, teamId, body.taskId));
  });

  staff.post(`${base}/teams/:teamId/stop-task`, mainAdminOnly, async (req, res: Res) => {
    const body = parse(StopTaskSchema, req, res);
    if (!body) return;
    const teamId = String(req.params.teamId);
    const engine = await teamEngine(req, res, teamId);
    if (engine) {
      send(res, await engine.stopTask(res.locals.staff.id, teamId, body.taskId, body.reason ?? ''));
    }
  });

  staff.post(`${base}/teams/:teamId/remove`, mainAdminOnly, async (req, res: Res) => {
    const body = parse(RemoveTeamSchema, req, res);
    if (!body) return;
    const teamId = String(req.params.teamId);
    const engine = await teamEngine(req, res, teamId);
    if (engine) send(res, await engine.removeTeam(res.locals.staff.id, teamId, body.reason));
  });

  staff.post(`${base}/adjustments/:requestId`, mainAdminOnly, async (req, res: Res) => {
    const body = parse(DecideAdjustmentSchema, req, res);
    if (!body) return;
    const engine = await gameEngine(req, res);
    if (!engine) return;
    const id = String(req.params.requestId);
    send(res, await engine.decideAdjustment(res.locals.staff.id, id, body.approve, body.note));
  });
}
