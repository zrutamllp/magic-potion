import { defineConfig, devices } from '@playwright/test';

// Playwright runs the real server and web app. Used for screenshots now and the full
// end-to-end game test in Phase 7. If `npm run dev` is already running, it is reused.

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 5 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 720 },
    // The usual Zoom share: a laptop screen at 1x.
    deviceScaleFactor: 1,
  },
  webServer: [
    {
      command: 'npm run dev -w @magic-potion/server',
      url: 'http://localhost:4000/healthz',
      reuseExistingServer: true,
      timeout: 120_000,
      env: { ENABLE_DEV_TOOLS: 'true' },
    },
    {
      command: 'npm run dev -w @magic-potion/web',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
