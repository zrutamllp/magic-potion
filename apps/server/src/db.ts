import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { withVerifyFullSsl } from './sslUrl';

export { withVerifyFullSsl };

// Connections to Neon's pooled endpoint (Phase 7C). Neon accepts far more; one 0.5 CPU server
// gains nothing from more than 20. A request waits at most 10 s for a free connection, then
// fails as "busy" (503, try again) instead of waiting for ever. Idle connections are kept for
// 30 s, so a busy minute does not open new ones (each needs a DNS lookup and a TLS handshake).
export const DB_POOL = { max: 20, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 };

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: withVerifyFullSsl(databaseUrl), ...DB_POOL }),
  });
}
