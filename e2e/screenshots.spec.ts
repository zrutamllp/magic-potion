import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { expect, request, test, type Browser, type Page } from '@playwright/test';

// Screenshots of every player screen for review: `npm run screenshots`.
// Runs against the real server and database with two throwaway games (created and deleted by
// apps/server/scripts/screenshotGames.ts). The Demo Game is not touched.
// Needs ENABLE_DEV_TOOLS=true on the server (for "finish tasks").

const OUT = 'screenshots/phase4';
const API = 'http://localhost:4000';

interface Team {
  id: string;
  code: string;
  name: string;
}
interface Games {
  staffToken: string;
  password: string;
  a: { id: string; teams: Team[] };
  b: { id: string; teams: Team[] };
}

function script(...args: string[]): string {
  return execFileSync(
    'node',
    ['--env-file-if-exists=.env', '--import', 'tsx', 'scripts/screenshotGames.ts', ...args],
    { cwd: 'apps/server', encoding: 'utf8' },
  );
}

let games: Games;

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  const lines = script('create').trim().split('\n');
  games = JSON.parse(lines[lines.length - 1] ?? '{}') as Games;
});

test.afterAll(() => {
  if (games) script('delete', games.a.id, games.b.id);
});

async function staff(path: string, body: object = {}) {
  const api = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Authorization: `Bearer ${games.staffToken}` },
  });
  const res = await api.post(`/api/staff${path}`, { data: body });
  const json = (await res.json()) as { ok?: boolean; message?: string };
  await api.dispose();
  if (!res.ok()) throw new Error(`${path}: ${json.message ?? res.status()}`);
  return json;
}

async function shot(page: Page, name: string, fullPage = false) {
  // Let the potion liquid settle.
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

async function login(browser: Browser, team: Team): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Team code').fill(team.code);
  await page.getByLabel('Password').fill(games.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText(team.name).first()).toBeVisible();
  return page;
}

async function tab(page: Page, name: string) {
  await page.evaluate((h) => (window.location.hash = h), `#/${name}`);
}

async function sendChat(page: Page, text: string) {
  await tab(page, 'chat');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(text).first()).toBeVisible();
}

async function moveFunds(
  page: Page,
  kind: 'Send funds' | 'Request funds',
  team: string,
  amount: number,
) {
  await tab(page, 'funds');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: kind }) });
  await form.getByRole('combobox').selectOption({ label: team });
  await form.getByRole('spinbutton').fill(String(amount));
  await form.getByRole('button', { name: kind }).click();
  await expect(page.getByRole('status')).toBeVisible();
}

test('every player screen', async ({ browser }) => {
  const [a1, a2, a3, a4] = games.a.teams as [Team, Team, Team, Team];
  const gameA = `/games/${games.a.id}`;

  // Login and Lobby.
  const loginPage = await (await browser.newContext()).newPage();
  await loginPage.goto('/');
  await shot(loginPage, '01-login');

  const p1 = await login(browser, a1);
  await expect(p1.getByText('Waiting for the facilitator to start')).toBeVisible();
  await shot(p1, '02-lobby');
  await shot(p1, '02-lobby-full', true);

  // Round 1.
  await staff(`${gameA}/start`);
  await expect(p1.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
  const p2 = await login(browser, a2);
  const p3 = await login(browser, a3);

  await sendChat(p2, 'Hello from Team 2. Anyone holding 4-2-9?');
  await sendChat(p1, 'Hi! We are working on The Vault.');
  await sendChat(p3, 'Team 3 is here too.');
  await moveFunds(p2, 'Send funds', 'Team 1', 500);
  await moveFunds(p1, 'Send funds', 'Team 3', 300);
  await moveFunds(p3, 'Request funds', 'Team 1', 200);

  // Team 1: one task done, one failed, one running. Team 4 finishes everything (potion 25%).
  await staff(`${gameA}/dev/finish-tasks/${a1.id}`, { limit: 1 });
  await staff(`${gameA}/dev/finish-tasks/${a4.id}`);
  await tab(p1, 'home');
  await p1
    .getByRole('button', { name: /: Not started$/ })
    .first()
    .click();
  await p1.getByRole('button', { name: 'Start Task' }).click();
  await p1.getByRole('button', { name: 'Give up' }).click();
  await p1.getByRole('button', { name: 'Yes, give up' }).click();
  await expect(p1.getByText('This task failed.')).toBeVisible();
  await tab(p1, 'home');
  await p1
    .getByRole('button', { name: /: Not started$/ })
    .first()
    .click();
  await p1.getByRole('button', { name: 'Start Task' }).click();
  await expect(p1.getByLabel('Task time left')).toBeVisible();
  await shot(p1, '04-task-running');

  await tab(p1, 'home');
  await shot(p1, '03-home');
  await tab(p1, 'chat');
  await shot(p1, '05-chat');
  await tab(p1, 'funds');
  await shot(p1, '06-funds');
  await tab(p1, 'inbox');
  await shot(p1, '07-inbox');
  await tab(p1, 'leaderboard');
  await shot(p1, '08-leaderboard-round1');
  await tab(p1, 'rules');
  await shot(p1, '09-rules');

  // Phone width.
  await p1.setViewportSize({ width: 390, height: 844 });
  await tab(p1, 'home');
  await shot(p1, '15-phone-home');
  await tab(p1, 'chat');
  await shot(p1, '16-phone-chat');
  await p1.setViewportSize({ width: 1280, height: 720 });

  // Pause.
  await staff(`${gameA}/end-phase`);
  await expect(p1.getByText('Round 2 starts in')).toBeVisible();
  await shot(p1, '10-pause');

  // Round 2: every team on the leaderboard, rank in the top bar.
  await staff(`${gameA}/end-phase`);
  await expect(p1.getByText('Round 2', { exact: true })).toBeVisible();
  await tab(p1, 'leaderboard');
  await shot(p1, '11-leaderboard-round2');
  await tab(p1, 'home');
  await shot(p1, '11-home-round2');

  // Let the Round 1 transfers arrive (they were frozen in the Pause), so the Reveal
  // shows real "Funds given" and "Funds received" numbers.
  await tab(p1, 'funds');
  await expect(p1.getByText(/Arriving in/)).toHaveCount(0, { timeout: 90_000 });

  // Reveal with a full potion.
  for (const t of [a1, a2, a3]) await staff(`${gameA}/dev/finish-tasks/${t.id}`);
  await staff(`${gameA}/end-phase`);
  await expect(p1.getByText('The potion is full!')).toBeVisible();
  await p1.waitForTimeout(4000);
  await shot(p1, '12-reveal-full');
  await shot(p1, '12-reveal-full-page', true);

  // Reveal with the potion not full.
  const gameB = `/games/${games.b.id}`;
  await staff(`${gameB}/start`);
  await staff(`${gameB}/dev/finish-tasks/${games.b.teams[0]!.id}`);
  await staff(`${gameB}/end-phase`);
  await staff(`${gameB}/end-phase`);
  await staff(`${gameB}/end-phase`);
  const b1 = await login(browser, games.b.teams[0]!);
  await expect(b1.getByText('The potion is not full. Nobody wins.')).toBeVisible();
  await b1.waitForTimeout(4000);
  await shot(b1, '13-reveal-nobody-wins');

  // Logged in somewhere else.
  await login(browser, a1);
  await expect(p1.getByText('Your team logged in on another device.')).toBeVisible();
  await shot(p1, '14-logged-in-elsewhere');
});
