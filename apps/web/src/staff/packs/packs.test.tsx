import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  PackOptionsSchema,
  packReadiness,
  type AdminGame,
  type GameContentInfo,
  type PackDetail,
  type PackItemData,
  type PackSummary,
  type StaffGameSummary,
  type StaffLoginResponse,
} from '@magic-potion/shared';
import { ContentTab } from '../pages/ContentTab';
import { GamesPage } from '../pages/GamesPage';
import { StaffProvider, type StaffApi, type StaffContextValue } from '../StaffContext';
import { ImportDialog } from './ImportDialog';
import { DrawingPad, SpotForm } from './pictureForms';
import { PreviewModal } from './PreviewModal';
import { TaskEditor } from './TaskEditor';

const LOGIN: StaffLoginResponse = {
  token: 't',
  staff: { id: 'a', name: 'Sunny', role: 'MAIN_ADMIN' },
};

function fakeApi(overrides: Partial<StaffApi> = {}): StaffApi {
  const never = vi.fn(() => new Promise<never>(() => {}));
  return {
    get: never,
    post: never,
    put: never,
    patch: never,
    del: never,
    upload: never,
    download: vi.fn(async () => undefined),
    ...overrides,
  };
}

function withStaff(ui: ReactNode, value: Partial<StaffContextValue> = {}) {
  const ctx: StaffContextValue = {
    login: LOGIN,
    api: fakeApi(),
    go: vi.fn(),
    freshLogins: null,
    setFreshLogins: vi.fn(),
    ...value,
  };
  return render(<StaffProvider value={ctx}>{ui}</StaffProvider>);
}

// jsdom has no layout: every box is 600 x 400 at the top left.
function withLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 600,
    height: 400,
    right: 600,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

afterEach(() => vi.restoreAllMocks());

function pack(items: PackDetail['items'], extra: Partial<PackDetail> = {}): PackDetail {
  return {
    id: 'p1',
    name: 'Acme',
    description: '',
    builtIn: false,
    options: PackOptionsSchema.parse({}),
    items,
    readiness: packReadiness(items, DEFAULT_SETTINGS.tasks),
    games: [],
    ...extra,
  };
}

