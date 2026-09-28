import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Ack, PlayerState, PlayerTaskView } from '@magic-potion/shared';
import { playerState, renderGame, task } from '../test/fixtures';
import { FORBIDDEN } from '../test/forbidden';
import { DRAW_SECONDS, strokeTimings } from './Pictionary';
import { toImagePoint } from './SpotDifference';
import { TaskScreen } from './TaskShell';

const vaultView = {
  content: {
    intro: 'Crack the 6-digit code. The 3 clues give 3 of the digits.',
    clues: [
      { text: 'How many legs does a spider have?' },
      { text: 'How many sides does a triangle have?' },
      { text: 'What is 15 minus 9?' },
    ],
  },
  hint: null as null | { position: number; digit: string },
};

const findView = {
  content: { intro: 'Decode the secret word with the key below.' },
  encodedMessage: ['★', '◆', '●', '★'],
  visibleKey: [{ symbol: '★', letter: 'T' }],
  hint: null as null | { symbol: string; letter: string },
};

function running(overrides: Partial<NonNullable<PlayerTaskView['running']>> = {}) {
  return {
    number: 1,
    msLeft: 600_000,
    lockMsLeft: 0,
    hintsUsed: 0,
    wrongCount: 0,
    nextLockSeconds: 60,
    view: vaultView,
    ...overrides,
  };
}

function withTasks(tasks: PlayerTaskView[], extra: Partial<PlayerState['team']> = {}): PlayerState {
  const state = playerState();
  state.team = { ...state.team, tasks, ...extra };
  return state;
}

const vault = (o: Partial<PlayerTaskView> = {}) => task({ id: 'v', ...o });
const findCode = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 'f', key: 'find_code', name: 'Find the Code', ...o });

