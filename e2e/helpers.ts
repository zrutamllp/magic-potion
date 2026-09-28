import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { expect, request, type Browser, type Page } from '@playwright/test';

// Shared by the screenshot scripts. They run against the real server and database with
// throwaway games made by apps/server/scripts/screenshotGames.ts; the Demo Game is not touched.
// "Finish tasks" needs ENABLE_DEV_TOOLS=true on the server.

const API = 'http://localhost:4000';

export interface Team {
  id: string;
  code: string;
  name: string;
}

export interface Games {
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

// uniqueTasks: every team draws only these unique tasks (for one batch of task screens).
export function createGames(uniqueTasks: string[] = []): Games {
  const extra = uniqueTasks.length > 0 ? ['--tasks', uniqueTasks.join(',')] : [];
  const lines = script('create', ...extra)
    .trim()
    .split('\n');
  return JSON.parse(lines[lines.length - 1] ?? '{}') as Games;
}

export function deleteGames(games: Games | undefined): void {
  if (games) script('delete', games.a.id, games.b.id);
}

export async function staff(games: Games, path: string, body: object = {}) {
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

// Saves PNGs into one folder.
export function shooter(dir: string) {
  mkdirSync(dir, { recursive: true });
  return async (page: Page, name: string, fullPage = false) => {
    // Let the potion liquid and countdowns settle.
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage });
  };
}

export async function login(browser: Browser, games: Games, team: Team): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Team code').fill(team.code);
  await page.getByLabel('Password').fill(games.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText(team.name).first()).toBeVisible();
  return page;
}

export async function tab(page: Page, name: string) {
  await page.evaluate((h) => (window.location.hash = h), `#/${name}`);
}
