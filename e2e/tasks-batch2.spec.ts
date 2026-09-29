import { expect, test, type Locator, type Page } from '@playwright/test';
import { createGames, deleteGames, login, shooter, staff, tab, type Games } from './helpers';

// Batch 2 task screenshots (Riddle, Hangman, Ethical Dilemma): `npm run screenshots:batch2`.
// The games load only these 3 unique tasks, so every team draws them. Each task is played for
// real: brief, playing, hint, failed, then solved on the next try. Every screen checks that its
// main button is inside the 1280x720 window without scrolling.

const shot = shooter('screenshots/phase5/batch2');
let games: Games;

// The sample content (apps/server/prisma/sampleContent.ts), to play whichever variant comes up.
const RIDDLE_ANSWERS: Record<string, string> = {
  'I have keys but open no locks. I have space but no room. What am I?': 'The keyboard',
  'The more you take, the more you leave behind. What are they?': 'foot steps',
  'What has many teeth but cannot bite?': 'a comb',
  'What has hands but cannot clap?': 'A Clock',
  'What gets wetter the more it dries?': 'the towel.',
  'What has 12 months and 52 weeks, but is not a year?': 'calendar',
  'What has a head and a tail but no body?': 'a coin',
  'What goes up but never comes down?': 'your age',
  'What has one eye but cannot see?': 'needle',
};
const HANGMAN_PHRASES: Record<string, string> = {
  'Office problem': 'printer out of paper',
  'On the calendar': 'quarterly review meeting',
  'In your inbox': 'out of office reply',
};

test.beforeAll(() => {
  games = createGames(['riddle', 'hangman', 'ethical_dilemma']);
});

test.afterAll(() => deleteGames(games));