describe('task shell', () => {
  it('brief: shows the facts from the settings and starts the task', () => {
    const { send } = renderGame(<TaskScreen taskId="v" />, { state: withTasks([vault()]) });
    expect(screen.getByText(/Timer:/)).toHaveTextContent(
      'Timer: 12 minutes. It starts when you press Start Task.',
    );
    expect(screen.getByText('Hint: 1 per try, costs 1,500.')).toBeInTheDocument();
    expect(screen.getByText('Timer runs out or Give up: −3,500 Task Funds.')).toBeInTheDocument();
    expect(
      screen.getByText(
        '3 wrong tries lock the task: 60 seconds the first time, 2 minutes the second time, and 4 minutes each time after that.',
      ),
    ).toBeInTheDocument();
    // The puzzle is not shown before Start.
    expect(screen.queryByText(/How many legs/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start Task' }));
    expect(send).toHaveBeenCalledWith('task:start', { taskId: 'v' });
  });

  it('brief: states what is not on the screen, for The Vault and Find the Code only', () => {
    const { unmount } = renderGame(<TaskScreen taskId="v" />, { state: withTasks([vault()]) });
    expect(screen.getByText('Digits 4-6 are not on this screen.')).toBeInTheDocument();
    unmount();
    const other = renderGame(<TaskScreen taskId="f" />, { state: withTasks([findCode()]) });
    expect(screen.getByText('Some letters are not on this screen.')).toBeInTheDocument();
    other.unmount();
    renderGame(<TaskScreen taskId="r" />, {
      state: withTasks([task({ id: 'r', key: 'riddle', name: 'Riddle', type: 'UNIQUE' })]),
    });
    expect(screen.queryByText(/not on this screen/)).toBeNull();
  });

  it('failed: says what happened and offers Try again', () => {
    const state = withTasks([
      findCode({ status: 'FAILED', lastResult: 'FAILED_TIMEOUT', attempts: 1 }),
    ]);
    const { send } = renderGame(<TaskScreen taskId="f" />, { state });
    expect(screen.getByText('The timer ran out.')).toBeInTheDocument();
    expect(screen.getByText('−3,500 Task Funds.')).toBeInTheDocument();
    expect(screen.getByText('A new try has a new timer and a new hint.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(send).toHaveBeenCalledWith('task:start', { taskId: 'f' });
  });

  it('failed by giving up: says so, and that the puzzle may change', () => {
    renderGame(<TaskScreen taskId="v" />, {
      state: withTasks([vault({ status: 'FAILED', lastResult: 'GAVE_UP' })]),
    });
    expect(screen.getByText('You gave up.')).toBeInTheDocument();
    expect(screen.getByText(/The puzzle may change\./)).toBeInTheDocument();
  });

  it('solved: shows the points', () => {
    renderGame(<TaskScreen taskId="v" />, { state: withTasks([vault({ status: 'DONE' })]) });
    expect(screen.getByText('Solved!')).toBeInTheDocument();
    expect(screen.getByText('+10,000 points.')).toBeInTheDocument();
  });

  it('hint card: shows the cost split and asks before using the hint', () => {
    const state = withTasks([vault({ status: 'IN_PROGRESS', running: running() })], {
      supportFunds: 1_000,
    });
    const { send } = renderGame(<TaskScreen taskId="v" />, { state });
    expect(
      screen.getByText(/Paid now: 1,000 from Support Funds and 500 from Task Funds\./),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use hint' }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, use hint' }));
    expect(send).toHaveBeenCalledWith('task:hint', { taskId: 'v' });
  });

  it('hint card: blocked when it would take Task Funds below zero, and after use', () => {
    const blocked = withTasks([vault({ status: 'IN_PROGRESS', running: running() })], {
      supportFunds: 0,
      taskFunds: 1_000,
    });
    const { unmount } = renderGame(<TaskScreen taskId="v" />, { state: blocked });
    expect(screen.getByText('A hint would take your Task Funds below zero.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use hint' })).toBeNull();
    unmount();
    renderGame(<TaskScreen taskId="v" />, {
      state: withTasks([vault({ status: 'IN_PROGRESS', running: running({ hintsUsed: 1 }) })]),
    });
    expect(screen.getByText('Hint used. It is shown in the task.')).toBeInTheDocument();
  });

  it('tries card and lockout banner', () => {
    const { unmount } = renderGame(<TaskScreen taskId="v" />, {
      state: withTasks([vault({ status: 'IN_PROGRESS', running: running({ wrongCount: 1 }) })]),
    });
    expect(screen.getByText(/of 3 tries left before a 60-second lock/)).toHaveTextContent('2 of 3');
    unmount();
    renderGame(<TaskScreen taskId="v" />, {
      state: withTasks([
        vault({ status: 'IN_PROGRESS', running: running({ lockMsLeft: 42_000 }) }),
      ]),
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in 0:42');
    expect(screen.getByRole('button', { name: 'Open the vault' })).toBeDisabled();
  });

  it('tries card: says the next lock is longer after earlier locks', () => {
    renderGame(<TaskScreen taskId="v" />, {
      state: withTasks([
        vault({ status: 'IN_PROGRESS', running: running({ nextLockSeconds: 120 }) }),
      ]),
    });
    expect(screen.getByText(/tries left before a 2-minute lock/)).toBeInTheDocument();
  });

  it('never tells teams to cooperate', () => {
    const screens = [
      withTasks([vault()]),
      withTasks([vault({ status: 'IN_PROGRESS', running: running() })]),
      withTasks([findCode({ status: 'IN_PROGRESS', running: running({ view: findView }) })]),
      withTasks([vault({ status: 'FAILED', lastResult: 'GAVE_UP' })]),
    ];
    for (const state of screens) {
      const id = state.team.tasks[0]!.id;
      const { container, unmount } = renderGame(<TaskScreen taskId={id} />, { state });
      for (const pattern of FORBIDDEN) expect(container.textContent).not.toMatch(pattern);
      unmount();
    }
  });
});

describe('The Vault', () => {
  const playing = (o: Partial<NonNullable<PlayerTaskView['running']>> = {}) =>
    withTasks([vault({ status: 'IN_PROGRESS', running: running(o) })]);

  it('shows the clues and sends the 6 digits typed in the boxes', async () => {
    const { send } = renderGame(<TaskScreen taskId="v" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'wrong' } } as Ack,
    });
    expect(screen.getByText('How many legs does a spider have?')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Open the vault' });
    expect(submit).toBeDisabled();
    '836429'.split('').forEach((d, i) => {
      fireEvent.change(screen.getByLabelText(`Digit ${i + 1}`), { target: { value: d } });
    });
    expect(submit).toBeEnabled();
    await act(async () => fireEvent.click(submit));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'v',
      submission: { code: '836429' },
    });
    expect(await screen.findByText('Not right. Try again.')).toBeInTheDocument();
    // The digits stay, so one wrong digit is easy to fix.
    expect(screen.getByLabelText('Digit 6')).toHaveValue('9');
  });

  it('shows the marker faintly in boxes 4-6 and says those digits are not on this screen', () => {
    renderGame(<TaskScreen taskId="v" />, {
      state: playing({ view: { ...vaultView, marker: '🍎' } }),
    });
    expect(screen.getByLabelText('Digit 1')).not.toHaveAttribute('placeholder');
    for (const i of [4, 5, 6]) {
      expect(screen.getByLabelText(`Digit ${i}`)).toHaveAttribute('placeholder', '🍎');
    }
    expect(screen.getByText('Digits 4-6 are not on this screen.')).toBeInTheDocument();
    // Typing over the placeholder works as normal.
    fireEvent.change(screen.getByLabelText('Digit 4'), { target: { value: '4' } });
    expect(screen.getByLabelText('Digit 4')).toHaveValue('4');
  });

  it('shows the Vault marker, with no explanation', () => {
    renderGame(<TaskScreen taskId="v" />, {
      state: playing({ view: { ...vaultView, marker: '🍎' } }),
    });
    expect(screen.getByLabelText('Vault 🍎')).toHaveTextContent('Vault 🍎');
  });

  it('fills all boxes from a paste', () => {
    renderGame(<TaskScreen taskId="v" />, { state: playing() });
    fireEvent.paste(screen.getByLabelText('Digit 1'), {
      clipboardData: { getData: () => '83-6 429' },
    });
    expect(
      ['1', '2', '3', '4', '5', '6'].map(
        (i) => (screen.getByLabelText(`Digit ${i}`) as HTMLInputElement).value,
      ),
    ).toEqual(['8', '3', '6', '4', '2', '9']);
  });

  it('ignores letters in the digit boxes', () => {
    renderGame(<TaskScreen taskId="v" />, { state: playing() });
    fireEvent.change(screen.getByLabelText('Digit 1'), { target: { value: 'a' } });
    expect(screen.getByLabelText('Digit 1')).toHaveValue('');
  });

  it('fills in and locks the hint digit', () => {
    renderGame(<TaskScreen taskId="v" />, {
      state: playing({ hintsUsed: 1, view: { ...vaultView, hint: { position: 1, digit: '3' } } }),
    });
    expect(screen.getByLabelText('Digit 2')).toHaveValue('3');
    expect(screen.getByLabelText('Digit 2')).toHaveAttribute('readonly');
    expect(screen.getByText('Hint: 3')).toBeInTheDocument();
  });

  it("shows the server's message when a code is refused", async () => {
    renderGame(<TaskScreen taskId="v" />, {
      state: playing(),
      ack: { ok: false, message: 'Too many wrong tries. Wait for the lock to end.' },
    });
    '111111'.split('').forEach((d, i) => {
      fireEvent.change(screen.getByLabelText(`Digit ${i + 1}`), { target: { value: d } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open the vault' }));
    await waitFor(() =>
      expect(
        screen.getByText('Too many wrong tries. Wait for the lock to end.'),
      ).toBeInTheDocument(),
    );
  });
});

describe('Find the Code', () => {
  const playing = (view = findView) =>
    withTasks([findCode({ status: 'IN_PROGRESS', running: running({ view }) })]);

  it('fills known letters, copies a typed letter to every matching symbol, and sends the word', async () => {
    const { send } = renderGame(<TaskScreen taskId="f" />, { state: playing() });
    expect(screen.getByLabelText('Letter 1')).toHaveValue('T');
    expect(screen.getByLabelText('Letter 1')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Letter 4')).toHaveValue('T');
    // The key lists the known pair, and "?" for the others.
    expect(screen.getByText('★ = T')).toBeInTheDocument();
    expect(screen.getByText('◆ = ?')).toBeInTheDocument();
    expect(screen.getByText('● = ?')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Letter 2'), { target: { value: 'e' } });
    fireEvent.change(screen.getByLabelText('Letter 3'), { target: { value: 's' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit the code' })));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'f',
      submission: { answer: 'TEST' },
    });
  });

  it('adds the hint letter to the key and the message', () => {
    renderGame(<TaskScreen taskId="f" />, {
      state: playing({ ...findView, hint: { symbol: '◆', letter: 'E' } }),
    });
    expect(screen.getByLabelText('Letter 2')).toHaveValue('E');
    expect(screen.getByLabelText('Letter 2')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('From the hint')).toBeInTheDocument();
    expect(screen.queryByText('◆ = ?')).toBeNull();
  });

  it('says some letters are not on this screen, and keeps "?" in the key', () => {
    renderGame(<TaskScreen taskId="f" />, { state: playing() });
    expect(screen.getByText('Some letters are not on this screen.')).toBeInTheDocument();
    expect(screen.getByText('◆ = ?')).toBeInTheDocument();
  });

  it('cannot submit until every letter is filled', () => {
    renderGame(<TaskScreen taskId="f" />, { state: playing() });
    expect(screen.getByRole('button', { name: 'Submit the code' })).toBeDisabled();
  });
});

// ---------- Batch 2 ----------

const riddleView = {
  content: {
    riddles: [
      'What has hands but cannot clap?',
      'What gets wetter the more it dries?',
      'What has 12 months and 52 weeks, but is not a year?',
    ],
  },
  answers: [null, null, null] as (string | null)[],
  hint: null as null | { index: number; text: string },
};

const hangmanView = {
  content: { category: 'Office problem' },
  masked: 'P____e_ ___ __ p_pe_',
  guessed: ['p', 'e', 'z', 'q'],
  wrong: 2,
  maxWrong: 6,
  hinted: null as string | null,
};

const dilemmaView = {
  content: {
    scenario: 'A colleague tells you some news in private.',
    options: ['Say nothing.', 'Tell your manager.', 'Ask them to tell.', 'Raise a concern.'],
  },
  choice: null,
  reason: null,
};

const riddle = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 'r', key: 'riddle', name: 'Riddle', type: 'UNIQUE', ...o });
const hangman = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 'h', key: 'hangman', name: 'Hangman', type: 'UNIQUE', ...o });
const dilemma = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 'd', key: 'ethical_dilemma', name: 'Ethical Dilemma', type: 'UNIQUE', ...o });

