import { createApp } from './app';
import { createPrisma } from './db';
import { loadEnv, parseOrigins } from './env';

const env = loadEnv();
const prisma = env.DATABASE_URL ? createPrisma(env.DATABASE_URL) : undefined;

const app = createApp({
  clientOrigins: parseOrigins(env.CLIENT_ORIGIN),
  checkDb: prisma ? () => prisma.$queryRaw`SELECT 1` : undefined,
});

const server = app.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`);
  if (!prisma) console.warn('DATABASE_URL is not set: running without a database.');
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  server.close();
  await prisma?.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
