import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Comma-separated list of allowed frontend origins.
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  // Optional until Phase 1 adds the data model; /healthz reports "not_configured" without it.
  DATABASE_URL: z.url().optional(),
  DIRECT_URL: z.url().optional(),
  // Used from Phase 3 (auth).
  JWT_SECRET: z.string().min(32).optional(),
  ADMIN_SEED_EMAIL: z.email().optional(),
  ADMIN_SEED_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty values (as left by a copied .env.example) as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

export function parseOrigins(value: string): string[] {
  return value
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