describe('Riddle', () => {
  const playing = (view = riddleView) =>
    withTasks([riddle({ status: 'IN_PROGRESS', running: running({ view }) })]);

  it('checks one riddle at a time and says when an answer is not right', async () => {
    const { send } = renderGame(<TaskScreen taskId="r" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'wrong' } } as Ack,
    });
    expect(screen.getByText('What has hands but cannot clap?')).toBeInTheDocument();
    const checks = screen.getAllByRole('button', { name: 'Check' });
    expect(checks).toHaveLength(3);
    expect(checks[1]).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Answer to riddle 2'), {
      target: { value: 'A sponge' },
    });
    await act(async () => fireEvent.click(checks[1]!));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'r',
      submission: { index: 1, answer: 'A sponge' },
    });
    expect(await screen.findByText('Not right. Try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Answer to riddle 2')).toHaveValue('A sponge');
  });

  it('shows solved riddles with their answer, and the hint under its riddle', () => {
    renderGame(<TaskScreen taskId="r" />, {
      state: playing({
        ...riddleView,
        answers: ['A clock', null, null],
        hint: { index: 1, text: 'You use it after a bath.' },
      }),
    });
    expect(screen.getByText('A clock')).toBeInTheDocument();
    expect(screen.queryByLabelText('Answer to riddle 1')).toBeNull();
    expect(screen.getByText(/Hint: You use it after a bath\./)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Check' })).toHaveLength(2);
  });
});

