import { execFileSync } from 'node:child_process';
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';
import type { CreatedGame, StaffMember, TeamLoginCard } from '@magic-potion/shared';
import { shooter } from './helpers';

// Phase 6C live control and facilitator dashboard screenshots: `npm run screenshots:6c`.
// A throwaway main admin makes a 4-team game and a co-facilitator for Team 1, starts the game,
// runs it from the Live page (pause, extend, message, fund changes, approval, undo, rename,
// View as team, stuck flag, login reset) while team windows show what players see.
// Everything made here is deleted afterwards. The dashboard must fit a 1366x768 laptop.

const API = 'http://localhost:4000';
const W = 1366;
const H = 768;
const shot = shooter('screenshots/phase6/6c');

let admin: { email: string; password: string };
let api: APIRequestContext;
let gameId: string;
let logins: TeamLoginCard[];
const cofac = { email: '', password: 'cofac-pass-6c-test' };

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

test.use({ viewport: { width: W, height: H } });

test.beforeAll(async () => {
  const lines = script('create').trim().split('\n');
  admin = JSON.parse(lines[lines.length - 1] ?? '{}') as typeof admin;
  const anon = await request.newContext({ baseURL: API });
  const login = await anon.post('/api/staff/login', { data: admin });
  const { token } = (await login.json()) as { token: string };
  await anon.dispose();
  api = await request.newContext({
    baseURL: `${API}/api/staff/`,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

  const created = await call<CreatedGame>('post', 'games', {
    name: 'Live control test',
    clientName: 'Acme',
    teamCount: 4,
  });
  gameId = created.game.id;
  logins = created.logins;
  // A short idle time, so the "stuck team" flag shows during the test.
  const settings = structuredClone(created.game.settings);
  settings.staff.stuckIdleSeconds = 30;
  await call('put', `games/${gameId}/settings`, { settings });

  cofac.email = `e2e-cofac-${Date.now()}@example.com`;
  const member = await call<StaffMember>('post', 'users', {
    name: 'Asha (co-facilitator)',
    email: cofac.email,
    password: cofac.password,
  });
  await call('put', `games/${gameId}/assignments`, {
    staffUserId: member.id,
    teamIds: [created.game.teams[0]!.id],
  });
});

test.afterAll(async () => {
  await api?.dispose();
  if (admin) script('delete', admin.email);
});

async function fits(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box, 'element has a box').not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `bottom edge inside ${H}`).toBeLessThanOrEqual(H);
  expect(box!.x + box!.width, `right edge inside ${W}`).toBeLessThanOrEqual(W);
}

async function staffLogin(browser: Browser, who: { email: string; password: string }) {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
  await page.goto('/staff');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
  return page;
}

async function teamLogin(browser: Browser, i: number) {
  const card = logins[i]!;
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Team code').fill(card.code);
  await page.getByLabel('Password').fill(card.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText(card.name).first()).toBeVisible();
  return page;
}

function row(page: Page, name: string) {
  return page.getByRole('row', { name: new RegExp(name) });
}

