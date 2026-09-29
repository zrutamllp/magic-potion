import type { NextFunction, Request, Response, Router } from 'express';
import { EXPORT_FILES, exportFileName, type ExportName } from '@magic-potion/shared';
import { buildDebrief } from '../debrief/debrief';
import { buildCsv, buildZip, timeFormatter } from '../debrief/exports';
import type { StaffAccount } from '../auth/store';
import type { GameEngine } from '../engine/engine';
import type { LiveStore } from '../live/store';

// The debrief screen and the CSV exports (GAME_RULES section 13). Main admin only. They open
// at the Reveal, when the scores are final.

export interface DebriefDeps {
  gameEngine: (req: Request, res: Response) => Promise<GameEngine | null>;
  mainAdminOnly: (
    req: Request,
    res: Response<unknown, { staff: StaffAccount }>,
    next: NextFunction,
  ) => unknown;
  store: LiveStore;
}

const NAMES = new Set<string>(EXPORT_FILES.map((f) => f.name));
const WHOLE_LOG = 100_000;

async function finishedGame(req: Request, res: Response, deps: DebriefDeps) {
  const engine = await deps.gameEngine(req, res);
  if (!engine) return null;
  if (engine.state.phase !== 'REVEAL') {
    res.status(409).json({
      code: 'NOT_YET',
      message: 'The debrief and exports open at the Reveal, when the scores are final.',
    });
    return null;
  }
  return engine;
}

function attach(res: Response, filename: string, type: string): void {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

export function addDebriefRoutes(staff: Router, deps: DebriefDeps): void {
  staff.get(
    '/games/:gameId/debrief',
    deps.mainAdminOnly,
    async (req, res: Response<unknown, { staff: StaffAccount }>) => {
      const engine = await finishedGame(req, res, deps);
      if (engine) res.json(buildDebrief(engine));
    },
  );

  staff.get(
    '/games/:gameId/exports/:file',
    deps.mainAdminOnly,
    async (req, res: Response<unknown, { staff: StaffAccount }>) => {
      const file = String(req.params.file);
      const match = /^(.+)\.(csv|zip)$/.exec(file);
      const name = match?.[1] ?? '';
      const isZip = match?.[2] === 'zip' && name === 'all';
      if (!isZip && !(match?.[2] === 'csv' && NAMES.has(name))) {
        res.status(404).json({ code: 'NOT_FOUND', message: 'That export does not exist.' });
        return;
      }
      const engine = await finishedGame(req, res, deps);
      if (!engine) return;
      const src = {
        engine,
        time: timeFormatter(String(req.query['tz'] ?? 'UTC')),
        audit: async () => (await deps.store.auditRows(engine.state.id, null, WHOLE_LOG)).reverse(),
      };
      const game = engine.state.name;
      if (isZip) {
        attach(res, exportFileName(game, 'all'), 'application/zip');
        res.send(await buildZip(src));
        return;
      }
      attach(res, exportFileName(game, name as ExportName), 'text/csv; charset=utf-8');
      res.send(await buildCsv(name as ExportName, src));
    },
  );
}
