import cors from 'cors';
import express, { type ErrorRequestHandler, type Express, type Router } from 'express';
import helmet from 'helmet';
import type { HealthResponse } from '@magic-potion/shared';

const DB_CHECK_TIMEOUT_MS = 3000;

export interface AppOptions {
  clientOrigins: string[];
  /** Resolves when the database answers. Omit when no database is configured. */
  checkDb?: () => Promise<unknown>;
  /** Mounted at /api. Omitted when there is no database (the health check still works). */
  api?: Router;
}

async function dbStatus(checkDb: AppOptions['checkDb']): Promise<HealthResponse['db']> {
  if (!checkDb) return 'not_configured';
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('db check timed out')), DB_CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([checkDb(), timeout]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error('Request failed:', error);
  if (res.headersSent) return;
  res
    .status(500)
    .json({ code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
};

export function createApp({ clientOrigins, checkDb, api }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  // Render sits in front as one proxy; this makes req.ip the player's address (for login limits).
  app.set('trust proxy', 1);
  // Security headers (Phase 7A). The server only answers with data and team photos, never with
  // pages: nothing may run scripts from it or show it in a frame. Photos are shown by the web
  // app on the sister domain (play. and api. of one site), so they may be loaded same-site.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
      xFrameOptions: { action: 'deny' },
    }),
  );
  app.use(cors({ origin: clientOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/healthz', async (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      db: await dbStatus(checkDb),
      time: new Date().toISOString(),
    };
    res.json(body);
  });

  if (api) app.use('/api', api);
  app.use(handleError);
  return app;
}