describe('Hangman', () => {
  const playing = (view = hangmanView) =>
    withTasks([hangman({ status: 'IN_PROGRESS', running: running({ view }) })]);

  it('shows the phrase, lives left and wrong letters, and disables guessed letters', () => {
    renderGame(<TaskScreen taskId="h" />, { state: playing() });
    expect(screen.getByText('Category: Office problem')).toBeInTheDocument();
    expect(screen.getByLabelText('Lives left: 4 of 6')).toBeInTheDocument();
    expect(screen.getByText(/Wrong letters:/)).toHaveTextContent('Wrong letters: Z, Q');
    expect(screen.getByRole('button', { name: 'Letter P, in the phrase' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Letter Z, not in the phrase' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Letter R' })).toBeEnabled();
    expect(screen.getByLabelText(/^Phrase:/)).toHaveAttribute(
      'aria-label',
      'Phrase: P _ _ _ _ E _   _ _ _   _ _   P _ P E _',
    );
  });

  it('sends one letter from a click or the keyboard, and says if it is in the phrase', async () => {
    const { send } = renderGame(<TaskScreen taskId="h" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'correct' } } as Ack,
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Letter R' })));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'h',
      submission: { letter: 'r' },
    });
    expect(await screen.findByText('R is in the phrase.')).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(window, { key: 'T' }));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'h',
      submission: { letter: 't' },
    });
    // A letter already guessed is not sent again.
    send.mockClear();
    await act(async () => fireEvent.keyDown(window, { key: 'p' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('says when a letter is not in the phrase', async () => {
    renderGame(<TaskScreen taskId="h" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'wrong' } } as Ack,
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Letter X' })));
    expect(await screen.findByText('X is not in the phrase.')).toBeInTheDocument();
  });

  it('marks the hint letter', () => {
    renderGame(<TaskScreen taskId="h" />, {
      state: playing({ ...hangmanView, guessed: [...hangmanView.guessed, 'r'], hinted: 'r' }),
    });
    expect(screen.getByText('Hint: R')).toBeInTheDocument();
  });

  it('after too many wrong letters the brief says why the try failed', () => {
    renderGame(<TaskScreen taskId="h" />, {
      state: withTasks([hangman({ status: 'FAILED', lastResult: 'FAILED_WRONG' })]),
    });
    expect(screen.getByText('Too many wrong letters.')).toBeInTheDocument();
  });
});

describe('Ethical Dilemma', () => {
  const playing = () =>
    withTasks([dilemma({ status: 'IN_PROGRESS', running: running({ view: dilemmaView }) })]);

  it('needs an option and a reason, then sends both', async () => {
    const { send } = renderGame(<TaskScreen taskId="d" />, { state: playing() });
    const submit = screen.getByRole('button', { name: 'Submit answer' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Tell your manager\./ }));
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Your reason'), {
      target: { value: '  It matters. ' },
    });
    expect(submit).toBeEnabled();
    await act(async () => fireEvent.click(submit));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'd',
      submission: { choice: 1, reason: 'It matters.' },
    });
  });

  it('has no hint and no right answer, and Give up asks first', async () => {
    const { send } = renderGame(<TaskScreen taskId="d" />, { state: playing() });
    expect(screen.queryByRole('button', { name: 'Use hint' })).toBeNull();
    expect(screen.queryByText(/correct|right answer|wrong/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Give up' }));
    expect(screen.getByText('−3,500 Task Funds.')).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, give up' })));
    expect(send).toHaveBeenCalledWith('task:giveUp', { taskId: 'd' });
  });

  it('the brief says it has no hint', () => {
    renderGame(<TaskScreen taskId="d" />, { state: withTasks([dilemma()]) });
    expect(screen.getByText('This task has no hint.')).toBeInTheDocument();
  });

  it('once answered, shows the saved choice and reason', () => {
    renderGame(<TaskScreen taskId="d" />, {
      state: withTasks([
        dilemma({
          status: 'DONE',
          savedAnswer: { option: 'Tell your manager.', reason: 'It matters.' },
        }),
      ]),
    });
    expect(screen.getByText('Answer saved.')).toBeInTheDocument();
    expect(screen.getByText('+10,000 points.')).toBeInTheDocument();
    expect(screen.getByText('Tell your manager.')).toBeInTheDocument();
    expect(screen.getByText('It matters.')).toBeInTheDocument();
    expect(screen.queryByText('Solved!')).toBeNull();
  });
});

