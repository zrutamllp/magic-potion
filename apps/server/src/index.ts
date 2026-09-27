import { createServer } from 'node:http';
import { createApp } from './app';
import { PrismaAuthStore } from './auth/prismaStore';
import { AuthService } from './auth/service';
import { Tokens } from './auth/tokens';
import { createPrisma } from './db';
import { systemClock } from './engine/clock';
import { EngineRegistry } from './engine/registry';
import { devToolsEnabled, loadEnv, parseOrigins } from './env';
import { createApiRouter } from './http/api';
import { Realtime } from './realtime/server';

const env = loadEnv();
const clientOrigins = parseOrigins(env.CLIENT_ORIGIN);
const devTools = devToolsEnabled(env);
if (env.DATABASE_URL && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required when DATABASE_URL is set. See apps/server/.env.example.');
}
const prisma = env.DATABASE_URL ? createPrisma(env.DATABASE_URL) : undefined;
// Rebuilds live games, their timers and scheduled events from the database.
const engines = prisma ? new EngineRegistry(prisma, systemClock) : undefined;

let realtime: Realtime | undefined;
if (prisma && engines && env.JWT_SECRET) {
  const auth = new AuthService(new PrismaAuthStore(prisma), new Tokens(env.JWT_SECRET));
  realtime = new Realtime({ auth, engines, clock: systemClock, clientOrigins, devTools });
}
const live = realtime;

const app = createApp({
  clientOrigins,
  checkDb: prisma ? () => prisma.$queryRaw`SELECT 1` : undefined,
  api: live
    ? createApiRouter({ auth: live.auth, engine: (id) => live.engine(id), devTools })
    : undefined,
});
const server = createServer(app);
live?.attach(server);

server.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`);
  if (!prisma) console.warn('DATABASE_URL is not set: running without a database.');
  if (devTools) console.warn('Dev tools are ON. Never use ENABLE_DEV_TOOLS for a live event.');
});

if (engines) {
  engines
    .loadLive()
    .then(async ({ loaded, failed }) => {
      console.log(`Loaded ${loaded.length} live game(s).`);
      for (const f of failed) console.error(`Could not load game ${f.gameId}:`, f.error);
      // Listen to them now, so phase changes reach browsers as soon as they connect.
      if (live) await Promise.all(loaded.map((id) => live.engine(id)));
    })
    .catch((error: unknown) => console.error('Could not load live games:', error));
}

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  await live?.close();
  server.close();
  await engines?.stop();
  await prisma?.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
