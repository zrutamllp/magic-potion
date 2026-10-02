import type { NextFunction, Request, Response } from 'express';
import { validActionId, type RecentActions } from '../idempotency';
import type { StaffAccount } from '../auth/store';

// Staff changes are safe to repeat (Phase 7C). The admin panel and the dashboard send an
// Idempotency-Key with every change and the same key again when the network dropped before the
// answer came. The first request runs; a repeat gets the same status and answer and changes
// nothing (so "End phase" pressed again never ends the next phase too).

const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Never replayed: files and spreadsheets are read from the request itself, and previews are
// throwaway. They run exactly as before, with or without a key.
const NEVER_REPLAYED = [
  /^\/uploads\//,
  /^\/packs\/[^/]+\/import$/,
  /^\/packs\/[^/]+\/items\/bulk$/,
  /^\/preview(\/|$)/,
];

interface Answer {
  status: number;
  body: unknown;
  retryAfter?: string;
}

export function idempotentStaffChanges(recent: RecentActions) {
  return (req: Request, res: Response<unknown, { staff: StaffAccount }>, next: NextFunction) => {
    const key = req.get('Idempotency-Key');
    if (!CHANGES.has(req.method) || !validActionId(key)) return next();
    if (NEVER_REPLAYED.some((r) => r.test(req.path))) return next();

    // One key belongs to one change: the same key on another route is a different change.
    const owner = `staff:${res.locals.staff.id}:${req.method} ${req.path}`;
    let first = false;
    const answer = recent.run(owner, key, () => {
      first = true;
      return new Promise<Answer>((resolve) => {
        const json = res.json.bind(res);
        res.json = (body: unknown) => {
          resolve({
            status: res.statusCode,
            body,
            retryAfter: res.getHeader('Retry-After')?.toString(),
          });
          return json(body);
        };
        // Answered without JSON or not at all: nothing to replay.
        res.on('close', () => resolve({ status: 500, body: undefined }));
        next();
      });
    });
    if (first) return;
    void answer.then((a) => {
      if (a.body === undefined) return next();
      if (a.retryAfter) res.setHeader('Retry-After', a.retryAfter);
      res.status(a.status).json(a.body);
    });
  };
}

// Only final answers are kept: a server error or "busy" (5xx) lets the repeat run again.
export const keepFinalAnswers = (value: unknown): boolean =>
  typeof value !== 'object' ||
  value === null ||
  !('status' in value) ||
  (value as Answer).status < 500;
