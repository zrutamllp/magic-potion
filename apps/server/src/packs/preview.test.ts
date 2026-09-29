import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type PackItemData } from '@magic-potion/shared';
import { samplePackItems } from '../../prisma/samplePack';
import { seededRng } from '../engine/rng';
import { PreviewService } from './preview';

const riddles: PackItemData[] = Array.from({ length: 6 }, (_, i) => ({
  publicData: { riddle: `Riddle ${i}?` },
  secretData: { answers: [`answer ${i}`], clue: `Clue ${i}` },
}));

function service() {
  let now = Date.UTC(2026, 8, 29, 9);
  let seed = 1;
  const preview = new PreviewService(
    () => now,
    () => seededRng(seed++),
  );
  return { preview, tick: (ms: number) => (now += ms) };
}

type RiddleView = { content: { riddles: string[] } };

describe('Preview as player', () => {
  it('plays a pool task like a team, without ever sending the answers', () => {
    const { preview } = service();
    const created = preview.create('riddle', riddles);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;
    expect(created.value.task).toMatchObject({
      status: 'NOT_STARTED',
      name: 'Riddle',
      running: null,
    });

    expect(preview.start(id)).toEqual({ ok: true, value: { status: 'started' } });
    const running = preview.get(id)!.task.running!;
    const shown = (running.view as RiddleView).content.riddles;
    expect(shown).toHaveLength(DEFAULT_SETTINGS.tasks.poolPerTry.riddle);
    expect(JSON.stringify(preview.get(id))).not.toMatch(/answer \d|Clue \d/);

    const n = (s: string) => s.match(/\d+/)![0];
    expect(preview.submit(id, { index: 0, answer: 'nope' })).toEqual({
      ok: true,
      value: { status: 'wrong' },
    });
    expect(preview.hint(id)).toMatchObject({ ok: true });
    expect(preview.hint(id)).toEqual({ ok: false, message: 'The hint for this try is used.' });
    const statuses = shown.map((r, index) =>
      preview.submit(id, { index, answer: `answer ${n(r)}` }),
    );
    expect(statuses.map((s) => s.ok && s.value.status)).toEqual(['correct', 'correct', 'solved']);
    expect(preview.get(id)!.task).toMatchObject({ status: 'DONE', lastResult: 'SOLVED' });
  });

  it('gives a fresh set after a fail, and fails when the timer runs out', () => {
    const { preview, tick } = service();
    const created = preview.create('riddle', riddles);
    if (!created.ok) throw new Error(created.message);
    const id = created.value.id;
    preview.start(id);
    const first = (preview.get(id)!.task.running!.view as RiddleView).content.riddles;
    preview.giveUp(id);
    expect(preview.get(id)!.task).toMatchObject({ status: 'FAILED', lastResult: 'GAVE_UP' });
    preview.start(id);
    const second = (preview.get(id)!.task.running!.view as RiddleView).content.riddles;
    expect(second.some((r) => first.includes(r))).toBe(false);

    tick(DEFAULT_SETTINGS.tasks.timerSeconds.riddle * 1000);
    expect(preview.get(id)!.task).toMatchObject({ status: 'FAILED', lastResult: 'FAILED_TIMEOUT' });
  });

  it('gives The Vault a made-up fragment and tells the admin what it is', () => {
    const { preview } = service();
    const vault = samplePackItems().find((i) => i.taskKey === 'vault')!;
    const created = preview.create('vault', [vault]);
    if (!created.ok) throw new Error(created.message);
    const note = created.value.note!;
    const digits = note
      .match(/(\d)-(\d)-(\d)/)!
      .slice(1)
      .join('');
    const clueDigits = (vault.secretData as { clueDigits: string[] }).clueDigits.join('');
    preview.start(created.value.id);
    expect(preview.submit(created.value.id, { code: clueDigits + digits })).toEqual({
      ok: true,
      value: { status: 'solved' },
    });
  });

  it('shows Find the Code with its own cipher', () => {
    const { preview } = service();
    const item = samplePackItems().find((i) => i.taskKey === 'find_code')!;
    const created = preview.create('find_code', [item]);
    if (!created.ok) throw new Error(created.message);
    preview.start(created.value.id);
    const view = preview.get(created.value.id)!.task.running!.view as { encodedMessage: string[] };
    expect(view.encodedMessage.length).toBeGreaterThanOrEqual(6);
    expect(created.value.note).toMatch(/= [A-Z]/);
  });

  it('refuses draft content with problems', () => {
    const { preview } = service();
    const r = preview.create('riddle', [
      { publicData: { riddle: '' }, secretData: { answers: ['a'], clue: 'c' } },
    ]);
    expect(r).toEqual({
      ok: false,
      message: 'Fix the fields marked in red first.',
      errors: [{ path: 'public.riddle', message: 'Write the riddle.' }],
    });
  });

  it('ends after 30 minutes without use', () => {
    const { preview, tick } = service();
    const created = preview.create('riddle', riddles);
    if (!created.ok) throw new Error(created.message);
    tick(31 * 60_000);
    expect(preview.get(created.value.id)).toBeNull();
    expect(preview.start(created.value.id)).toMatchObject({ ok: false });
  });
});
