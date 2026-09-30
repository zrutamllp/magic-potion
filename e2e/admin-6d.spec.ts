import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import JSZip from 'jszip';
import sharp from 'sharp';
import type { AdminGame, CreatedGame, TeamLoginCard } from '@magic-potion/shared';
import { shooter } from './helpers';

// Phase 6D screenshots: `npm run screenshots:6d`. A throwaway main admin runs a 4-team game:
// teams upload the team photo (a drawn test picture, no real people), staff reject one and the
// team sends a new one; the projector is shown in every phase at 1280x720 and 1920x1080 (no
// scores in Round 1); the Reveal runs step by step with the potion not full; the Debrief and
// every CSV download are checked. Everything made here, photos included, is deleted afterwards.

const API = 'http://localhost:4000';
const shot = shooter('screenshots/phase6/6d');
const SIZES = [
  { width: 1280, height: 720, tag: '1280' },
  { width: 1920, height: 1080, tag: '1920' },
] as const;

let admin: { email: string; password: string };
let api: APIRequestContext;
let staffToken: string;
let game: AdminGame;
let logins: TeamLoginCard[];

function script(...args: string[]): string {
  return execFileSync(
    'node',
    ['--env-file-if-exists=.env', '--import', 'tsx', 'scripts/adminTestUser.ts', ...args],
    { cwd: 'apps/server', encoding: 'utf8' },
  );
}

async function call<T>(method: 'get' | 'post' | 'put', path: string, data?: object): Promise<T> {
  const res = await api[method](path, data ? { data } : undefined);
  const body = (await res.json()) as T & { message?: string };
  if (!res.ok()) throw new Error(`${path}: ${body.message ?? res.status()}`);
  return body;
}

