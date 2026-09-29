import { execFileSync } from 'node:child_process';
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import sharp from 'sharp';
import { shooter } from './helpers';

// Phase 6B content library screenshots: `npm run screenshots:6b`. A throwaway main admin copies
// the Sample pack, imports riddles from a CSV (first with a bad row), marks the 7 differences of
// a picture pair and plays it in Preview as player, adds a celebrity photo and a Pictionary
// drawing, gives a game the pack and a dilemma scenario, edits an inbox question, checks that a
// team gets a fresh set of riddles on each try, and archives and deletes games. Everything made
// here (games, packs, pictures) is deleted afterwards. Main parts must fit 1280x720.

const API = 'http://localhost:4000';
const shot = shooter('screenshots/phase6/6b');

let admin: { email: string; password: string };
let api: APIRequestContext;
const uploaded: string[] = [];

function script(...args: string[]): string {
  return execFileSync(
    'node',
    ['--env-file-if-exists=.env', '--import', 'tsx', 'scripts/adminTestUser.ts', ...args],
    { cwd: 'apps/server', encoding: 'utf8' },
  );
}

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
});

test.afterAll(async () => {
  await api?.dispose();
  if (admin) script('delete', admin.email, ...uploaded);
});

async function call<T>(method: 'get' | 'post' | 'put', path: string, data?: object): Promise<T> {
  const res = await api[method](path, data ? { data } : undefined);
  const body = (await res.json()) as T & { message?: string };
  if (!res.ok()) throw new Error(`${path}: ${body.message ?? res.status()}`);
  return body;
}

async function fits(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await page.screenshot({ path: 'test-results/6b-last-fit-check.png' });
  const box = await target.boundingBox();
  expect(box, 'element has a box').not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, 'bottom edge inside 720').toBeLessThanOrEqual(720);
  expect(box!.x + box!.width, 'right edge inside 1280').toBeLessThanOrEqual(1280);
}

// Keeps every uploaded picture's address, so the clean-up deletes it.
function trackUploads(page: Page) {
  page.on('response', async (res) => {
    if (!res.url().includes('/api/staff/uploads/') || !res.ok()) return;
    const { url } = (await res.json()) as { url: string };
    uploaded.push(url);
  });
}

// ---------- Test pictures (made here: no real people or brands) ----------

const DIFFS = [
  [150, 120],
  [420, 90],
  [700, 160],
  [220, 380],
  [520, 330],
  [760, 420],
  [380, 520],
] as const;
const W = 900;
const H = 600;

function scene(changed: boolean) {
  const shapes = DIFFS.map(([x, y], i) =>
    changed
      ? `<circle cx="${x}" cy="${y}" r="28" fill="${['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#f97316', '#14b8a6'][i]}"/>`
      : '',
  ).join('');
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="#e0f2fe"/>
      <rect x="60" y="420" width="780" height="140" fill="#65a30d"/>
      <rect x="560" y="200" width="220" height="200" fill="#f5d0a9" stroke="#78350f" stroke-width="8"/>
      <polygon points="540,210 670,110 800,210" fill="#b91c1c"/>
      <circle cx="120" cy="90" r="50" fill="#facc15"/>${shapes}
    </svg>`),
  )
    .png()
    .toBuffer();
}

function face(label: string) {
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <rect width="400" height="400" fill="#c7d2fe"/>
      <circle cx="200" cy="170" r="90" fill="#fcd34d"/>
      <rect x="90" y="280" width="220" height="140" rx="60" fill="#4f46e5"/>
      <text x="200" y="385" font-size="34" font-family="Arial" text-anchor="middle" fill="#fff">${label}</text>
    </svg>`),
  )
    .png()
    .toBuffer();
}

const RIDDLES = Array.from({ length: 12 }, (_, i) => [
  `Test riddle number ${i + 1}: what am I?`,
  `answer${i + 1}; answer ${i + 1}`,
  `Clue ${i + 1}`,
]);
const csv = (rows: string[][]) =>
  [
    'Riddle,Accepted answers,Clue (the hint)',
    ...rows.map((r) => r.map((c) => `"${c}"`).join(',')),
  ].join('\n');