describe('Batch 2 text', () => {
  it('never tells teams to cooperate', () => {
    const screens = [
      withTasks([riddle({ status: 'IN_PROGRESS', running: running({ view: riddleView }) })]),
      withTasks([hangman({ status: 'IN_PROGRESS', running: running({ view: hangmanView }) })]),
      withTasks([dilemma({ status: 'IN_PROGRESS', running: running({ view: dilemmaView }) })]),
      withTasks([riddle()]),
      withTasks([hangman()]),
      withTasks([dilemma()]),
    ];
    for (const state of screens) {
      const id = state.team.tasks[0]!.id;
      const { container, unmount } = renderGame(<TaskScreen taskId={id} />, { state });
      for (const pattern of FORBIDDEN) expect(container.textContent).not.toMatch(pattern);
      unmount();
    }
  });
});

// ---------- Batch 3 ----------

const puzzleView = {
  content: { title: 'Office by the river', imageUrl: '/sample/p.svg', width: 800, height: 600 },
  rows: 3,
  cols: 3,
  order: [1, 0, 2, 3, 4, 5, 6, 7, 8],
  inPlace: null as number[] | null,
};

const spotView = {
  content: { leftImageUrl: '/l.svg', rightImageUrl: '/r.svg', width: 800, height: 600 },
  found: [{ x: 430, y: 105, r: 45 }],
  total: 7,
  hint: null as null | { x: number; y: number; r: number },
};

const dataView = {
  content: {
    title: 'Sales and delivery',
    charts: [
      {
        id: 'sales',
        title: 'Sales by region (₹ lakh)',
        type: 'bar',
        data: [
          { label: 'North', value: 42 },
          { label: 'South', value: 58 },
        ],
      },
      {
        id: 'orders',
        title: 'Orders delivered per month',
        type: 'line',
        data: [
          { label: 'Apr', value: 1200 },
          { label: 'Sep', value: 1720 },
        ],
      },
      {
        id: 'complaints',
        title: 'Customer complaints',
        type: 'bar',
        data: [
          { label: 'Late delivery', value: 36 },
          { label: 'Damaged item', value: 14 },
        ],
      },
    ],
    questions: ['Which region sold most?', 'Which month was best?', 'How many more?'],
  },
  answers: [null, null, null] as (string | null)[],
  hint: null as null | { index: number; text: string },
};

const puzzle = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 'p', key: 'picture_puzzle', name: 'Picture Puzzle', type: 'UNIQUE', ...o });
const spot = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 's', key: 'spot_difference', name: 'Spot the Difference', type: 'UNIQUE', ...o });
const data = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 'ds', key: 'data_story', name: 'Data Story', type: 'UNIQUE', ...o });

describe('Picture Puzzle', () => {
  const playing = (view = puzzleView) =>
    withTasks([puzzle({ status: 'IN_PROGRESS', running: running({ view }) })]);

  it('swaps two tiles by clicking one, then the other', async () => {
    const { send } = renderGame(<TaskScreen taskId="p" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'correct' } } as Ack,
    });
    expect(screen.getAllByRole('button', { name: /^Spot \d+/ })).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Spot 1' }));
    expect(screen.getByRole('button', { name: 'Spot 1, picked' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Now click the tile to swap with.')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Spot 2' })));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'p',
      submission: { swap: [0, 1] },
    });
  });

  it('clicking the picked tile again cancels', () => {
    const { send } = renderGame(<TaskScreen taskId="p" />, { state: playing() });
    fireEvent.click(screen.getByRole('button', { name: 'Spot 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spot 3, picked' }));
    expect(send).not.toHaveBeenCalledWith('task:submit', expect.anything());
    expect(screen.getByText('Click a tile, then another tile, to swap them.')).toBeInTheDocument();
  });

  it('swaps by drag and drop too', async () => {
    const { send } = renderGame(<TaskScreen taskId="p" />, { state: playing() });
    fireEvent.dragStart(screen.getByRole('button', { name: 'Spot 3' }));
    await act(async () => fireEvent.drop(screen.getByRole('button', { name: 'Spot 5' })));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'p',
      submission: { swap: [2, 4] },
    });
  });

  it('shows the finished picture, and no marks before the hint', () => {
    renderGame(<TaskScreen taskId="p" />, { state: playing() });
    expect(screen.getByAltText('Finished picture: Office by the river')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /in place/ })).toHaveLength(0);
  });

  it('after the hint, ticks only the tiles in their right place, with no numbers', () => {
    const hinted = (inPlace: number[]) =>
      withTasks([
        puzzle({
          status: 'IN_PROGRESS',
          running: running({ hintsUsed: 1, view: { ...puzzleView, inPlace } }),
        }),
      ]);
    // Spots 1 and 2 hold each other's tiles; the other 7 are in place.
    const { unmount } = renderGame(<TaskScreen taskId="p" />, {
      state: hinted([2, 3, 4, 5, 6, 7, 8]),
    });
    expect(screen.getAllByRole('button', { name: /, in place/ })).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Spot 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spot 3, in place' })).toBeInTheDocument();
    // No tile shows a number.
    for (const tile of screen.getAllByRole('button', { name: /^Spot \d/ })) {
      expect(tile.textContent).toBe('');
    }
    expect(screen.getByText('Hint used.')).toBeInTheDocument();
    // The server sends new marks after every swap; the screen shows whatever it sends.
    unmount();
    renderGame(<TaskScreen taskId="p" />, { state: hinted([0, 1, 2, 3, 4, 5, 6, 7, 8]) });
    expect(screen.getAllByRole('button', { name: /, in place/ })).toHaveLength(9);
  });

  it('has a compact hint that asks first', async () => {
    const { send } = renderGame(<TaskScreen taskId="p" />, { state: playing() });
    fireEvent.click(screen.getByRole('button', { name: 'Use hint (1,500)' }));
    expect(screen.getByText('Pay 1,500 from Support Funds?')).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, use hint' })));
    expect(send).toHaveBeenCalledWith('task:hint', { taskId: 'p' });
  });
});

