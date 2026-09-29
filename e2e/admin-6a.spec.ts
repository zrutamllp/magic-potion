import { execFileSync } from 'node:child_process';
import { expect, request, test, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { shooter } from './helpers';

// Phase 6A admin panel screenshots: `npm run screenshots:6a`. A throwaway main admin sets up a
// game from the forms only: create, settings, branding (a real logo upload to Vercel Blob),
// teams and login sheet, a co-facilitator and assignments. Then a team logs in and sees the
// branding, the game starts and the settings lock. Everything made here is deleted afterwards.
// Every screen checks that its main parts fit a 1280x720 window.

const API = 'http://localhost:4000';
const shot = shooter('screenshots/phase6/6a');

let admin: { email: string; password: string };
const uploaded: string[] = [];

function script(...args: string[]): string {
  return execFileSync(
    'node',
    ['--env-file-if-exists=.env', '--import', 'tsx', 'scripts/adminTestUser.ts', ...args],
    { cwd: 'apps/server', encoding: 'utf8' },
  );
}

test.beforeAll(() => {
  const lines = script('create').trim().split('\n');
  admin = JSON.parse(lines[lines.length - 1] ?? '{}') as typeof admin;
});

test.afterAll(() => {
  if (admin) script('delete', admin.email, ...uploaded);
});

async function fits(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  // Keep a picture of the screen if it does not fit.
  await page.screenshot({ path: 'test-results/6a-last-fit-check.png' });
  const box = await target.boundingBox();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(box, 'element has a box').not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, 'bottom edge inside 720').toBeLessThanOrEqual(720);
  expect(box!.x + box!.width, 'right edge inside 1280').toBeLessThanOrEqual(1280);
}