test('the content library, from pack to play', async ({ page, browser }) => {
  trackUploads(page);
  await page.goto('/staff');
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByRole('button', { name: 'Log in' }).click();

  // ---------- Packs ----------
  await page.getByRole('button', { name: 'Content packs' }).click();
  await expect(page.getByText('Sample pack')).toBeVisible();
  await fits(page, page.getByRole('button', { name: 'Create pack' }));
  await shot(page, '01-packs');

  await page.getByRole('button', { name: 'View' }).first().click();
  await expect(page.getByText('Built in, read-only')).toBeVisible();
  await page.getByRole('button', { name: /^Riddle/ }).click();
  await expect(page.getByLabel('Riddle')).toBeDisabled();
  await shot(page, '02-sample-pack-read-only');

  page.once('dialog', (d) => void d.accept('Acme pack'));
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('heading', { name: 'Acme pack', level: 1 })).toBeVisible();

  // ---------- Import riddles from a CSV ----------
  await page.getByRole('button', { name: /^Riddle/ }).click();
  await page.getByRole('button', { name: 'Import from Excel/CSV' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from a spreadsheet' });
  const badRows = [...RIDDLES.slice(0, 11), ['Test riddle 12 with no answer', '', 'Clue 12']];
  await dialog.getByLabel('Spreadsheet file').setInputFiles({
    name: 'riddles.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv(badRows)),
  });
  await expect(dialog.getByText('1 row needs fixing.', { exact: false })).toBeVisible();
  await expect(
    dialog.getByText('Accepted answers: Add at least one accepted answer.'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add 11 riddles' })).toBeDisabled();
  await shot(page, '03-import-row-with-a-problem');
  await dialog.getByLabel('Spreadsheet file').setInputFiles({
    name: 'riddles.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv(RIDDLES)),
  });
  await expect(dialog.getByText('All 12 rows are fine.')).toBeVisible();
  await dialog.getByLabel(/Replace every entry/).check();
  await fits(page, dialog.getByRole('button', { name: 'Replace with 12 riddles' }));
  await shot(page, '04-import-ready');
  await dialog.getByRole('button', { name: 'Replace with 12 riddles' }).click();
  await expect(page.getByText('12 riddles ·')).toBeVisible();

  // A new riddle with empty fields: red messages, nothing saved.
  await page.getByRole('button', { name: /Add riddle/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Write the riddle.')).toBeVisible();
  await fits(page, page.getByText('Write the riddle.'));
  await shot(page, '05-red-messages');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: /^Spot the Difference/ }).click();

  // ---------- Spot the Difference: upload, mark 7, preview ----------
  await page.getByRole('button', { name: /Add picture pair/ }).click();
  await page
    .getByLabel('Upload original file')
    .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: await scene(false) });
  await page
    .getByLabel('Upload changed file')
    .setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: await scene(true) });
  await expect(page.getByText('Mark 7 differences: 0 marked, 7 to go.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark the differences' }).click();
  const marker = page.getByRole('dialog', { name: 'Mark the differences' });
  const original = marker.getByTestId('mark-original');
  await fits(page, original);
  const box = (await original.boundingBox())!;
  for (const [n, [x, y]] of DIFFS.entries()) {
    await page.mouse.click(box.x + (x / W) * box.width, box.y + (y / H) * box.height);
    if (n < DIFFS.length - 1) {
      await expect(page.getByText(`${n + 1} marked, ${DIFFS.length - n - 1} to go.`)).toBeVisible();
    }
  }
  await expect(marker.getByText('All 7 differences are marked.')).toBeVisible();
  await fits(page, marker.getByTestId('mark-changed'));
  await shot(page, '06-spot-marking');
  await marker.getByRole('button', { name: 'Blink' }).click();
  await shot(page, '06b-spot-marking-blink');
  await marker.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Preview as player' }).click();
  const preview = page.getByRole('dialog', { name: 'Preview as player' });
  await preview.getByRole('button', { name: 'Start Task' }).click();
  const right = preview.getByRole('button', { name: 'right picture' });
  const rbox = (await right.boundingBox())!;
  for (const [x, y] of DIFFS.slice(0, 3)) {
    await page.mouse.click(rbox.x + (x / W) * rbox.width, rbox.y + (y / H) * rbox.height);
  }
  await expect(preview.getByLabel('3 of 7 found')).toBeVisible();
  await shot(page, '07-spot-preview-as-player');
  await preview.getByRole('button', { name: 'Close preview' }).click();

  // ---------- Guess the Celebrity: photo and names ----------
  await page.getByRole('button', { name: /^Guess the Celebrity/ }).click();
  await page.getByRole('button', { name: /Add photo/ }).click();
  await page
    .getByLabel('Upload photo file')
    .setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: await face('Test A') });
  await expect(page.getByRole('img', { name: 'Photo' })).toBeVisible();
  await page.getByLabel('Accepted names').fill('Test Person A\nPerson A');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await shot(page, '08-celebrity-photo');

  // ---------- Pictionary: draw with the mouse ----------
  await page.getByRole('button', { name: /^Pictionary/ }).click();
  await page.getByRole('button', { name: /Add drawing/ }).click();
  const pad = (await page.getByTestId('drawing-pad').boundingBox())!;
  const at = (x: number, y: number) =>
    [pad.x + (x / 100) * pad.width, pad.y + (y / 100) * pad.height] as const;
  const stroke = async (points: [number, number][]) => {
    await page.mouse.move(...at(...points[0]!));
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(...at(...p), { steps: 6 });
    await page.mouse.up();
  };
  await stroke([
    [20, 80],
    [50, 20],
    [80, 80],
    [20, 80],
  ]);
  await stroke([
    [40, 60],
    [60, 60],
  ]);
  await page.getByLabel('Word and accepted spellings').fill('tent\ntents');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await shot(page, '09-pictionary-drawing');

  // ---------- A game with this pack ----------
  const game = await call<{ game: { id: string } }>('post', 'games', {
    name: 'Acme content check',
    teamCount: 3,
  });
  const gameId = game.game.id;
  await page.goto(`/staff#/games/${gameId}/content`);
  await page.getByLabel('Content pack').selectOption({ label: 'Acme pack' });
  await page.getByLabel('Scenario 3').check();
  await page.getByRole('button', { name: 'Save content' }).click();
  await expect(
    page.getByText('Saved. Teams in the Lobby get the new content at once.'),
  ).toBeVisible();
  await fits(page, page.getByRole('button', { name: 'Save content' }));
  await shot(page, '10-game-content');

  await page.getByRole('button', { name: 'Inbox', exact: true }).click();
  const q1 = page.getByRole('heading', { name: 'Question 1' }).locator('xpath=../..');
  await q1.getByLabel('Question').fill('What is the capital of India?');
  await q1.getByLabel('Accepted answers').fill('New Delhi\nDelhi');
  await page.getByRole('button', { name: 'Save inbox' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await fits(page, q1);
  await shot(page, '11-game-inbox');

  // ---------- A team gets a fresh set of riddles on each try ----------
  // A small pack where Riddle is one of only 3 other tasks, so every team plays it.
  const sample = (await call<{ id: string; builtIn: boolean }[]>('get', 'packs')).find(
    (p) => p.builtIn,
  )!;
  const sampleItems = (
    await call<{ items: { taskKey: string; publicData: unknown; secretData: unknown }[] }>(
      'get',
      `packs/${sample.id}`,
    )
  ).items;
  const check = await call<{ id: string }>('post', 'packs', { name: 'Riddle check' });
  for (const key of ['vault', 'find_code', 'hangman', 'ethical_dilemma']) {
    const items = sampleItems
      .filter((i) => i.taskKey === key)
      .map(({ publicData, secretData }) => ({ publicData, secretData }));
    await call('post', `packs/${check.id}/items/bulk`, { taskKey: key, mode: 'add', items });
  }
  const riddleItems = RIDDLES.map(([riddle, answers, clue]) => ({
    publicData: { riddle },
    secretData: { answers: answers!.split(';').map((a) => a.trim()), clue },
  }));
  await call('post', `packs/${check.id}/items/bulk`, {
    taskKey: 'riddle',
    mode: 'add',
    items: riddleItems,
  });
  const played = await call<{ game: { id: string }; logins: { code: string; password: string }[] }>(
    'post',
    'games',
    {
      name: 'Riddle pool check',
      teamCount: 3,
    },
  );
  await call('put', `games/${played.game.id}/content`, { packId: check.id, dilemmaItemId: null });
  await call('post', `games/${played.game.id}/start`);

  const team = await (await browser.newContext()).newPage();
  await team.goto('/');
  await team.getByLabel('Team code').fill(played.logins[0]!.code);
  await team.getByLabel('Password').fill(played.logins[0]!.password);
  await team.getByRole('button', { name: 'Log in' }).click();
  await team.getByRole('button', { name: /^Riddle:/ }).click();
  await team.getByRole('button', { name: 'Start Task' }).click();
  await expect(team.getByText('Answer all 3 riddles.')).toBeVisible();
  const readRiddles = async () =>
    (await team.getByText(/^Test riddle number \d+/).allTextContents()).map((t) => t.trim());
  const first = await readRiddles();
  expect(first).toHaveLength(3);
  await shot(team, '12-team-riddle-first-try');
  await team.getByRole('button', { name: 'Give up' }).click();
  await team.getByRole('button', { name: 'Yes, give up' }).click();
  await team.getByRole('button', { name: 'Try again' }).click();
  await expect(team.getByText('Answer all 3 riddles.')).toBeVisible();
  const second = await readRiddles();
  expect(second).toHaveLength(3);
  expect(second.some((r) => first.includes(r))).toBe(false);
  await shot(team, '13-team-riddle-second-try');

  // ---------- Content locks at Round 1 ----------
  await page.goto(`/staff#/games/${played.game.id}/content`);
  await page.reload();
  await expect(
    page.getByText('The game has started, so it keeps the content it started with.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Content pack')).toBeDisabled();
  await shot(page, '14-content-locked');

  // ---------- Archive a finished game, delete an unplayed one ----------
  for (let i = 0; i < 3; i++) await call('post', `games/${played.game.id}/end-phase`);
  const dry = await call<{ game: { id: string } }>('post', 'games', {
    name: 'Dry run to delete',
    teamCount: 3,
  });
  await page.goto('/staff#/games');
  await page.reload();
  const finished = page.getByText('Riddle pool check').locator('xpath=ancestor::li');
  await finished.getByRole('button', { name: /Archive/ }).click();
  await expect(page.getByText('Riddle pool check')).toBeHidden();
  await page.getByLabel(/Show archived/).check();
  await expect(page.getByText('(archived)')).toBeVisible();
  await shot(page, '15-games-archived');

  await page
    .getByText('Dry run to delete')
    .locator('xpath=ancestor::li')
    .getByRole('button', { name: /Delete/ })
    .click();
  const confirmBox = page.getByRole('dialog', { name: 'Delete game' });
  await confirmBox.getByLabel('Type the game name to confirm').fill('Dry run to delete');
  await fits(page, confirmBox.getByRole('button', { name: 'Delete game' }));
  await shot(page, '16-delete-by-typing-the-name');
  await confirmBox.getByRole('button', { name: 'Delete game' }).click();
  await expect(confirmBox).toBeHidden();
  await expect(page.getByText('Dry run to delete')).toBeHidden();
  const gone = await api.get(`games/${dry.game.id}`);
  expect(gone.status()).toBe(404);
});