describe('marking Spot the Difference areas', () => {
  const pictures = {
    leftImageUrl: 'https://blob/l.webp',
    rightImageUrl: 'https://blob/r.webp',
    width: 1200,
    height: 800,
    rightWidth: 1200,
    rightHeight: 800,
  };

  function Harness({ start = [] as { x: number; y: number; r: number }[] }) {
    const [value, setValue] = useState<PackItemData>({
      publicData: pictures,
      secretData: { areas: start },
    });
    return (
      <>
        <SpotForm value={value} onChange={setValue} errors={[]} />
        <pre data-testid="areas">
          {JSON.stringify((value.secretData as { areas: unknown[] }).areas)}
        </pre>
      </>
    );
  }

  it('turns a click into image pixels and counts what is left', () => {
    withLayout();
    withStaff(<Harness />);
    expect(screen.getByRole('status')).toHaveTextContent('Mark 7 differences: 0 marked, 7 to go.');
    // 300,100 on a 600x400 box is 600,200 on the 1200x800 picture.
    fireEvent.pointerDown(screen.getByTestId('mark-original'), { clientX: 300, clientY: 100 });
    expect(JSON.parse(screen.getByTestId('areas').textContent!)).toEqual([
      { x: 600, y: 200, r: 48 },
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('1 marked, 6 to go.');
    // A mark on the changed picture lands in the same place.
    fireEvent.pointerDown(screen.getByTestId('mark-changed'), { clientX: 60, clientY: 40 });
    expect(JSON.parse(screen.getByTestId('areas').textContent!)[1]).toEqual({
      x: 120,
      y: 80,
      r: 48,
    });
  });

  it('refuses an 8th mark with a message', () => {
    withLayout();
    const seven = Array.from({ length: 7 }, (_, i) => ({ x: 100 + i * 140, y: 100, r: 30 }));
    withStaff(<Harness start={seven} />);
    expect(screen.getByRole('status')).toHaveTextContent('All 7 differences are marked.');
    fireEvent.pointerDown(screen.getByTestId('mark-original'), { clientX: 10, clientY: 10 });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'All 7 differences are marked. Remove one to mark another.',
    );
    expect(JSON.parse(screen.getByTestId('areas').textContent!)).toHaveLength(7);
  });

  it('says so when the two pictures differ in size', () => {
    withStaff(
      <SpotForm
        value={{ publicData: { ...pictures, rightHeight: 790 }, secretData: { areas: [] } }}
        onChange={vi.fn()}
        errors={[]}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The two pictures must be the same size (1200 × 800 and 1200 × 790).',
    );
  });
});

describe('Pictionary drawing pad', () => {
  it('records a stroke on the 0 to 100 grid', () => {
    withLayout();
    const onChange = vi.fn();
    render(<DrawingPad strokes={[]} onChange={onChange} />);
    const pad = screen.getByTestId('drawing-pad');
    fireEvent.pointerDown(pad, { clientX: 20, clientY: 20 });
    fireEvent.pointerMove(pad, { clientX: 100, clientY: 20 });
    fireEvent.pointerMove(pad, { clientX: 180, clientY: 180 });
    fireEvent.pointerUp(pad);
    expect(onChange).toHaveBeenCalledWith([
      [
        [10, 10],
        [50, 10],
        [90, 90],
      ],
    ]);
  });
});

describe('pack entries', () => {
  it('marks empty fields in red and saves nothing', async () => {
    const post = vi.fn();
    withStaff(<TaskEditor pack={pack([])} task="riddle" onPack={vi.fn()} />, {
      api: fakeApi({ post }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Add riddle/ }));
    fireEvent.change(screen.getByLabelText('Clue (the hint)'), { target: { value: 'A clue' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('Write the riddle.')).toBeInTheDocument();
    expect(screen.getByText('Add at least one accepted answer.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('saves a riddle with one answer per line', async () => {
    const post = vi.fn(async () => pack([]));
    withStaff(<TaskEditor pack={pack([])} task="riddle" onPack={vi.fn()} />, {
      api: fakeApi({ post: post as StaffApi['post'] }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Add riddle/ }));
    fireEvent.change(screen.getByLabelText('Riddle'), { target: { value: 'What has keys?' } });
    fireEvent.change(screen.getByLabelText('Accepted answers'), {
      target: { value: 'keyboard\n\n piano \n' },
    });
    fireEvent.change(screen.getByLabelText('Clue (the hint)'), {
      target: { value: 'You type on it.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/packs/p1/items', {
        taskKey: 'riddle',
        publicData: { riddle: 'What has keys?' },
        secretData: { answers: ['keyboard', 'piano'], clue: 'You type on it.' },
      }),
    );
  });

  it('shows the Sample pack read-only', () => {
    const riddle = {
      id: 'r1',
      taskKey: 'riddle' as const,
      position: 0,
      publicData: { riddle: 'Q?' },
      secretData: { answers: ['a'], clue: 'c' },
    };
    withStaff(
      <TaskEditor pack={pack([riddle], { builtIn: true })} task="riddle" onPack={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /Add riddle/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Riddle')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Preview as player/ })).toBeEnabled();
  });
});

describe('spreadsheet import', () => {
  it('shows every row and blocks saving while a row has a problem', async () => {
    const upload = vi.fn(async () => ({
      headers: ['Riddle', 'Accepted answers', 'Clue (the hint)'],
      rows: [
        { row: 2, cells: ['Q1?', 'a', 'c'], errors: [] },
        {
          row: 3,
          cells: ['Q2?', '', 'c'],
          errors: ['Accepted answers: Add at least one accepted answer.'],
        },
      ],
      items: [{ publicData: { riddle: 'Q1?' }, secretData: { answers: ['a'], clue: 'c' } }],
    }));
    withStaff(<ImportDialog pack={pack([])} task="riddle" onDone={vi.fn()} />, {
      api: fakeApi({ upload: upload as StaffApi['upload'] }),
    });
    const file = new File(['x'], 'riddles.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('Spreadsheet file'), { target: { files: [file] } });
    expect(
      await screen.findByText('1 row needs fixing. Fix it in the file and upload it again.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Accepted answers: Add at least one accepted answer.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add 1 riddle' })).toBeDisabled();
    expect(upload).toHaveBeenCalledWith('/packs/p1/import?task=riddle', file);
  });
});

describe('a game’s content', () => {
  it('saves the chosen pack and dilemma scenario', async () => {
    const info: GameContentInfo = {
      packId: 'p1',
      packName: 'Acme',
      dilemmaItemId: null,
      dilemmas: [
        { id: 'd1', scenario: 'First scenario' },
        { id: 'd2', scenario: 'Second scenario' },
      ],
      readiness: null,
      locked: false,
    };
    const packs: PackSummary[] = [
      {
        id: 'p1',
        name: 'Acme',
        description: '',
        builtIn: false,
        itemCount: 40,
        gameCount: 1,
        ready: true,
        updatedAt: '',
      },
    ];
    const get = vi.fn(async (path: string) => (path === '/packs' ? packs : info));
    const put = vi.fn(async () => ({ ...info, dilemmaItemId: 'd2' }));
    const game = { id: 'g1', locked: false } as AdminGame;
    withStaff(<ContentTab game={game} onChange={vi.fn()} />, {
      api: fakeApi({ get: get as StaffApi['get'], put: put as StaffApi['put'] }),
    });
    fireEvent.click(await screen.findByLabelText('Scenario 2'));
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save content' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/games/g1/content', { packId: 'p1', dilemmaItemId: 'd2' }),
    );
  });
});

describe('games list', () => {
  const games: StaffGameSummary[] = [
    { id: 'g1', name: 'Dry run', phase: 'LOBBY', started: false, finished: false, archived: false },
    {
      id: 'g2',
      name: 'March event',
      phase: 'REVEAL',
      started: true,
      finished: true,
      archived: false,
    },
    { id: 'g3', name: 'Old event', phase: 'REVEAL', started: true, finished: true, archived: true },
  ];

  it('offers Archive for finished games, Delete for unplayed ones, and hides archived games', async () => {
    withStaff(<GamesPage />, {
      api: fakeApi({ get: vi.fn(async () => games) as StaffApi['get'] }),
    });
    const dry = (await screen.findByText('Dry run')).closest('li')!;
    const march = screen.getByText('March event').closest('li')!;
    expect(within(dry).getByRole('button', { name: /Delete/ })).toBeInTheDocument();
    expect(within(dry).queryByRole('button', { name: /Archive/ })).not.toBeInTheDocument();
    expect(within(march).getByRole('button', { name: /Archive/ })).toBeInTheDocument();
    expect(within(march).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Old event')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show archived (1)'));
    expect(screen.getByText('Old event')).toBeInTheDocument();
  });

  it('deletes only after the game name is typed', async () => {
    const del = vi.fn(async () => null);
    withStaff(<GamesPage />, {
      api: fakeApi({
        get: vi.fn(async () => games) as StaffApi['get'],
        del: del as StaffApi['del'],
      }),
    });
    fireEvent.click(
      within((await screen.findByText('Dry run')).closest('li')!).getByRole('button', {
        name: /Delete/,
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete game' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete game' });
    fireEvent.change(within(dialog).getByLabelText('Type the game name to confirm'), {
      target: { value: 'dry run' },
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Type the game name to confirm'), {
      target: { value: 'Dry run' },
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(del).toHaveBeenCalledWith('/games/g1', { confirmName: 'Dry run' }));
  });
});

describe('Preview as player', () => {
  it('shows the real task screen and sends actions to the preview', async () => {
    const task = {
      id: 'prev-1',
      key: 'hangman' as const,
      name: 'Hangman',
      type: 'UNIQUE' as const,
      status: 'NOT_STARTED' as const,
      attempts: 0,
      timerSeconds: 480,
      points: 10_000,
      running: null,
      lastResult: null,
      savedAnswer: null,
    };
    const running = {
      ...task,
      status: 'IN_PROGRESS' as const,
      attempts: 1,
      running: {
        number: 1,
        msLeft: 480_000,
        lockMsLeft: 0,
        hintsUsed: 0,
        wrongCount: 0,
        nextLockSeconds: 60,
        view: {
          content: { category: 'Film' },
          masked: '____',
          guessed: [],
          wrong: 0,
          maxWrong: 6,
          hinted: null,
        },
      },
    };
    const post = vi.fn(async (path: string) =>
      path === '/preview'
        ? { id: 'prev-1', task, note: null }
        : {
            ack: { ok: true, value: { status: 'started' } },
            preview: { id: 'prev-1', task: running, note: null },
          },
    );
    const items = [{ publicData: { category: 'Film' }, secretData: { phrase: 'Jaws' } }];
    withStaff(<PreviewModal taskKey="hangman" items={items} onClose={vi.fn()} />, {
      api: fakeApi({ post: post as StaffApi['post'] }),
    });
    expect(await screen.findByText(/Preview as player. Nothing is saved/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Start Task' }));
    });
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/preview/prev-1/start', { submission: undefined }),
    );
    expect(await screen.findByText('Category: Film')).toBeInTheDocument();
  });
});