// The whole element is on screen at 1280x720, with no scrolling.
async function fits(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(box, 'element has a box').not.toBeNull();
  expect(scrollY).toBe(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
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
  await page.getByRole('button', { name: 'Use hint' }).click();
  await page.getByRole('button', { name: 'Yes, use hint' }).click();
  await expect(page.getByText('Hint used. It is shown in the task.')).toBeVisible();
}

async function giveUp(page: Page) {
  await page.getByRole('button', { name: 'Give up' }).click();
  await page.getByRole('button', { name: 'Yes, give up' }).click();
  await expect(page.getByText('You gave up.')).toBeVisible();
}

// Types one Hangman letter on the keyboard and waits for the server to mark it.
async function pressLetter(page: Page, letter: string) {
  await page.keyboard.press(letter);
  await expect(
    page.getByRole('button', { name: new RegExp(`^Letter ${letter.toUpperCase()}, `) }),
  ).toBeDisabled();
}

async function hangmanPhrase(page: Page): Promise<string> {
  const chip = await page.getByText(/^Category: /).textContent();
  const phrase = HANGMAN_PHRASES[(chip ?? '').replace('Category: ', '')];
  expect(phrase, `known category in "${chip}"`).toBeDefined();
  return phrase!;
}

test('Batch 2 tasks', async ({ browser }) => {
  const team = games.a.teams[0]!;
  await staff(games, `/games/${games.a.id}/start`);
  const page = await login(browser, games, team);

  await tab(page, 'home');
  await expect(page.getByRole('button', { name: /^Riddle:/ })).toBeVisible();
  await shot(page, 'home');

  // ---------- Riddle ----------
  await openTask(page, 'Riddle');
  await shot(page, 'riddle-1-brief');
  await start(page, 'Start Task');
  const riddles = page.locator('ol > li');
  await expect(riddles).toHaveCount(3);
  // One right answer (with an article and odd case), one wrong.
  const first = (await riddles.nth(0).locator('p').first().textContent()) ?? '';
  await page.getByLabel('Answer to riddle 1').fill(RIDDLE_ANSWERS[first] ?? '');
  await page.getByRole('button', { name: 'Check' }).first().click();
  await expect(page.getByLabel('Answer to riddle 1')).toHaveCount(0);
  await page.getByLabel('Answer to riddle 2').fill('a banana');
  await page.getByRole('button', { name: 'Check' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Not right' })).toBeVisible();
  await shot(page, 'riddle-2-playing');
  await fits(page, page.getByRole('button', { name: 'Check' }).last());

  await useHint(page);
  await expect(page.getByText(/Hint: You/)).toBeVisible();
  await fits(page, page.getByRole('button', { name: 'Check' }).last());
  await shot(page, 'riddle-3-hint');

  await giveUp(page);
  await shot(page, 'riddle-4-failed');

  // The next try has new riddles; solve all 3.
  await start(page, 'Try again');
  for (let i = 0; i < 3; i++) {
    const text = (await riddles.nth(i).locator('p').first().textContent()) ?? '';
    expect(RIDDLE_ANSWERS[text], `answer for "${text}"`).toBeDefined();
    await page.getByLabel(`Answer to riddle ${i + 1}`).fill(RIDDLE_ANSWERS[text]!);
    if (i === 2) await shot(page, 'riddle-5-last-answer');
    await page.getByRole('button', { name: 'Check' }).first().click();
    if (i < 2) await expect(page.getByLabel(`Answer to riddle ${i + 1}`)).toHaveCount(0);
  }
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'riddle-6-solved');

  // ---------- Hangman ----------
  await openTask(page, 'Hangman');
  await shot(page, 'hangman-1-brief');
  await start(page, 'Start Task');
  let phrase = await hangmanPhrase(page);
  const right = [...new Set(phrase.replace(/[^a-z]/g, ''))];
  const wrong = [...'zxqjkvbwgh'].filter((l) => !phrase.includes(l));
  await pressLetter(page, right[0]!);
  await pressLetter(page, wrong[0]!);
  await shot(page, 'hangman-2-playing');
  await fits(page, page.getByRole('button', { name: /^Letter Z/ }));

  await useHint(page);
  await expect(page.getByText(/Hint: [A-Z]$/)).toBeVisible();
  await shot(page, 'hangman-3-hint');

  // Wrong letters until the try fails (6 in all).
  for (const l of wrong.slice(1)) {
    if (await page.getByText('Too many wrong letters.').isVisible()) break;
    await page.keyboard.press(l);
    await expect(
      page
        .getByRole('button', { name: new RegExp(`^Letter ${l.toUpperCase()}, `) })
        .or(page.getByText('Too many wrong letters.')),
    ).toBeVisible();
    if (l === wrong[4]) {
      await expect(page.getByLabel('Lives left: 1 of 6')).toBeVisible();
      await shot(page, 'hangman-4-one-life-left');
    }
  }
  await expect(page.getByText('Too many wrong letters.')).toBeVisible();
  await shot(page, 'hangman-5-failed');

  // The next try has a new phrase: use the hint, check the longest phrase still fits, then
  // type the letters that are left.
  await start(page, 'Try again');
  phrase = await hangmanPhrase(page);
  await useHint(page);
  await fits(page, page.getByRole('button', { name: /^Letter Z/ }));
  const letters = [...new Set(phrase.replace(/[^a-z]/g, ''))];
  for (const l of letters) {
    const key = page.getByRole('button', { name: new RegExp(`^Letter ${l.toUpperCase()}`) });
    if (await key.isDisabled()) continue;
    if (l === letters.at(-1)) await shot(page, 'hangman-6-almost');
    await page.keyboard.press(l);
    await expect(key.or(page.getByText('Solved!')).first()).toBeVisible();
  }
  await expect(page.getByText('Solved!')).toBeVisible();
  await shot(page, 'hangman-7-solved');

  // ---------- Ethical Dilemma ----------
  await openTask(page, 'Ethical Dilemma');
  await expect(page.getByText('This task has no hint.')).toBeVisible();
  await shot(page, 'dilemma-1-brief');
  await start(page, 'Start Task');
  await shot(page, 'dilemma-2-playing');
  await fits(page, page.getByRole('button', { name: 'Submit answer' }));
  await page.locator('label', { hasText: /Ask your colleague to tell the manager/ }).click();
  await expect(page.getByRole('radio', { name: /Ask your colleague/ })).toBeChecked();
  await page
    .getByLabel('Your reason')
    .fill('The news is theirs to give, and the manager needs it.');
  await fits(page, page.getByRole('button', { name: 'Submit answer' }));
  await shot(page, 'dilemma-3-answered');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByText('Answer saved.')).toBeVisible();
  await shot(page, 'dilemma-4-saved');

  // The saved answer appears in the facilitator's Debrief, which opens at the Reveal.
  for (let i = 0; i < 3; i++) await staff(games, `/games/${games.a.id}/end-phase`);
  const staffContext = await browser.newContext();
  await staffContext.addInitScript((token) => {
    sessionStorage.setItem(
      'mp.staffLogin',
      JSON.stringify({ token, staff: { id: 'x', name: 'Admin', role: 'MAIN_ADMIN' } }),
    );
  }, games.staffToken);
  const staffPage = await staffContext.newPage();
  await staffPage.goto(`/staff#/games/${games.a.id}/debrief`);
  const answers = staffPage
    .getByRole('heading', { name: 'Ethical Dilemma answers' })
    .locator('xpath=ancestor::section[1]');
  await expect(answers).toContainText('The news is theirs to give');
  await answers.scrollIntoViewIfNeeded();
  await shot(staffPage, 'staff-debrief-dilemma-answers');
});
