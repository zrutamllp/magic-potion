import { expect, test, type Locator, type Page } from '@playwright/test';
import { createGames, deleteGames, login, shooter, staff, tab, type Games } from './helpers';

// Batch 4 task screenshots (Alien Translator, Guess the Celebrity, Pictionary, Escape Room):
// `npm run screenshots:batch4`. A team draws 3 unique tasks, so there are two sets of games:
// one with Alien Translator, Guess the Celebrity and Pictionary, one with Escape Room (plus two
// others). Each task is played for real: brief, playing, wrong answer, hint, then solved (Alien
// Translator and Guess the Celebrity fail once first). Every screen checks that its main parts fit a 1280x720 window without
// scrolling.

const shot = shooter('screenshots/phase5/batch4');
let games: Games;
let escapeGames: Games;

test.beforeAll(() => {
  games = createGames(['alien_translator', 'guess_celebrity', 'pictionary']);
  escapeGames = createGames(['escape_room', 'riddle', 'hangman']);
});

test.afterAll(() => {
  deleteGames(games);
  deleteGames(escapeGames);
});

// The whole element is on screen at 1280x720, with no scrolling.
async function fits(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  // Keep a picture of the screen if it does not fit.
  await page.screenshot({ path: 'test-results/batch4-last-fit-check.png' });
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
}

async function giveUp(page: Page) {
  await page.getByRole('button', { name: 'Give up' }).click();
  await page.getByRole('button', { name: 'Yes, give up' }).click();
  await expect(page.getByText('You gave up.')).toBeVisible();
}

// ---------- Alien Translator ----------

// THE PURPLE MOON RISES AT DAWN (sample content). Letter boxes are numbered across the message.
const ALIEN = 'THEPURPLEMOONRISESATDAWN';

async function typeAlien(page: Page, text: string) {
  for (let i = 0; i < text.length; i++) {
    const box = page.getByLabel(`Letter ${i + 1}`, { exact: true });
    if ((await box.getAttribute('readonly')) === null) await box.fill(text[i]!);
  }
}

// ---------- Guess the Celebrity ----------

// The placeholder faces (sample content): file name -> an accepted name.
const FACES: Record<string, string> = {
  '12a1173ba2': 'sample one',
  '6afcee46f9': 'Sample Two',
  '0608b2a753': 'sample 3',
  '08a6337778': 'sample four',
  '758551c75d': 'Sample-Five',
  '96c3a97de9': 'sample six',
  f4975b5ad3: 'sample seven',
  '303364df23': 'sample eight',
};

async function faceName(page: Page): Promise<string> {
  const src = (await page.getByRole('img', { name: /^Face \d+ of 8$/ }).getAttribute('src')) ?? '';
  const file = /([0-9a-f]{10})\.svg$/.exec(src)?.[1] ?? '';
  return FACES[file] ?? 'unknown';
}

async function guess(page: Page, name: string) {
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Guess', exact: true }).click();
}

// ---------- Pictionary ----------

// The 5 sample words, in order, typed the way a team might.
const WORDS = ['A key', 'Coffee Mug', 'lightbulb', 'Laptops', 'rocket ship'];

async function wordIndex(page: Page): Promise<number> {
  const text = (await page.getByText(/^Word \d of 5$/).textContent()) ?? '';
  return Number(/Word (\d)/.exec(text)?.[1] ?? '1') - 1;
}

async function guessWord(page: Page, word: string) {
  await page.getByLabel('Your guess').fill(word);
  await page.getByRole('button', { name: 'Guess', exact: true }).click();
}

