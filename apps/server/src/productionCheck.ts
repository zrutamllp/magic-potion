import type { Env } from './env';
import { parseOrigins } from './env';

// Before a production server starts (NODE_ENV=production), everything a live event needs must
// be set and safe (Phase 7A). Every problem is listed at once, naming the variable and never its
// value. The database is checked separately: it must be marked as production (src/safety.ts).

const MIN_SECRET = 48;

function sslDisabled(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).searchParams.get('sslmode') === 'disable';
  } catch {
    return false;
  }
}

// Neon's pooled hosts end in "-pooler". Migrations need the direct connection.
function pooledHost(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.split('.')[0]?.endsWith('-pooler') ?? false;
  } catch {
    return false;
  }
}

function localOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return true;
  }
}

export function productionProblems(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  const required = [
    'DATABASE_URL',
    'DIRECT_URL',
    'JWT_SECRET',
    'BLOB_READ_WRITE_TOKEN',
    'BLOB_PRIVATE_READ_WRITE_TOKEN',
    'PHOTO_LINK_SECRET',
  ] as const;
  for (const name of required) {
    if (!env[name]) problems.push(`${name} is missing.`);
  }
  if (env.ENABLE_DEV_TOOLS === 'true') {
    problems.push('ENABLE_DEV_TOOLS is "true". Dev tools must never be on for a live event.');
  }
  for (const name of ['JWT_SECRET', 'PHOTO_LINK_SECRET'] as const) {
    const value = env[name];
    if (value && value.length < MIN_SECRET) {
      problems.push(`${name} is too short: use at least ${MIN_SECRET} random characters.`);
    }
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.PHOTO_LINK_SECRET) {
    problems.push('PHOTO_LINK_SECRET must be different from JWT_SECRET.');
  }
  const origins = parseOrigins(env.CLIENT_ORIGIN);
  if (origins.length === 0 || origins.some(localOrigin)) {
    problems.push('CLIENT_ORIGIN must be the live web address (not localhost).');
  } else if (origins.some((o) => !o.startsWith('https://'))) {
    problems.push('CLIENT_ORIGIN must use https://.');
  }
  for (const name of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    if (sslDisabled(env[name])) problems.push(`${name} has sslmode=disable. Use sslmode=require.`);
  }
  if (pooledHost(env.DIRECT_URL)) {
    problems.push(
      'DIRECT_URL is a pooled connection (-pooler). Use the direct one (Neon: Connection pooling off).',
    );
  }
  return problems;
}