// A plain square logo made on the fly: no real brand, no metadata worth keeping.
async function testLogo(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" rx="48" fill="#0f766e"/>
    <circle cx="128" cy="128" r="70" fill="#fbbf24"/>
    <text x="128" y="150" font-size="72" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#0f766e">AC</text>
  </svg>`;
  return sharp(Buffer.from(svg))
    .png()
    .withExif({ IFD0: { Artist: 'Test person' } })
    .toBuffer();
}

test('the main admin sets up a game from forms only', async ({ page, browser }) => {
  // ---------- Login ----------
  await page.goto('/staff');
  await fits(page, page.getByRole('button', { name: 'Log in' }));
  await shot(page, '01-staff-login');
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByRole('button', { name: 'Log in' }).click();

  // ---------- New game ----------
  await expect(page.getByRole('heading', { name: 'Games', level: 1 })).toBeVisible();
  await page.getByLabel('Game name').fill('Acme leadership offsite');
  await page.getByLabel('Client name').fill('Acme Corp');
  await page.getByLabel('Number of teams').fill('6');
  await fits(page, page.getByRole('button', { name: 'Create game' }));
  await shot(page, '02-new-game');
  await page.getByRole('button', { name: 'Create game' }).click();

  // Straight to the teams, with the login sheet shown once.
  await expect(page.getByRole('heading', { name: 'Login sheet' })).toBeVisible({
    timeout: 20_000,
  });
  const gameId = decodeURIComponent(page.url().split('#/games/')[1]!.split('/')[0]!);
  const sheet = page.getByRole('heading', { name: 'Login sheet' }).locator('xpath=../..');
  await expect(sheet.getByRole('listitem')).toHaveCount(6);
  await fits(page, page.getByRole('button', { name: 'Print login sheet' }));
  await shot(page, '03-teams-login-sheet');

  // The printable sheet opens in its own window.
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Print login sheet' }).click();
  const popup = await popupPromise;
  await expect(popup.getByText('Cut along the dashed lines')).toBeVisible();
  await popup.screenshot({ path: 'screenshots/phase6/6a/04-printable-login-sheet.png' });
  await popup.close();

  // Keep one login to try later.
  const firstCard = sheet.getByRole('listitem').first();
  const [code, password] = ((await firstCard.locator('p.font-mono').textContent()) ?? '').split(
    ' · ',
  );
  expect(code).toMatch(/^[A-Z2-9]{5}$/);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toBe('Acme-leadership-offsite-team-logins.csv');

  // ---------- Teams: rename and add ----------
  await page.getByRole('button', { name: 'Rename Team 1' }).click();
  await page.getByLabel('Team name').fill('Owls');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Owls' })).toBeVisible();
  await page.getByLabel(/Names/).fill('Falcons\nHerons');
  await page.getByRole('button', { name: 'Add teams' }).click();
  await expect(page.getByText('2 teams added.')).toBeVisible();
  await expect(page.getByText('Teams (8)')).toBeVisible();
  await shot(page, '05-teams-added');

  // ---------- Settings ----------
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await fits(page, page.getByRole('button', { name: 'Save settings' }));
  await fits(page, page.getByLabel('Round 1'));
  await shot(page, '06-settings');
  await page.getByLabel('Round 1').fill('two');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Enter a number.')).toBeVisible();
  await shot(page, '07-settings-error');
  await page.getByLabel('Round 1').fill('30');
  await expect(page.getByText('You have unsaved changes')).toBeVisible();
  // Leaving with unsaved changes asks first; "Cancel" stays on the page.
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('You have unsaved changes. Leave without saving?');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Branding', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeVisible();
  // The Save bar stays on screen when scrolled to the bottom.
  await page.getByLabel('Full Potion Bonus').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const bar = await page.getByRole('button', { name: 'Save settings' }).boundingBox();
  expect(bar!.y).toBeGreaterThanOrEqual(0);
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(720);
  await shot(page, '07b-settings-scrolled-unsaved');
  await page.getByLabel('Hint cost').fill('2,000');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await expect(page.getByLabel('Hint cost')).toHaveValue('2000');
  await shot(page, '08-settings-saved');
  await page.getByLabel('Pause').scrollIntoViewIfNeeded();
  await shot(page, '09-settings-all', true);

  // ---------- Branding ----------
  await page.getByRole('button', { name: 'Branding', exact: true }).click();
  await page.getByLabel('Logo file').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: await testLogo(),
  });
  await expect(page.getByText('Logo uploaded. Save to use it.')).toBeVisible();
  const logoUrl = await page.getByRole('img', { name: 'Client logo' }).getAttribute('src');
  expect(logoUrl).toMatch(/^https:\/\/.+\/logos\/[0-9a-f-]{36}\.webp$/);
  uploaded.push(logoUrl!);
  await page.getByLabel('Main colour code').fill('#0f766e');
  await page.getByLabel('Second colour code').fill('#fbbf24');
  await page.getByRole('button', { name: 'Save branding' }).click();
  await expect(page.getByText('Branding saved.')).toBeVisible();
  await fits(page, page.getByRole('button', { name: 'Save branding' }));
  await fits(page, page.getByRole('heading', { name: 'Preview' }).locator('xpath=../..'));
  await shot(page, '10-branding');

  // ---------- Staff and assignments ----------
  await page.getByRole('button', { name: 'Staff', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Priya Test');
  const cofacEmail = admin.email.replace('e2e-admin-', 'e2e-cofac-');
  await page.getByLabel('Email').fill(cofacEmail);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Added. Give them the staff login page')).toBeVisible();
  await fits(page, page.getByRole('heading', { name: 'Staff accounts' }).locator('xpath=../..'));
  await shot(page, '11-staff');

  await page.goto(`/staff#/games/${gameId}/facilitators`);
  const priya = page.getByRole('heading', { name: 'Priya Test' }).locator('xpath=../..');
  await priya.getByLabel('Owls').check();
  await priya.getByLabel('Falcons').check();
  await priya.getByRole('button', { name: 'Save' }).click();
  await expect(priya.getByText('Saved.')).toBeVisible();
  await fits(page, priya);
  await shot(page, '12-co-facilitators');

  // ---------- A team logs in and sees the branding ----------
  const team = await (await browser.newContext()).newPage();
  await team.goto('/');
  await team.getByLabel('Team code').fill(code!);
  await team.getByLabel('Password').fill(password!);
  await team.getByRole('button', { name: 'Log in' }).click();
  await expect(team.getByText('Acme Corp').first()).toBeVisible();
  await expect(team.getByText('Owls').first()).toBeVisible();
  await shot(team, '13-team-lobby-branded');

  // ---------- Start: settings lock ----------
  const api = await request.newContext({ baseURL: API });
  const login = await api.post('/api/staff/login', {
    data: { email: admin.email, password: admin.password },
  });
  const token = ((await login.json()) as { token: string }).token;
  const started = await api.post(`/api/staff/games/${gameId}/start`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(started.ok()).toBe(true);
  await api.dispose();

  await page.goto(`/staff#/games/${gameId}/settings`);
  await page.reload();
  await expect(page.getByText('The game has started.')).toBeVisible();
  await expect(page.getByLabel('Round 1')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  await fits(page, page.getByText('The game has started.'));
  await shot(page, '14-settings-locked');
  // The team's screen moved on to Round 1 by itself.
  await expect(team.getByText('Round 1').first()).toBeVisible();
});
