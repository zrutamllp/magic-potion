import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

// pg treats sslmode "prefer", "require" and "verify-ca" as "verify-full" and prints a security
// warning for them. Neon's connection strings say "require", so ask for "verify-full" directly:
// same behaviour, no warning, and it stays correct when pg changes those modes.
export function withVerifyFullSsl(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return databaseUrl;
  }
  const mode = url.searchParams.get('sslmode');
  if (mode !== 'prefer' && mode !== 'require' && mode !== 'verify-ca') return databaseUrl;
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: withVerifyFullSsl(databaseUrl) }),
  });
}
