import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { withVerifyFullSsl } from './sslUrl';

export { withVerifyFullSsl };

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: withVerifyFullSsl(databaseUrl) }),
  });
}
