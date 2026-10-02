import { expect, test, type Page } from '@playwright/test';

// The public connection check page (/check) against the real local server: no login, no game.
// The picture store, YouTube and Vimeo are answered locally so the result does not depend on
// this machine's network; the game server and its live connection are real.

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function fakeOutsideSites(page: Page) {
  await page.route('**/check-info', (route) =>
    route.fulfill({
      json: {
        testImageUrl: 'https://test.public.blob.vercel-storage.com/connection-check/pixel.png',
      },
    }),
  );
  await page.route('https://test.public.blob.vercel-storage.com/**', (route) =>
    route.fulfill({ body: PIXEL, contentType: 'image/png' }),
  );
  await page.route(/youtube-nocookie\.com|player\.vimeo\.com/, (route) =>
    route.fulfill({ body: 'ok' }),
  );
}

async function finished(page: Page) {
  await expect(page.getByRole('button', { name: 'Run again' })).toBeEnabled({ timeout: 60_000 });
}

test('everything works: Ready to play, every row finished', async ({ page }) => {
  await fakeOutsideSites(page);
  await page.goto('/check');
  await expect(
    page.getByRole('heading', { name: 'Magic Potion Challenge – Connection check' }),
  ).toBeVisible();
  await finished(page);
  await expect(page.getByText('Ready to play')).toBeVisible();
  await expect(page.getByText('Share these results with your event organiser.')).toBeVisible();
  for (const key of ['website', 'server', 'polling', 'websocket', 'speed', 'pictures']) {
    await expect(page.getByTestId(`check-${key}`)).toHaveAttribute('data-status', 'pass');
  }
  await expect(page.locator('[data-status="running"]')).toHaveCount(0);
  await page.screenshot({ path: 'screenshots/check-desktop.png', fullPage: true });
});

test('WebSocket blocked: works with long-polling, With limits, and says what to allow', async ({
  page,
}) => {
  await fakeOutsideSites(page);
  // Like a corporate proxy that refuses WebSocket upgrades.
  await page.routeWebSocket(/socket\.io/, (ws) => ws.close());
  await page.goto('/check');
  await finished(page);
  await expect(page.getByText('Will work, with limits')).toBeVisible();
  await expect(page.getByTestId('check-polling')).toHaveAttribute('data-status', 'pass');
  await expect(page.getByTestId('check-websocket')).toHaveAttribute('data-status', 'warn');
  await expect(page.getByTestId('check-speed')).toHaveAttribute('data-status', /pass|warn/);
  await expect(page.getByText(/^wss:\/\/.* \(WebSocket, port 443\)$/)).toBeVisible();
  await page.screenshot({ path: 'screenshots/check-polling-only.png', fullPage: true });
});

test('game server unreachable: Blocked', async ({ page }) => {
  await fakeOutsideSites(page);
  await page.route('**/healthz', (route) => route.abort());
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.routeWebSocket(/socket\.io/, (ws) => ws.close());
  await page.goto('/check');
  await finished(page);
  await expect(page.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(page.getByText(/Send this page to your IT team/)).toBeVisible();
});

test('works on a phone, and copies the results', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  await fakeOutsideSites(page);
  await page.goto('/check');
  await finished(page);
  // Nothing wider than the screen.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'screenshots/check-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Copy results' }).click();
  await expect(page.getByText(/^Copied/)).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Magic Potion Challenge – Connection check');
  expect(text).toMatch(/Date: .+/);
  expect(text).toContain('Result: Ready to play');
  await context.close();
});
