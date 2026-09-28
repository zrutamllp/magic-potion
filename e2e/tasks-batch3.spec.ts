import { expect, test, type Locator, type Page } from '@playwright/test';
import { createGames, deleteGames, login, shooter, staff, tab, type Games } from './helpers';

// Batch 3 task screenshots (Picture Puzzle, Spot the Difference, Data Story):
// `npm run screenshots:batch3`. The games load only these 3 unique tasks, so every team draws
// them. Each task is played for real with mouse clicks (as on a trackpad) and typing: brief,
// playing, hint, failed, then solved on the next try (Data Story is solved on the same try). Every screen checks that the pictures and
// buttons fit a 1280x720 window without scrolling.

const shot = shooter('screenshots/phase5/batch3');
let games: Games;

// The sample content (apps/server/prisma/sampleContent.ts).
const SPOT_AREAS = [
  [430, 105],
  [235, 95],
  [650, 140],
  [120, 290],
  [565, 445],
  [705, 385],
  [230, 520],
] as const;
const DATA_ANSWERS: Record<string, string> = {
  'Which region had the highest sales?': 'south',
  'In which month did orders delivered go down from the month before?': 'June',
  'How many more complaints were about late delivery than about damaged items?': '22',
  'On which day were the fewest orders packed?': 'Saturday',
  'How many returns were there in total this week?': '106',
  'By how many hours did average dispatch time fall from Week 35 to Week 38?': '12',
};

test.beforeAll(() => {
  games = createGames(['picture_puzzle', 'spot_difference', 'data_story']);
});

test.afterAll(() => deleteGames(games));

// The whole element is on screen at 1280x720, with no scrolling.
async function fits(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  // Keep a picture of the screen if it does not fit.
  await page.screenshot({ path: 'test-results/batch3-last-fit-check.png' });
  const box = await target.boundingBox();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(box, 'element has a box').not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, 'bottom edge inside 720').toBeLessThanOrEqual(720);
  expect(box!.x + box!.width, 'right edge inside 1280').toBeLessThanOrEqual(1280);
}

