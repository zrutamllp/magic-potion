import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Comma-separated list of allowed frontend origins.
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  // Optional until Phase 1 adds the data model; /healthz reports "not_configured" without it.
  DATABASE_URL: z.url().optional(),
  DIRECT_URL: z.url().optional(),
  // Signs login tokens. Required when DATABASE_URL is set (checked on server start).
  JWT_SECRET: z.string().min(32).optional(),
  ADMIN_SEED_EMAIL: z.email().optional(),
  ADMIN_SEED_PASSWORD: z.string().min(8).optional(),
  // Vercel Blob read-write token, for uploaded pictures (client logo, task images). Uploads are
  // switched off without it. Never log it.
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  // Failed logins of any kind from one address in 10 minutes before that address must wait.
  // High on purpose: a whole room of teams can share one office Wi-Fi or VPN address.
  LOGIN_FAILURES_PER_ADDRESS: z.coerce.number().int().min(20).max(10_000).default(200),
  // Team photos (Phase 7A): a PRIVATE Vercel Blob store, and the secret that signs the
  // short-lived staff-only photo links (its own secret, separate from JWT_SECRET). Photo upload
  // is off unless both are set. Never log them.
  BLOB_PRIVATE_READ_WRITE_TOKEN: z.string().min(1).optional(),
  PHOTO_LINK_SECRET: z.string().min(32).optional(),
  // Local testing helpers (such as "finish all tasks"). Ignored in production.
  ENABLE_DEV_TOOLS: z.enum(['true', 'false']).optional(),
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

export function devToolsEnabled(env: Env): boolean {
  return env.ENABLE_DEV_TOOLS === 'true' && env.NODE_ENV !== 'production';
}
