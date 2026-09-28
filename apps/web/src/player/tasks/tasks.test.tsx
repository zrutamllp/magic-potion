import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Ack, PlayerState, PlayerTaskView } from '@magic-potion/shared';
import { playerState, renderGame, task } from '../test/fixtures';
import { FORBIDDEN } from '../test/forbidden';
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
