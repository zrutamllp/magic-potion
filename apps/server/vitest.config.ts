import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// The database tests need TEST_DATABASE_URL from apps/server/.env (a separate Neon branch).
// Only that value is passed to the tests, plus the host of DATABASE_URL (never its password),
// so a test can refuse to run when both point at the same branch. Everything else in .env
// stays out of the tests.
const file = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const env: Record<string, string> = {};
const testUrl = process.env['TEST_DATABASE_URL'] || file['TEST_DATABASE_URL'];
if (testUrl) env['TEST_DATABASE_URL'] = testUrl;
const mainUrl = process.env['DATABASE_URL'] || file['DATABASE_URL'];
if (mainUrl) {
  try {
    env['MAIN_DATABASE_HOST'] = new URL(mainUrl).host;
  } catch {
    // Not a URL: nothing to compare.
  }
}

export default defineConfig({ test: { env } });