describe('Spot the Difference', () => {
  const playing = (view = spotView) =>
    withTasks([spot({ status: 'IN_PROGRESS', running: running({ view }) })]);

  it('turns a click into image pixels, whatever size the picture is shown at', () => {
    const rect = { left: 100, top: 50, width: 400, height: 300 };
    expect(toImagePoint({ clientX: 300, clientY: 200 }, rect, { width: 800, height: 600 })).toEqual(
      { x: 400, y: 300 },
    );
  });

  it('shows how many are found and sends a click in image pixels', async () => {
    const { send } = renderGame(<TaskScreen taskId="s" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'wrong' } } as Ack,
    });
    expect(screen.getByLabelText('1 of 7 found')).toHaveTextContent('1 of 7 found');
    const right = screen.getByRole('button', { name: 'Right picture' });
    right.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }) as DOMRect;
    await act(async () => fireEvent.click(right, { clientX: 100, clientY: 150 }));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 's',
      submission: { x: 200, y: 300 },
    });
    // A miss is only a mark: no penalty text.
    expect(screen.getByRole('status')).toHaveTextContent('No difference there.');
    expect(screen.queryByText(/Task Funds/)).toBeNull();
  });
});

describe('Data Story', () => {
  const playing = (view = dataView) =>
    withTasks([data({ status: 'IN_PROGRESS', running: running({ view }) })]);

  it('prints every value on the charts and sends one answer at a time', async () => {
    const { send } = renderGame(<TaskScreen taskId="ds" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'wrong' } } as Ack,
    });
    for (const text of ['42', '58', '1,200', '1,720', '36', '14', 'Late delivery', 'South']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    fireEvent.change(screen.getByLabelText('Answer to question 2'), {
      target: { value: 'Sep' },
    });
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Check' })[1]!));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'ds',
      submission: { index: 1, answer: 'Sep' },
    });
    expect(await screen.findByText('Not right. Try again.')).toBeInTheDocument();
  });

  it('the hint outlines the chart to look at', () => {
    renderGame(<TaskScreen taskId="ds" />, {
      state: playing({ ...dataView, hint: { index: 1, text: 'orders' } }),
    });
    expect(screen.getByText(/Hint for question 2: the outlined chart\./)).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Orders delivered per month' })).toHaveClass(
      'border-info',
    );
    expect(screen.getByRole('figure', { name: 'Sales by region (₹ lakh)' })).not.toHaveClass(
      'border-info',
    );
  });
});

describe('Batch 3 text', () => {
  it('never tells teams to cooperate', () => {
    const screens = [
      withTasks([puzzle({ status: 'IN_PROGRESS', running: running({ view: puzzleView }) })]),
      withTasks([spot({ status: 'IN_PROGRESS', running: running({ view: spotView }) })]),
      withTasks([data({ status: 'IN_PROGRESS', running: running({ view: dataView }) })]),
      withTasks([puzzle()]),
      withTasks([spot()]),
      withTasks([data()]),
    ];
    for (const state of screens) {
      const id = state.team.tasks[0]!.id;
      const { container, unmount } = renderGame(<TaskScreen taskId={id} />, { state });
      for (const pattern of FORBIDDEN) expect(container.textContent).not.toMatch(pattern);
      unmount();
    }
  });
});

// ---------- Batch 4 ----------

const alienView = {
  content: {
    // HELLO WORLD with g-glyphs; "✦" is not a glyph id, so it shows as text.
    message: ['g01', 'g02', 'g03', 'g03', 'g04', ' ', 'g05', 'g04', 'g06', 'g03', '✦'],
    legend: [
      { symbol: 'g01', letter: 'H' },
      { symbol: 'g03', letter: 'L' },
    ],
  },
  hintLegend: [] as { symbol: string; letter: string }[],
};
const alien = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 'al', key: 'alien_translator', name: 'Alien Translator', type: 'UNIQUE', ...o });