async function openTask(page: Page, name: string) {
  await tab(page, 'home');
  await page.getByRole('button', { name: new RegExp(`^${name}:`) }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

async function start(page: Page, button: 'Start Task' | 'Try again') {
  await fits(page, page.getByRole('button', { name: button }));
  await page.getByRole('button', { name: button }).click();
  await expect(page.getByLabel('Task time left')).toBeVisible();
}

async function useHint(page: Page) {
  await page.getByRole('button', { name: /Use hint/ }).click();
  await page.getByRole('button', { name: 'Yes, use hint' }).click();
  await expect(page.getByText(/Hint (used\.|for question)/)).toBeVisible();
}

async function giveUp(page: Page) {
  await page.getByRole('button', { name: 'Give up' }).click();
  await page.getByRole('button', { name: 'Yes, give up' }).click();
  await expect(page.getByText('You gave up.')).toBeVisible();
}

// ---------- Picture Puzzle helpers ----------

const spots = (page: Page) => page.getByRole('button', { name: /^Spot \d+/ });

async function tileAt(page: Page, spot: number): Promise<number> {
  return Number(await spots(page).nth(spot).getAttribute('data-tile'));
}

// ---------- Spot the Difference helpers ----------

// Clicks a point given in image pixels on the left or right picture, offset a little as a
// trackpad click would be.
async function clickPicture(page: Page, side: 'Left' | 'Right', x: number, y: number) {
  const box = (await page.getByRole('button', { name: `${side} picture` }).boundingBox())!;
  await page.mouse.click(box.x + (x / 800) * box.width, box.y + (y / 600) * box.height);
}

test('Batch 3 tasks', async ({ browser }) => {
  const team = games.a.teams[0]!;
  await staff(games, `/games/${games.a.id}/start`);
  const page = await login(browser, games, team);

  await tab(page, 'home');
  await expect(page.getByRole('button', { name: /^Picture Puzzle:/ })).toBeVisible();
  await shot(page, 'home');

  // ---------- Picture Puzzle ----------
  await openTask(page, 'Picture Puzzle');
  await shot(page, 'puzzle-1-brief');
  await start(page, 'Start Task');
  await expect(spots(page)).toHaveCount(9);
  await fits(page, page.getByLabel('Puzzle'));
  await fits(page, page.getByRole('button', { name: 'Give up' }));
  await fits(page, page.getByRole('button', { name: /Use hint/ }));
  await shot(page, 'puzzle-2-playing');

  // Put tile 1 in spot 1 by clicking two tiles.
  const home = await spots(page).evaluateAll((els) =>
    els.findIndex((el) => el.getAttribute('data-tile') === '0'),
  );
  await spots(page).nth(0).click();
  await expect(page.getByText('Now click the tile to swap with.')).toBeVisible();
  await shot(page, 'puzzle-3-picked');
  if (home !== 0) {
    await spots(page).nth(home).click();
    await expect(spots(page).nth(0)).toHaveAttribute('data-tile', '0');
  } else {
    await spots(page).nth(0).click();
  }

  await useHint(page);
  await expect(spots(page).first()).toHaveAccessibleName(/tile \d/);
  await shot(page, 'puzzle-4-hint');

  // Progress is kept by the server: a refresh shows the same order.
  const before = await spots(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-tile')),
  );
  await page.reload();
  await expect(spots(page)).toHaveCount(9);
  expect(
    await spots(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-tile'))),
  ).toEqual(before);

  await giveUp(page);
  await shot(page, 'puzzle-5-failed');

  await start(page, 'Try again');
  for (let i = 0; i < 9; i++) {
    if ((await page.getByText('Solved!').count()) > 0) break;
    if ((await tileAt(page, i)) === i) continue;
    const j = await spots(page).evaluateAll(
      (els, want) => els.findIndex((el) => el.getAttribute('data-tile') === String(want)),
      i,
    );
    if (i === 7) await shot(page, 'puzzle-6-almost');
    await spots(page).nth(i).click();
    await spots(page).nth(j).click();
    await expect(spots(page).nth(i).or(page.getByText('Solved!')).first()).toBeVisible();
    await expect
      .poll(async () => ((await page.getByText('Solved!').count()) > 0 ? i : await tileAt(page, i)))
      .toBe(i);
  }
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'puzzle-7-solved');

  // ---------- Spot the Difference ----------
  await openTask(page, 'Spot the Difference');
  await shot(page, 'spot-1-brief');
  await start(page, 'Start Task');
  await fits(page, page.getByRole('button', { name: 'Right picture' }));
  await fits(page, page.getByRole('button', { name: 'Left picture' }));
  await fits(page, page.getByRole('button', { name: 'Give up' }));
  await expect(page.getByLabel('0 of 7 found')).toBeVisible();

  // A miss: no penalty, just a mark.
  const fundsBefore = await page
    .getByText(/^Task Funds/)
    .locator('..')
    .textContent();
  await clickPicture(page, 'Left', 760, 580);
  await expect(page.getByRole('status')).toHaveText('No difference there.');
  await shot(page, 'spot-2-miss');
  expect(
    await page
      .getByText(/^Task Funds/)
      .locator('..')
      .textContent(),
  ).toBe(fundsBefore);

  // Three finds, clicked 25 px off centre (inside the forgiving area).
  for (const [k, [x, y]] of SPOT_AREAS.slice(0, 3).entries()) {
    await clickPicture(page, k % 2 ? 'Left' : 'Right', x + 25, y + 20);
    await expect(page.getByLabel(`${k + 1} of 7 found`)).toBeVisible();
  }
  await shot(page, 'spot-3-three-found');

  await useHint(page);
  await shot(page, 'spot-4-hint');

  await giveUp(page);
  await shot(page, 'spot-5-failed');

  await start(page, 'Try again');
  for (const [k, [x, y]] of SPOT_AREAS.entries()) {
    if (k === 6) await shot(page, 'spot-6-six-found');
    await clickPicture(page, 'Right', x - 20, y + 15);
    if (k < 6) await expect(page.getByLabel(`${k + 1} of 7 found`)).toBeVisible();
  }
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'spot-7-solved');

  // ---------- Data Story ----------
  await openTask(page, 'Data Story');
  await shot(page, 'data-1-brief');
  await start(page, 'Start Task');
  const checks = page.getByRole('button', { name: 'Check' });
  await expect(checks).toHaveCount(3);
  await fits(page, checks.last());
  await fits(page, page.getByRole('button', { name: 'Give up' }));
  await page.getByLabel('Answer to question 1').fill('Nowhere');
  await checks.first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Not right' })).toBeVisible();
  await fits(page, checks.last());
  await shot(page, 'data-2-playing');

  await useHint(page);
  await expect(page.getByText(/Hint for question 1: the outlined chart\./)).toBeVisible();
  await fits(page, checks.last());
  await shot(page, 'data-3-hint');

  // No Give up here: after 3 fails the team's Task Funds are below zero, and the game then
  // blocks a new try (GAME_RULES section 3). Answer on this try instead.
  await page.getByLabel('Answer to question 1').fill('');
  const questions = page.locator('ol > li');
  for (let i = 0; i < 3; i++) {
    const text = ((await questions.nth(i).locator('p').first().textContent()) ?? '')
      .replace(/^\d+\.\s*/, '')
      .trim();
    expect(DATA_ANSWERS[text], `answer for "${text}"`).toBeDefined();
    await page.getByLabel(`Answer to question ${i + 1}`).fill(DATA_ANSWERS[text]!);
    if (i === 2) await shot(page, 'data-4-last-answer');
    await page.getByRole('button', { name: 'Check' }).first().click();
    if (i < 2) await expect(page.getByLabel(`Answer to question ${i + 1}`)).toHaveCount(0);
  }
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'data-5-solved');
});