test.beforeAll(async () => {
  const lines = script('create').trim().split('\n');
  admin = JSON.parse(lines[lines.length - 1] ?? '{}') as typeof admin;
  const anon = await request.newContext({ baseURL: API });
  const login = await anon.post('/api/staff/login', { data: admin });
  const { token } = (await login.json()) as { token: string };
  staffToken = token;
  await anon.dispose();
  api = await request.newContext({
    baseURL: `${API}/api/staff/`,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  const created = await call<CreatedGame>('post', 'games', {
    name: 'Projector test',
    clientName: 'Acme',
    teamCount: 4,
  });
  logins = created.logins;
  // The team photo opens at the start, so the test does not wait 10 minutes.
  const settings = structuredClone(created.game.settings);
  settings.inbox.releaseAtPlaySeconds = [0, 0, 1800];
  await call('put', `games/${created.game.id}/settings`, { settings });
  game = await call<AdminGame>('get', `games/${created.game.id}`);
});

test.afterAll(async () => {
  await api?.dispose();
  // Also deletes the team photos uploaded in this game.
  if (admin) script('delete', admin.email);
});

// A drawn test picture: shapes, no real people.
function teamPicture(color: string): Promise<Buffer> {
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">
      <rect width="800" height="500" fill="#e0f2fe"/>
      ${[120, 280, 440, 600]
        .map(
          (x) => `<circle cx="${x + 40}" cy="200" r="55" fill="${color}"/>
          <rect x="${x - 10}" y="265" width="100" height="160" rx="40" fill="${color}"/>`,
        )
        .join('')}
    </svg>`),
  )
    .jpeg()
    .toBuffer();
}

async function staffLogin(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await page.goto('/staff');
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
  return page;
}

async function teamLogin(browser: Browser, i: number) {
  const card = logins[i]!;
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByLabel('Team code').fill(card.code);
  await page.getByLabel('Password').fill(card.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText(card.name).first()).toBeVisible();
  return page;
}

async function uploadPhoto(page: Page, color: string) {
  await page.evaluate(() => (window.location.hash = '#/inbox'));
  await page
    .getByLabel('Photo for Team photo')
    .setInputFiles({ name: 'team.jpg', mimeType: 'image/jpeg', buffer: await teamPicture(color) });
}

// Nothing may scroll or be cut off on the projector.
async function fitsScreen(page: Page) {
  const size = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
    vw: window.innerWidth,
    vh: window.innerHeight,
  }));
  expect(size.w, 'no sideways scroll').toBeLessThanOrEqual(size.vw);
  expect(size.h, 'no scroll down').toBeLessThanOrEqual(size.vh);
  // Team names are shown whole, never cut to "Team…".
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll('main .truncate')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent),
  );
  expect(cut, 'names cut short').toEqual([]);
}

async function projectorShots(projector: Page, name: string) {
  for (const s of SIZES) {
    await projector.setViewportSize({ width: s.width, height: s.height });
    await fitsScreen(projector);
    await shot(projector, `${name}-${s.tag}`);
  }
}

test('team photo, projector, debrief and exports', async ({ browser }) => {
  const id = game.id;
  const teamId = (i: number) => game.teams.find((t) => t.code === logins[i]!.code)!.id;
  await call('post', `games/${id}/start`);

  // ---------- Team photo ----------
  const t1 = await teamLogin(browser, 0);
  await t1.evaluate(() => (window.location.hash = '#/inbox'));
  await expect(
    t1.getByText(
      'Only the facilitators see this photo. It is deleted automatically after 30 days.',
    ),
  ).toBeVisible();
  await shot(t1, '01-team-photo-upload', true);
  await uploadPhoto(t1, '#4f46e5');
  await expect(t1.getByText('Photo accepted. +1,000 points.')).toBeVisible();
  await shot(t1, '02-team-photo-accepted', true);
  const t2 = await teamLogin(browser, 1);
  await uploadPhoto(t2, '#16a34a');
  await expect(t2.getByText('Photo accepted. +1,000 points.')).toBeVisible();

  const adminPage = await staffLogin(browser);
  await adminPage.goto(`/staff#/games/${id}/live`);
  await adminPage.getByRole('button', { name: 'Photos' }).click();
  await expect(adminPage.getByRole('img', { name: /Team photo of/ })).toHaveCount(2);
  await shot(adminPage, '03-dashboard-photos');
  await adminPage
    .getByRole('figure')
    .filter({ hasText: logins[0]!.name })
    .getByRole('button', { name: 'Reject' })
    .click();
  const reject = adminPage.getByRole('dialog', { name: /Reject the photo of/ });
  await reject.getByLabel('Reason (staff only)').fill('Not the whole team');
  await shot(adminPage, '04-reject-photo');
  await reject.getByRole('button', { name: 'Reject photo' }).click();
  await expect(
    t1.getByText('Your photo was not accepted. You can upload a new one.'),
  ).toBeVisible();
  await shot(t1, '05-team-photo-rejected', true);
  await uploadPhoto(t1, '#dc2626');
  await expect(t1.getByText('Photo accepted. +1,000 points.')).toBeVisible();
  await expect(adminPage.getByText('Rejected: waiting for a new photo')).toHaveCount(0);

  // ---------- Projector: Round 1 (no scores or ranks) ----------
  await call('post', `games/${id}/dev/finish-tasks/${teamId(2)}`, {});
  await call('post', `games/${id}/dev/finish-tasks/${teamId(3)}`, { limit: 2 });
  const [projector] = await Promise.all([
    adminPage.waitForEvent('popup'),
    adminPage.getByRole('button', { name: 'Projector' }).click(),
  ]);
  await expect(projector.getByRole('list', { name: 'Teams' })).toBeVisible();
  await expect(projector.locator('body')).not.toContainText(/score|rank|points/i);
  await projectorShots(projector, '06-projector-round1');

  // ---------- Pause: halftime potion ----------
  await call('post', `games/${id}/end-phase`);
  await expect(projector.getByLabel('Halftime potion')).toHaveText('25%');
  await projectorShots(projector, '07-projector-pause');

  // ---------- Round 2: ranked with scores ----------
  await call('post', `games/${id}/end-phase`);
  await expect(projector.getByRole('list', { name: 'Leaderboard' })).toBeVisible();
  await projectorShots(projector, '08-projector-round2');

  // ---------- Reveal, one step at a time ----------
  await call('post', `games/${id}/end-phase`);
  await expect(projector.getByLabel('At the end')).toHaveText('25%');
  await projectorShots(projector, '09-reveal-potions');
  await projector.keyboard.press('Space');
  await expect(projector.getByRole('status')).toContainText('Nobody wins');
  await projectorShots(projector, '10-reveal-nobody-wins');
  await projector.keyboard.press('Space');
  await projector.keyboard.press('Space');
  const board = projector.getByRole('list', { name: 'Final leaderboard' });
  await expect(board.getByRole('listitem')).toHaveCount(2);
  await projectorShots(projector, '11-reveal-last-places');
  await projector.keyboard.press('Space');
  await projector.keyboard.press('Space');
  await expect(board.getByRole('listitem')).toHaveCount(4);
  await expect(board.getByRole('listitem').first()).toContainText(logins[2]!.name);
  await projectorShots(projector, '12-reveal-all');

  // ---------- Debrief and exports ----------
  await adminPage.bringToFront();
  await adminPage.getByRole('button', { name: /Debrief/ }).click();
  await expect(adminPage.getByRole('heading', { name: 'Ethical Dilemma answers' })).toBeVisible();
  await adminPage.setViewportSize({ width: 1280, height: 720 });
  await shot(adminPage, '13-debrief', true);
  const exportsPanel = adminPage
    .getByRole('heading', { name: 'Exports (CSV)' })
    .locator('xpath=ancestor::section[1]');
  const labels = [
    'Final scores',
    'Every transfer',
    'Every chat message',
    'Ethical Dilemma answers',
    'Audit log',
    'First message per team',
  ];
  for (const label of labels) {
    const [download] = await Promise.all([
      adminPage.waitForEvent('download'),
      exportsPanel.getByRole('button', { name: label }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^projector-test-.+\.csv$/);
    const text = readFileSync((await download.path())!, 'utf8');
    expect(text.split('\r\n').length, `${label} has a header row`).toBeGreaterThan(1);
  }
  const [zipDownload] = await Promise.all([
    adminPage.waitForEvent('download'),
    exportsPanel.getByRole('button', { name: /Download all/ }).click(),
  ]);
  expect(zipDownload.suggestedFilename()).toBe('projector-test-all.zip');
  const zip = await JSZip.loadAsync(readFileSync((await zipDownload.path())!));
  expect(Object.keys(zip.files)).toHaveLength(6);
  const scores = await zip.file('projector-test-scores.csv')!.async('string');
  expect(scores).toContain(logins[2]!.name);
});

// A full-size event: 20 teams must fit the projector at both screen sizes in every phase.
test('projector with 20 teams', async ({ browser }) => {
  const created = await call<CreatedGame>('post', 'games', {
    name: 'Projector twenty',
    clientName: 'Acme',
    teamCount: 20,
  });
  const id = created.game.id;
  await call('post', `games/${id}/start`);
  // Varied progress: some teams finish, others are part way.
  for (const [i, t] of created.game.teams.slice(0, 12).entries()) {
    await call('post', `games/${id}/dev/finish-tasks/${t.id}`, { limit: (i % 5) + 1 });
  }
  const context = await browser.newContext();
  await context.addInitScript((token) => {
    sessionStorage.setItem(
      'mp.staffLogin',
      JSON.stringify({ token, staff: { id: 'x', name: 'Test Admin', role: 'MAIN_ADMIN' } }),
    );
  }, staffToken);
  const projector = await context.newPage();
  await projector.goto(`/staff#/games/${id}/projector`);
  await expect(projector.getByRole('list', { name: 'Teams' }).getByRole('listitem')).toHaveCount(
    20,
  );
  await expect(projector.locator('body')).not.toContainText(/score|rank|points/i);
  await projectorShots(projector, '14-twenty-round1');

  await call('post', `games/${id}/end-phase`);
  await call('post', `games/${id}/end-phase`);
  await expect(
    projector.getByRole('list', { name: 'Leaderboard' }).getByRole('listitem'),
  ).toHaveCount(20);
  await projectorShots(projector, '15-twenty-round2');

  await call('post', `games/${id}/end-phase`);
  await expect(projector.getByLabel('At the end')).toBeVisible();
  for (let i = 0; i < 21; i++) await projector.keyboard.press('Space');
  await expect(
    projector.getByRole('list', { name: 'Final leaderboard' }).getByRole('listitem'),
  ).toHaveCount(20);
  await projectorShots(projector, '16-twenty-reveal-all');
});