test('Batch 4: Alien Translator, Guess the Celebrity, Pictionary', async ({ browser }) => {
  const team = games.a.teams[0]!;
  await staff(games, `/games/${games.a.id}/start`);
  const page = await login(browser, games, team);

  await tab(page, 'home');
  await expect(page.getByRole('button', { name: /^Alien Translator:/ })).toBeVisible();
  await shot(page, 'home');

  // ---------- Alien Translator ----------
  await openTask(page, 'Alien Translator');
  await shot(page, 'alien-1-brief');
  await start(page, 'Start Task');
  await fits(page, page.getByLabel('Alien message'));
  await fits(page, page.getByLabel('Legend'));
  await fits(page, page.getByRole('button', { name: 'Submit', exact: true }));
  await fits(page, page.getByRole('button', { name: 'Give up' }));
  // Every legend letter is filled in on the start screen.
  await expect(page.getByLabel('Letter 1', { exact: true })).toHaveValue('T');
  await expect(page.getByLabel('Letter 6', { exact: true })).toHaveValue('R');
  await expect(page.getByLabel('Letter 4', { exact: true })).toHaveValue('');
  await shot(page, 'alien-2-playing');

  // A wrong translation: typing under one symbol fills every copy of it.
  await typeAlien(page, 'THEPURPLENOONRISESATDAWN');
  await expect(page.getByLabel('Letter 7', { exact: true })).toHaveValue('P');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByText('Not right. Try again.')).toBeVisible();
  await shot(page, 'alien-3-wrong');

  await useHint(page);
  await expect(page.getByText('Hint used.')).toBeVisible();
  await expect(page.getByLabel('From the hint')).toHaveCount(3);
  await shot(page, 'alien-4-hint');

  await giveUp(page);
  await shot(page, 'alien-5-failed');
  await start(page, 'Try again');
  await typeAlien(page, ALIEN);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'alien-6-solved');

  // ---------- Guess the Celebrity ----------
  await openTask(page, 'Guess the Celebrity');
  await shot(page, 'celebrity-1-brief');
  await start(page, 'Start Task');
  await expect(page.getByText('Face 1 of 8')).toBeVisible();
  await fits(page, page.getByRole('img', { name: 'Face 1 of 8' }));
  await fits(page, page.getByRole('button', { name: 'Pass' }));
  await fits(page, page.getByRole('button', { name: 'Give up' }));
  await fits(page, page.getByLabel('Named'));
  await shot(page, 'celebrity-2-playing');

  await guess(page, 'Somebody Else');
  await expect(page.getByText('Not right. Try again.')).toBeVisible();
  await shot(page, 'celebrity-3-wrong');

  // Pass: the next photo shows, and the passed one comes back after the others.
  await page.getByRole('button', { name: 'Pass' }).click();
  await expect(page.getByText('Face 2 of 8')).toBeVisible();
  await expect(page.getByText('Passed. It comes back later.')).toBeVisible();
  await shot(page, 'celebrity-4-passed');

  await useHint(page);
  await expect(page.getByText(/^Hint:/)).toBeVisible();
  await shot(page, 'celebrity-5-hint');

  // Name photos 2 to 5 (the chips list them), then give up.
  for (let i = 2; i <= 5; i++) {
    await expect(page.getByText(`Face ${i} of 8`)).toBeVisible();
    await guess(page, await faceName(page));
  }
  await expect(page.getByText('Face 6 of 8')).toBeVisible();
  await expect(page.getByLabel('Named').getByRole('listitem')).toHaveCount(4);
  await shot(page, 'celebrity-6-four-named');
  await giveUp(page);
  await shot(page, 'celebrity-7-failed');

  // Next try: pass the first photo, name the other 7, then the passed one comes back last.
  await start(page, 'Try again');
  const first = await faceName(page);
  await page.getByRole('button', { name: 'Pass' }).click();
  for (let i = 2; i <= 8; i++) {
    await expect(page.getByText(`Face ${i} of 8`)).toBeVisible();
    await guess(page, await faceName(page));
  }
  await expect(page.getByText('Face 1 of 8')).toBeVisible();
  expect(await faceName(page)).toBe(first);
  await expect(page.getByRole('button', { name: 'Pass' })).toBeDisabled();
  await shot(page, 'celebrity-8-last-photo');
  await guess(page, first);
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'celebrity-9-solved');

  // ---------- Pictionary ----------
  await openTask(page, 'Pictionary');
  await shot(page, 'pictionary-1-brief');
  await start(page, 'Start Task');
  await expect(page.getByText('Word 1 of 5')).toBeVisible();
  await fits(page, page.getByRole('img', { name: 'Drawing 1' }));
  await fits(page, page.getByRole('button', { name: 'Give up' }));
  await fits(page, page.getByLabel('Guessed'));
  // Mid-drawing, then the finished picture.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/phase5/batch4/pictionary-2-drawing.png' });
  await page.waitForTimeout(5000);
  await shot(page, 'pictionary-3-drawn');

  await guessWord(page, 'door');
  await expect(page.getByText('Not right. Try again.')).toBeVisible();
  await shot(page, 'pictionary-4-wrong');
  await guessWord(page, WORDS[0]!);
  await expect(page.getByText('Word 2 of 5')).toBeVisible();
  await useHint(page);
  await expect(page.getByText(/First letter: C/)).toBeVisible();
  await page.waitForTimeout(6000);
  await shot(page, 'pictionary-5-hint');

  // Funds are low after two fails, so this one is solved on the same try.
  for (let i = 1; i < 5; i++) {
    await expect(page.getByText(`Word ${i + 1} of 5`)).toBeVisible();
    expect(await wordIndex(page)).toBe(i);
    if (i === 4) {
      await page.waitForTimeout(6000);
      await fits(page, page.getByLabel('Guessed'));
      await shot(page, 'pictionary-6-last-word');
    }
    await guessWord(page, WORDS[i]!);
  }
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'pictionary-7-solved');
});

