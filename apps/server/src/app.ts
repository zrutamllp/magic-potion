import cors from 'cors';
import express, { type Express } from 'express';
import type { HealthResponse } from '@magic-potion/shared';

const DB_CHECK_TIMEOUT_MS = 3000;

export interface AppOptions {
  clientOrigins: string[];
  /** Resolves when the database answers. Omit when no database is configured. */
  checkDb?: () => Promise<unknown>;
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

export function createApp({ clientOrigins, checkDb }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
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

  return app;
}