test('live control and facilitator dashboard', async ({ browser }) => {
  // ---------- The admin opens the Live page and starts the game ----------
  const adminPage = await staffLogin(browser, admin);
  const gameRow = adminPage.getByRole('listitem').filter({ hasText: 'Live control test' });
  await expect(gameRow.getByRole('button', { name: 'Live' })).toBeVisible();
  await shot(adminPage, '01-games-list');
  await gameRow.getByRole('button', { name: 'Live' }).click();
  await expect(adminPage.getByRole('button', { name: /Start game/ })).toBeVisible();
  await shot(adminPage, '02-live-lobby');

  const teams = [
    await teamLogin(browser, 0),
    await teamLogin(browser, 1),
    await teamLogin(browser, 2),
  ];
  await adminPage.getByRole('button', { name: /Start game/ }).click();
  await expect(adminPage.getByRole('dialog', { name: 'Start the game?' })).toBeVisible();
  await shot(adminPage, '03-start-confirm');
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Start game' }).click();
  await expect(adminPage.getByText('Round 1', { exact: true })).toBeVisible();

  // Some play: Team 1 chats, the 4th team finishes two tasks (dev tool), Team 2 opens a task.
  const [t1, t2, t3] = teams as [Page, Page, Page];
  await t1.evaluate(() => (window.location.hash = '#/chat'));
  await t1.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello from Team 1');
  await t1.getByRole('button', { name: 'Send' }).click();
  const fourth = await call<{ teams: { id: string }[] }>('get', `games/${gameId}`);
  await call('post', `games/${gameId}/dev/finish-tasks/${fourth.teams[3]!.id}`, { limit: 2 });
  await t2
    .getByRole('button', { name: /: Not started$/ })
    .first()
    .click();
  await t2.getByRole('button', { name: 'Start Task' }).click();

  await expect(row(adminPage, logins[3]!.name)).toContainText('2/5');
  await expect(adminPage.getByText('Hello from Team 1')).toBeVisible();
  await fits(adminPage, adminPage.getByRole('table'));
  await fits(adminPage, adminPage.getByRole('navigation', { name: 'Live feeds' }));
  await shot(adminPage, '04-dashboard');

  // ---------- Pause, extend, resume ----------
  await adminPage.getByRole('button', { name: /Pause/ }).click();
  await expect(adminPage.getByText('Round 1 · Paused')).toBeVisible();
  await adminPage.getByRole('button', { name: /5 min/ }).click();
  await shot(adminPage, '05-paused-and-extended');
  await adminPage.getByRole('button', { name: /Resume/ }).click();
  await expect(adminPage.getByRole('button', { name: /Pause/ })).toBeVisible();

  // ---------- Message to every team (with the wording warning) ----------
  await adminPage.getByRole('button', { name: /Message all/ }).click();
  const msg = adminPage.getByRole('dialog', { name: 'Message to every team' });
  await msg.getByLabel('Title').fill('Ten minutes to the Pause');
  await msg.getByLabel('Message').fill('Help each other and check your Home screen.');
  await expect(msg.getByRole('status')).toContainText('help each other');
  await shot(adminPage, '06-message-warning');
  await msg.getByLabel('Message').fill('Check your Home screen for new items.');
  await expect(msg.getByRole('status')).toHaveCount(0);
  await msg.getByRole('button', { name: 'Send to all teams' }).click();
  await t1.evaluate(() => (window.location.hash = '#/inbox'));
  await expect(t1.getByText('Ten minutes to the Pause')).toBeVisible();
  await shot(t1, '07-team-inbox-message');

  // ---------- Fund change by the admin; the team sees only the amount ----------
  await row(adminPage, logins[1]!.name).click();
  const panel = adminPage.getByRole('complementary', { name: `Team ${logins[1]!.name}` });
  await panel.getByRole('button', { name: /Change funds/ }).click();
  const adjust = adminPage.getByRole('dialog', { name: /Change Task Funds/ });
  await adjust.getByRole('radio', { name: 'Take away' }).check();
  await adjust.getByLabel('Amount').fill('11,000');
  await adjust.getByLabel('Reason (staff only)').fill('Test: take below zero');
  await shot(adminPage, '08-adjust-dialog');
  await adjust.getByRole('button', { name: 'Change funds' }).click();
  await expect(panel.getByText(/Task Funds −11,000/)).toBeVisible();
  await expect(panel.getByText(/Stuck/)).toBeVisible();
  await shot(adminPage, '09-team-panel-stuck');
  await panel.getByRole('button', { name: 'Close team panel' }).click();

  await t2.evaluate(() => (window.location.hash = '#/funds'));
  await expect(t2.getByText('Funds adjusted by the facilitator').first()).toBeVisible();
  const t2Text = (await t2.locator('body').textContent()) ?? '';
  expect(t2Text).not.toContain('Test Admin');
  expect(t2Text).not.toContain('Test: take below zero');
  await shot(t2, '10-team-funds-line', true);

  // ---------- The co-facilitator: own team only, limit and approval ----------
  const cofacPage = await staffLogin(browser, cofac);
  await cofacPage.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(row(cofacPage, logins[0]!.name)).toBeVisible();
  await expect(cofacPage.getByRole('row')).toHaveCount(2); // header + Team 1
  await expect(cofacPage.getByRole('button', { name: /Pause|Start game|Message all/ })).toHaveCount(
    0,
  );
  await shot(cofacPage, '11-cofac-dashboard');

  await row(cofacPage, logins[0]!.name).click();
  const cPanel = cofacPage.getByRole('complementary', { name: `Team ${logins[0]!.name}` });
  const cofacAdjust = async (amount: string, reason: string, button: string) => {
    await cPanel.getByRole('button', { name: /Change funds/ }).click();
    const d = cofacPage.getByRole('dialog', { name: /Change Task Funds/ });
    await d.getByLabel('Amount').fill(amount);
    await d.getByLabel('Reason (staff only)').fill(reason);
    await d.getByRole('button', { name: button }).click();
  };
  await cofacAdjust('1,500', 'Good debrief answer', 'Change funds');
  await expect(cPanel.getByText(/Task Funds \+1,500/)).toBeVisible();
  await cPanel.getByRole('button', { name: /Change funds/ }).click();
  const big = cofacPage.getByRole('dialog', { name: /Change Task Funds/ });
  await big.getByLabel('Amount').fill('3000');
  await big.getByLabel('Reason (staff only)').fill('A bug cost them a try');
  await expect(big.getByText(/goes to the main admin for approval/)).toBeVisible();
  await shot(cofacPage, '12-cofac-over-limit');
  await big.getByRole('button', { name: 'Send for approval' }).click();
  await expect(cPanel.getByText(/sent to the main admin for approval/)).toBeVisible();

  await adminPage.getByRole('button', { name: 'Approvals (1)' }).click();
  await expect(adminPage.getByText('A bug cost them a try')).toBeVisible();
  await shot(adminPage, '13-approvals');
  await adminPage.getByRole('button', { name: 'Approve' }).click();
  await expect(row(adminPage, logins[0]!.name)).toContainText('14,500');

  // ---------- Audit log and undo ----------
  await adminPage.getByRole('button', { name: 'Audit log' }).click();
  await expect(adminPage.getByText(/Approved a funds change \+3,000/)).toBeVisible();
  await shot(adminPage, '14-audit-log');
  const undoRow = adminPage
    .getByRole('listitem')
    .filter({ hasText: 'Good debrief answer' })
    .first();
  await undoRow.getByRole('button', { name: /Undo/ }).click();
  await expect(adminPage.getByRole('dialog', { name: 'Undo this change?' })).toBeVisible();
  await shot(adminPage, '15-undo-confirm');
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Undo' }).click();
  await expect(row(adminPage, logins[0]!.name)).toContainText('13,000');

  // ---------- Live rename, seen by the team ----------
  await row(adminPage, logins[2]!.name).click();
  const p3 = adminPage.getByRole('complementary', { name: `Team ${logins[2]!.name}` });
  await p3.getByRole('button', { name: /Rename/ }).click();
  await adminPage.getByRole('dialog').getByLabel('New name').fill('Night Owls');
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Rename' }).click();
  await expect(t3.getByText('Night Owls').first()).toBeVisible();
  await shot(t3, '16-team-renamed');

  // ---------- View as team (read only) ----------
  const p3b = adminPage.getByRole('complementary', { name: 'Team Night Owls' });
  await p3b.getByRole('button', { name: /View as team/ }).click();
  const viewer = adminPage.getByRole('dialog', { name: 'View as Night Owls' });
  await expect(viewer.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
  await shot(adminPage, '17-view-as-team');
  await viewer
    .getByRole('button', { name: /: Not started$/ })
    .first()
    .click();
  await viewer.getByRole('button', { name: 'Start Task' }).click();
  await expect(viewer.getByText('View only. Nothing was sent.')).toBeVisible();
  await shot(adminPage, '18-view-as-team-read-only');
  await viewer.getByRole('button', { name: 'Close team view' }).click();

  // ---------- Stuck flag for an idle team (idle time set to 30 seconds) ----------
  await expect(row(adminPage, logins[3]!.name).getByText('Stuck')).toBeVisible({
    timeout: 90_000,
  });
  await shot(adminPage, '19-stuck-idle');

  // ---------- Stop a running try (admin) ----------
  await p3b.getByRole('button', { name: 'Close team panel' }).click();
  await row(adminPage, logins[1]!.name).click();
  const p2 = adminPage.getByRole('complementary', { name: `Team ${logins[1]!.name}` });
  await p2.getByRole('button', { name: 'Stop try' }).click();
  await shot(adminPage, '20-stop-try-confirm');
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Stop try' }).click();
  await expect(p2.getByRole('button', { name: 'Stop try' })).toHaveCount(0);
  await expect(row(adminPage, logins[1]!.name)).toContainText('-1,000');

  // ---------- Reset a login ----------
  await p2.getByRole('button', { name: /Reset login/ }).click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Reset login' }).click();
  await expect(adminPage.getByRole('dialog', { name: /New login for/ })).toBeVisible();
  await shot(adminPage, '21-reset-login');
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(t2.getByText('Your login has ended. Please log in again.')).toBeVisible();
  await shot(t2, '22-team-login-ended');

  // ---------- End the phase: always asks first ----------
  await p2.getByRole('button', { name: 'Close team panel' }).click();
  await adminPage.getByRole('button', { name: /End Round 1/ }).click();
  await expect(adminPage.getByRole('dialog', { name: 'End Round 1 now?' })).toBeVisible();
  await shot(adminPage, '23-end-phase-confirm');
  await adminPage.getByRole('dialog').getByRole('button', { name: 'End Round 1' }).click();
  await expect(adminPage.getByRole('button', { name: /End the Pause/ })).toBeVisible();
  await fits(adminPage, adminPage.getByRole('table'));
  await shot(adminPage, '24-pause-phase');
});