test('Batch 4: Escape Room', async ({ browser }) => {
  const team = escapeGames.a.teams[0]!;
  await staff(escapeGames, `/games/${escapeGames.a.id}/start`);
  const page = await login(browser, escapeGames, team);

  await openTask(page, 'Escape Room');
  await expect(page.getByText(/3 wrong tries lock the task/)).toBeVisible();
  await shot(page, 'escape-1-brief');
  await start(page, 'Start Task');
  await expect(page.getByText(/Stage 1 of 4/)).toBeVisible();
  await fits(page, page.getByRole('button', { name: 'Check' }));
  await fits(page, page.getByRole('button', { name: 'Give up' }));
  await fits(page, page.getByRole('main').getByRole('button', { name: 'Chat' }));
  // Later stages are not on the page.
  await expect(page.getByText('Mirror puzzle')).toHaveCount(0);
  await shot(page, 'escape-2-stage-1');

  const answer = async (text: string) => {
    await page.getByLabel('Answer', { exact: true }).fill(text);
    await page.getByRole('button', { name: 'Check' }).click();
  };

  await answer('Drawer A');
  await expect(page.getByText('Not right. Try again.')).toBeVisible();
  await shot(page, 'escape-3-wrong');
  await answer('drawer b');
  await expect(page.getByText(/Stage 2 of 4/)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Mirror text' })).toBeVisible();
  await fits(page, page.getByRole('button', { name: 'Check' }));
  await shot(page, 'escape-4-mirror');

  // Mirror text cannot be selected as text: select everything and look for it.
  const selected = await page.evaluate(() => {
    document.getSelection()?.selectAllChildren(document.body);
    return document.getSelection()?.toString() ?? '';
  });
  expect(selected).not.toContain('BLUE FOLDER');
  await page.evaluate(() => document.getSelection()?.removeAllRanges());

  await useHint(page);
  await expect(page.getByText('Hint: Read each line from right to left.')).toBeVisible();
  await shot(page, 'escape-5-hint');

  // 3 wrong answers lock the task (same setting as The Vault). The wrong answer on stage 1
  // counts too, so 2 more lock it.
  await expect(page.getByText(/2 of 3 tries left/)).toBeVisible();
  for (const w of ['red', 'green']) await answer(w);
  await expect(page.getByRole('alert')).toContainText('Locked after too many wrong tries');
  await fits(page, page.getByRole('alert'));
  await shot(page, 'escape-6-locked');

  // Chat opens the shared chat; the task timer keeps running.
  await page.getByRole('main').getByRole('button', { name: 'Chat' }).click();
  await expect(page.getByText(/Messages left/)).toBeVisible();
  await shot(page, 'escape-7-chat');

  // Give up (while locked is fine), then clear all 4 stages on the next try.
  await openTask(page, 'Escape Room');
  await giveUp(page);
  await shot(page, 'escape-8-failed');
  await start(page, 'Try again');
  await answer('B');
  await expect(page.getByText(/Stage 2 of 4/)).toBeVisible();
  await answer('Blue');
  await expect(page.getByText(/Stage 3 of 4/)).toBeVisible();
  await shot(page, 'escape-9-cipher');
  await answer('seven');
  await expect(page.getByText(/Stage 4 of 4/)).toBeVisible();
  await shot(page, 'escape-10-escape');
  await answer('28');
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'escape-11-solved');
});