describe('Alien Translator', () => {
  const playing = (view = alienView) =>
    withTasks([alien({ status: 'IN_PROGRESS', running: running({ view }) })]);
  const letter = (n: number) => screen.getByLabelText(`Letter ${n}`, { exact: true });

  it('draws glyphs, fills every legend letter, and shows other symbols as text', () => {
    const { container } = renderGame(<TaskScreen taskId="al" />, { state: playing() });
    expect(container.querySelectorAll('[aria-label="Alien message"] svg[data-glyph]')).toHaveLength(
      9,
    );
    expect(screen.getByText('✦')).toBeInTheDocument();
    expect(letter(1)).toHaveValue('H');
    expect(letter(3)).toHaveValue('L');
    expect(letter(4)).toHaveValue('L');
    expect(letter(9)).toHaveValue('L');
    expect(letter(1)).toHaveAttribute('readonly');
    expect(letter(2)).toHaveValue('');
    expect(letter(2)).not.toHaveAttribute('readonly');
  });

  it('typing under one symbol fills every copy; Submit sends the sentence', async () => {
    const { send } = renderGame(<TaskScreen taskId="al" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'wrong' } } as Ack,
    });
    const submit = screen.getByRole('button', { name: /^Submit$/ });
    expect(submit).toBeDisabled();
    fireEvent.change(letter(5), { target: { value: 'o' } });
    expect(letter(7)).toHaveValue('O');
    for (const [n, v] of [
      [2, 'E'],
      [6, 'W'],
      [8, 'R'],
      [10, 'D'],
    ] as const) {
      fireEvent.change(letter(n), { target: { value: v } });
    }
    await act(async () => fireEvent.click(submit));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'al',
      submission: { answer: 'HELLO WORLD' },
    });
    expect(await screen.findByText('Not right. Try again.')).toBeInTheDocument();
  });

  it('marks the pairs the hint decoded', () => {
    renderGame(<TaskScreen taskId="al" />, {
      state: playing({ ...alienView, hintLegend: [{ symbol: 'g05', letter: 'W' }] }),
    });
    expect(letter(6)).toHaveValue('W');
    expect(screen.getAllByLabelText('From the hint')).toHaveLength(1);
  });
});

const celebrityView = {
  taskName: 'Guess the Leader',
  imageUrl: '/sample/faces/abc123.svg',
  position: 3,
  total: 8,
  named: ['Sample one', 'sample two'],
  canPass: true,
  hint: null as string | null,
};
const celebrity = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 'gc', key: 'guess_celebrity', name: 'Guess the Leader', type: 'UNIQUE', ...o });

describe('Guess the Celebrity', () => {
  const playing = (view = celebrityView) =>
    withTasks([celebrity({ status: 'IN_PROGRESS', running: running({ view }) })]);

  it('shows the task name from the content, one photo, "Face 3 of 8" and the named chips', () => {
    renderGame(<TaskScreen taskId="gc" />, { state: playing() });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Guess the Leader');
    expect(screen.getByRole('img', { name: 'Face 3 of 8' })).toHaveAttribute(
      'src',
      '/sample/faces/abc123.svg',
    );
    expect(screen.getByText(/^Face/)).toHaveTextContent('Face 3 of 8');
    const chips = within(screen.getByLabelText('Named')).getAllByRole('listitem');
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['Sample one', 'sample two']);
  });

  it('sends a guess, and says when it is not right', async () => {
    const { send } = renderGame(<TaskScreen taskId="gc" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'wrong' } } as Ack,
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'MS Dhoni' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Guess' })));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'gc',
      submission: { answer: 'MS Dhoni' },
    });
    expect(await screen.findByText('Not right. Try again.')).toBeInTheDocument();
  });

  it('Pass sends a pass and says the photo comes back; it is off on the last photo', async () => {
    const { send, unmount } = renderGame(<TaskScreen taskId="gc" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'correct' } } as Ack,
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pass' })));
    expect(send).toHaveBeenCalledWith('task:submit', { taskId: 'gc', submission: { pass: true } });
    expect(await screen.findByText('Passed. It comes back later.')).toBeInTheDocument();
    unmount();
    renderGame(<TaskScreen taskId="gc" />, {
      state: playing({ ...celebrityView, canPass: false }),
    });
    expect(screen.getByRole('button', { name: 'Pass' })).toBeDisabled();
  });

  it('shows the hint for the photo on screen', () => {
    renderGame(<TaskScreen taskId="gc" />, {
      state: playing({ ...celebrityView, hint: 'S___ K___' }),
    });
    expect(screen.getByText('S___ K___')).toBeInTheDocument();
  });
});

const pictionaryView = {
  drawing: {
    strokes: [
      [
        [0, 0],
        [30, 0],
      ],
      [
        [0, 10],
        [90, 10],
      ],
    ] as [number, number][][],
  },
  current: 1,
  total: 5,
  guesses: ['A key'],
  hint: null as null | { index: number; letter: string },
};
const pictionary = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 'pi', key: 'pictionary', name: 'Pictionary', type: 'UNIQUE', ...o });

describe('Pictionary', () => {
  const playing = (view = pictionaryView) =>
    withTasks([pictionary({ status: 'IN_PROGRESS', running: running({ view }) })]);

  it('draws the strokes one after another, at an even speed', () => {
    const timings = strokeTimings(pictionaryView.drawing.strokes);
    expect(timings[0]).toEqual({ delay: 0, duration: DRAW_SECONDS / 4 });
    expect(timings[1]).toEqual({ delay: DRAW_SECONDS / 4, duration: (DRAW_SECONDS * 3) / 4 });
    const { container } = renderGame(<TaskScreen taskId="pi" />, { state: playing() });
    const lines = container.querySelectorAll('polyline.draw-stroke');
    expect(lines).toHaveLength(2);
    expect((lines[1] as SVGElement).style.animationDelay).toBe(`${DRAW_SECONDS / 4}s`);
  });

  it('shows "Word 2 of 5" and the words guessed so far, and sends a guess', async () => {
    const { send } = renderGame(<TaskScreen taskId="pi" />, {
      state: playing(),
      ack: { ok: true, value: { status: 'wrong' } } as Ack,
    });
    expect(screen.getByText(/^Word/)).toHaveTextContent('Word 2 of 5');
    expect(within(screen.getByLabelText('Guessed')).getByText('A key')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your guess'), { target: { value: 'mug' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Guess' })));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'pi',
      submission: { answer: 'mug' },
    });
    expect(await screen.findByText('Not right. Try again.')).toBeInTheDocument();
  });

  it('Draw again redraws the picture from the start', () => {
    const { container } = renderGame(<TaskScreen taskId="pi" />, { state: playing() });
    const before = container.querySelector('polyline');
    fireEvent.click(screen.getByRole('button', { name: 'Draw again' }));
    expect(container.querySelector('polyline')).not.toBe(before);
  });

  it('shows the first letter after the hint, and never shows the word length', () => {
    renderGame(<TaskScreen taskId="pi" />, {
      state: playing({ ...pictionaryView, hint: { index: 1, letter: 'C' } }),
    });
    expect(screen.getByText(/First letter:/)).toHaveTextContent('First letter: C');
    expect(screen.queryByText(/_/)).toBeNull();
  });
});

