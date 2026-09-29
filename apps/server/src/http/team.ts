import type { Request, Response, Router } from 'express';
import { AUTH_ERRORS } from '@magic-potion/shared';
import type { AuthService } from '../auth/service';
import type { GameEngine } from '../engine/engine';
import type { FileStore } from '../uploads/blob';
import { cleanImage } from '../uploads/image';
import { readImage } from './rawImage';

// Team REST routes. Everything else a team does goes over Socket.IO; a photo is too big for it.

export interface TeamRouteDeps {
  auth: AuthService;
  engine: (gameId: string) => Promise<GameEngine>;
  files?: FileStore;
}

// Team photos are saved under random names in their own folder, with all metadata removed.
export const TEAM_PHOTO_FOLDER = 'team-photos';
const PHOTO_MAX_SIDE = 1600;

function bearer(req: Request): string | undefined {
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

function refuse(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ ok: false, code, message });
}

export function addTeamRoutes(api: Router, { auth, engine, files }: TeamRouteDeps): void {
  api.post('/team/inbox/:itemId/photo', readImage, async (req, res) => {
    const login = await auth.verifyTeam(bearer(req));
    if (!login.ok) return refuse(res, login.status, login.code, login.message);
    const { teamId, gameId } = login.value;
    const itemId = String(req.params.itemId);
    if (!files) return refuse(res, 503, 'NO_UPLOADS', 'Photo upload is not set up yet.');

    let game: GameEngine;
    try {
      game = await engine(gameId);
    } catch {
      return refuse(res, 404, 'GAME_NOT_FOUND', AUTH_ERRORS.GAME_NOT_FOUND);
    }
    // Nothing is stored for a task that is closed, paused or already done.
    const open = game.canSubmitPhoto(teamId, itemId);
    if (!open.ok) return refuse(res, 400, open.code, open.message);

    const input = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const image = await cleanImage(input, PHOTO_MAX_SIDE);
    if (!image.ok) return refuse(res, 400, 'BAD_IMAGE', image.message);

    let url: string;
    try {
      url = await files.save(TEAM_PHOTO_FOLDER, image.data, 'image/webp', 'webp');
    } catch (error) {
      console.error('Photo upload failed:', error instanceof Error ? error.message : 'unknown');
      return refuse(res, 502, 'UPLOAD_FAILED', 'The upload did not work. Please try again.');
    }
    const result = await game.submitPhoto(teamId, itemId, url);
    if (!result.ok) {
      // Play changed while uploading (for example the admin paused): do not keep the file.
      await files.remove([url]).catch(() => {});
      return refuse(res, 400, result.code, result.message);
    }
    res.json({ ok: true, value: null });
  });
}
