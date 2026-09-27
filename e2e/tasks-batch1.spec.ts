import { expect, test, type Page } from '@playwright/test';
import { createGames, deleteGames, login, shooter, staff, tab, type Games } from './helpers';

// Batch 1 task screenshots (The Vault, Find the Code): `npm run screenshots:batch1`.
// For each task: brief, playing with a partly typed answer, hint used, locked after 3 wrong
// tries, failed (Give up), and solved. The right answer depends on another team's Found item,
// so "solved" uses the dev finish route. Ends with the Funds list showing hint and fail lines.

const shot = shooter('screenshots/phase5/batch1');
let games: Games;

test.beforeAll(() => {
  games = createGames();
});

test.afterAll(() => deleteGames(games));

async function openTask(page: Page, name: string) {
  await tab(page, 'home');
  await page.getByRole('button', { name: new RegExp(`^${name}:`) }).click();
}

async function useHint(page: Page) {
  await page.getByRole('button', { name: 'Use hint' }).click();
  await page.getByRole('button', { name: 'Yes, use hint' }).click();
  await expect(page.getByText('Hint used. It is shown in the task.')).toBeVisible();
}

async function giveUpAndRetry(page: Page, prefix: string) {
  await page.getByRole('button', { name: 'Give up' }).click();
  await page.getByRole('button', { name: 'Yes, give up' }).click();
  await expect(page.getByText('You gave up.')).toBeVisible();
  await shot(page, `${prefix}-5-failed`);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByLabel('Task time left')).toBeVisible();
}

test('Batch 1 tasks', async ({ browser }) => {
  const team = games.a.teams[0]!;
  const gameA = `/games/${games.a.id}`;
  await staff(games, `${gameA}/start`);
  const page = await login(browser, games, team);

  // ---------- The Vault ----------
  await openTask(page, 'The Vault');
  await expect(page.getByRole('button', { name: 'Start Task' })).toBeVisible();
  await shot(page, 'vault-1-brief');

  await page.getByRole('button', { name: 'Start Task' }).click();
  await expect(page.getByText('How many legs does a spider have?')).toBeVisible();
  for (const [i, d] of ['8', '3', '6'].entries()) {
    await page.getByLabel(`Digit ${i + 1}`).fill(d);
  }
  await shot(page, 'vault-2-playing');

  await useHint(page);
  await shot(page, 'vault-3-hint');

  for (const [i, d] of ['0', '0', '0'].entries()) {
    await page.getByLabel(`Digit ${i + 4}`).fill(d);
  }
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Open the vault' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Not right/ })).toBeVisible();
  }
  await expect(page.getByRole('alert')).toContainText('Locked after too many wrong tries');
  await shot(page, 'vault-4-locked');

  await giveUpAndRetry(page, 'vault');
  await staff(games, `${gameA}/dev/finish-tasks/${team.id}`, { limit: 1 });
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'vault-6-solved');

  // ---------- Find the Code ----------
  await openTask(page, 'Find the Code');
  await expect(page.getByRole('button', { name: 'Start Task' })).toBeVisible();
  await shot(page, 'findcode-1-brief');

  await page.getByRole('button', { name: 'Start Task' }).click();
  await expect(page.getByLabel('Secret message')).toBeVisible();
  const letters = page.getByRole('textbox', { name: /^Letter \d+$/ });
  const open = async () => {
    const out = [];
    for (const box of await letters.all()) {
      if ((await box.getAttribute('readonly')) === null) out.push(box);
    }
    return out;
  };
  await (await open())[0]?.fill('A');
  await shot(page, 'findcode-2-playing');

  await useHint(page);
  await shot(page, 'findcode-3-hint');

  for (const box of await open()) {
    if ((await box.inputValue()) === '') await box.fill('X');
  }
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Submit the word' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Not right/ })).toBeVisible();
  }
  await expect(page.getByRole('alert')).toContainText('Locked after too many wrong tries');
  await shot(page, 'findcode-4-locked');

  await giveUpAndRetry(page, 'findcode');
  await staff(games, `${gameA}/dev/finish-tasks/${team.id}`, { limit: 1 });
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'findcode-6-solved');

  // ---------- Funds: hint and fail lines ----------
  await tab(page, 'funds');
  const list = page.getByRole('heading', { name: 'Transactions' }).locator('..');
  await expect(list).toContainText('Hint · Find the Code');
  await expect(list).toContainText('Task failed · The Vault');
  await list.scrollIntoViewIfNeeded();
  await shot(page, 'funds-hint-and-fail-lines');
});