const escapeView = {
  intro: 'You are locked in the lab. Clear all 4 stages to escape.',
  stages: [
    { title: 'Find the key', prompt: 'Which drawer has the key?' },
    {
      title: 'Mirror puzzle',
      prompt: 'Read it in a mirror. What colour is the folder?',
      mirrorText: 'THE CARD IS IN THE BLUE FOLDER',
    },
  ],
  total: 4,
  stage: 1,
  hint: null as null | { stage: number; text: string },
};
const escape = (o: Partial<PlayerTaskView> = {}) =>
  task({ id: 'er', key: 'escape_room', name: 'Escape Room', type: 'UNIQUE', ...o });

describe('Escape Room', () => {
  const playing = (view = escapeView, r: Partial<NonNullable<PlayerTaskView['running']>> = {}) =>
    withTasks([escape({ status: 'IN_PROGRESS', running: running({ view, ...r }) })]);

  it('shows the stages reached so far, and later stages only as closed', () => {
    renderGame(<TaskScreen taskId="er" />, { state: playing() });
    const stages = within(screen.getByLabelText('Stages')).getAllByRole('listitem');
    expect(stages.map((s) => s.textContent)).toEqual([
      'Find the key',
      'Mirror puzzle',
      'Stage 3',
      'Stage 4',
    ]);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Stage 2 of 4: Mirror puzzle',
    );
  });

  it('draws the mirror text on a canvas, never as text on the page', () => {
    const { container } = renderGame(<TaskScreen taskId="er" />, { state: playing() });
    expect(screen.getByRole('img', { name: 'Mirror text' }).tagName).toBe('CANVAS');
    expect(container.textContent).not.toContain('BLUE FOLDER');
  });

  it('sends the answer for the current stage and shows tries left', async () => {
    const { send } = renderGame(<TaskScreen taskId="er" />, {
      state: playing(escapeView, { wrongCount: 1 }),
      ack: { ok: true, value: { status: 'wrong' } } as Ack,
    });
    expect(screen.getByText(/tries left before a/)).toHaveTextContent(
      '2 of 3 tries left before a 60-second lock.',
    );
    fireEvent.change(screen.getByLabelText('Answer'), { target: { value: 'red' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Check' })));
    expect(send).toHaveBeenCalledWith('task:submit', {
      taskId: 'er',
      submission: { answer: 'red' },
    });
    expect(await screen.findByText('Not right. Try again.')).toBeInTheDocument();
  });

  it('locks the answer box during a lockout', () => {
    renderGame(<TaskScreen taskId="er" />, { state: playing(escapeView, { lockMsLeft: 60_000 }) });
    expect(screen.getByRole('alert')).toHaveTextContent('Locked after too many wrong tries');
    expect(screen.getByLabelText('Answer')).toBeDisabled();
  });

  it('Chat opens the shared chat', () => {
    const { go } = renderGame(<TaskScreen taskId="er" />, { state: playing() });
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(go).toHaveBeenCalledWith({ tab: 'chat' });
  });

  it('shows the hint for the current stage only', () => {
    renderGame(<TaskScreen taskId="er" />, {
      state: playing({
        ...escapeView,
        hint: { stage: 1, text: 'Read each line from right to left.' },
      }),
    });
    expect(screen.getByText(/Hint: Read each line/)).toBeInTheDocument();
  });
});

describe('Batch 4 text', () => {
  it('never tells teams to cooperate', () => {
    const screens = [
      withTasks([alien({ status: 'IN_PROGRESS', running: running({ view: alienView }) })]),
      withTasks([celebrity({ status: 'IN_PROGRESS', running: running({ view: celebrityView }) })]),
      withTasks([
        pictionary({ status: 'IN_PROGRESS', running: running({ view: pictionaryView }) }),
      ]),
      withTasks([escape({ status: 'IN_PROGRESS', running: running({ view: escapeView }) })]),
      withTasks([alien()]),
      withTasks([celebrity()]),
      withTasks([pictionary()]),
      withTasks([escape()]),
    ];
    for (const state of screens) {
      const id = state.team.tasks[0]!.id;
      const { container, unmount } = renderGame(<TaskScreen taskId={id} />, { state });
      for (const pattern of FORBIDDEN) expect(container.textContent).not.toMatch(pattern);
      unmount();
    }
  });
});
