import { createApp } from './app';
import { createPrisma } from './db';
import { systemClock } from './engine/clock';
import { EngineRegistry } from './engine/registry';
import { loadEnv, parseOrigins } from './env';

const env = loadEnv();
const prisma = env.DATABASE_URL ? createPrisma(env.DATABASE_URL) : undefined;
// Rebuilds live games, their timers and scheduled events from the database.
const engines = prisma ? new EngineRegistry(prisma, systemClock) : undefined;

const app = createApp({
  clientOrigins: parseOrigins(env.CLIENT_ORIGIN),
  checkDb: prisma ? () => prisma.$queryRaw`SELECT 1` : undefined,
});

const server = app.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`);
  if (!prisma) console.warn('DATABASE_URL is not set: running without a database.');
});

if (engines) {
  engines
    .loadLive()
    .then(({ loaded, failed }) => {
      console.log(`Loaded ${loaded.length} live game(s).`);
      for (const f of failed) console.error(`Could not load game ${f.gameId}:`, f.error);
    })
    .catch((error: unknown) => console.error('Could not load live games:', error));
}

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  server.close();
  await engines?.stop();
  await prisma?.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
