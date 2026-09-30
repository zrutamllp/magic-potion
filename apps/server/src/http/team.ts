import type { Request, Response, Router } from 'express';
import { AUTH_ERRORS } from '@magic-potion/shared';
import type { AuthService } from '../auth/service';
import type { GameEngine } from '../engine/engine';
import { cleanImage } from '../uploads/image';
import { isPhotoKey, type PhotoLinks, type PhotoStore } from '../uploads/photos';
import { readImage } from './rawImage';

// Team REST routes. Everything else a team does goes over Socket.IO; a photo is too big for it.
// Also the photo link route: staff get short-lived signed links to team photos (Phase 7A).

export interface TeamRouteDeps {
  auth: AuthService;
  engine: (gameId: string) => Promise<GameEngine>;
  // The private store for team photos, and the link signer. Photos are off without them.
  photos?: PhotoStore;
  photoLinks?: PhotoLinks;
  now?: () => number;
}

const PHOTO_MAX_SIDE = 1600;

function bearer(req: Request): string | undefined {
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

function refuse(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ ok: false, code, message });
}

export function addTeamRoutes(
  api: Router,
  { auth, engine, photos, photoLinks, now = Date.now }: TeamRouteDeps,
): void {
  api.post('/team/inbox/:itemId/photo', readImage, async (req, res) => {
    const login = await auth.verifyTeam(bearer(req));
    if (!login.ok) return refuse(res, login.status, login.code, login.message);
    const { teamId, gameId } = login.value;
    const itemId = String(req.params.itemId);
    if (!photos || !photoLinks) {
      return refuse(res, 503, 'NO_UPLOADS', 'Photo upload is not set up yet.');
    }

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

    let key: string;
    try {
      key = await photos.save(image.data);
    } catch (error) {
      console.error('Photo upload failed:', error instanceof Error ? error.message : 'unknown');
      return refuse(res, 502, 'UPLOAD_FAILED', 'The upload did not work. Please try again.');
    }
    // A photo that staff rejected is replaced now; its file is deleted once the new one is in.
    const replaced = game.state.teams[teamId]?.inbox[itemId]?.photoUrl ?? null;
    const result = await game.submitPhoto(teamId, itemId, key);
    if (!result.ok) {
      // Play changed while uploading (for example the admin paused): do not keep the file.
      await photos.remove([key]).catch(() => {});
      return refuse(res, 400, result.code, result.message);
    }
    if (isPhotoKey(replaced) && replaced !== key) {
      // Photos show real people: never leave an old one behind. A failure is only logged; the
      // photo is no longer linked to the game.
      await photos.remove([replaced]).catch((error: unknown) => {
        console.error(
          'Could not delete a replaced photo:',
          error instanceof Error ? error.message : 'unknown',
        );
      });
    }
    res.json({ ok: true, value: null });
  });

  // A photo link, signed for staff by /api/staff/games/:id/live/teams/:teamId/photo-link.
  // The signature and the time are the only check: the link itself is the permission, and it
  // runs out after 5 minutes.
  api.get('/photo/:token', async (req, res) => {
    const key = photoLinks?.verify(String(req.params.token), now());
    if (!photos || !key) {
      return refuse(res, 403, 'LINK_EXPIRED', 'This photo link has run out. Open the photo again.');
    }
    let data: Buffer | null;
    try {
      data = await photos.read(key);
    } catch (error) {
      console.error('Photo read failed:', error instanceof Error ? error.message : 'unknown');
      return refuse(res, 502, 'PHOTO_FAILED', 'The photo could not be loaded. Please try again.');
    }
    if (!data) return refuse(res, 404, 'PHOTO_GONE', 'This photo has been deleted.');
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.send(data);
  });
}
