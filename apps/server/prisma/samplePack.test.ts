import {
  DEFAULT_SETTINGS,
  checkPackItem,
  compileGameContent,
  packReadiness,
  parseTaskContent,
  type PackItem,
} from '@magic-potion/shared';
import { describe, expect, it } from 'vitest';
import { samplePackItems, samplePackOptions } from './samplePack';

const items: PackItem[] = samplePackItems().map((item, i) => ({
  ...item,
  id: `sample-${i}`,
  position: i,
}));

describe('the built-in Sample pack', () => {
  it('has no entry with a problem', () => {
    for (const item of items) {
      expect(checkPackItem(item.taskKey, item), `${item.taskKey} ${item.id}`).toEqual([]);
    }
  });

  it('is ready to play, with no warnings', () => {
    const r = packReadiness(items, DEFAULT_SETTINGS.tasks);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ready).toBe(true);
  });

  it('holds pools bigger than one try', () => {
    const count = (key: string) => items.filter((i) => i.taskKey === key).length;
    expect(count('riddle')).toBe(12);
    expect(count('hangman')).toBe(8);
    expect(count('ethical_dilemma')).toBe(5);
    expect(count('guess_celebrity')).toBe(8);
    const dashboards = items.filter((i) => i.taskKey === 'data_story');
    expect((dashboards[0]!.publicData as { questions: string[] }).questions).toHaveLength(10);
  });

  it('compiles into content every game accepts', () => {
    const rows = compileGameContent(items, samplePackOptions(), null);
    expect(new Set(rows.map((r) => r.key)).size).toBe(12);
    for (const row of rows) expect(() => parseTaskContent(row.key, row)).not.toThrow();
  });
});
