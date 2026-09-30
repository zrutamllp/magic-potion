import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';
import { withVerifyFullSsl } from './src/sslUrl';

if (existsSync('.env')) process.loadEnvFile('.env');

// The CLI (migrations) uses the direct Neon connection.
// The app itself connects through the pooled DATABASE_URL (see src/db.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --import tsx prisma/seed.ts',
  },
  // Migrations use sslmode=verify-full too (Phase 7A).
  datasource: {
    url: process.env['DIRECT_URL'] ? withVerifyFullSsl(process.env['DIRECT_URL']) : undefined,
  },
});
