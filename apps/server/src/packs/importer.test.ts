import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { checkPackItem } from '@magic-potion/shared';
import { parseCsv, previewImport, readSheet, templateCsv, templateXlsx } from './importer';

const dashboard = {
  charts: [
    { id: 'sales', title: 'Sales by region' },
    { id: 'orders', title: 'Orders delivered per month' },
  ],
};

async function rowsOf(file: Buffer) {
  const r = await readSheet(file);
  if (!r.ok) throw new Error(r.message);
  return r.rows;
}

describe('CSV', () => {
  it('reads quotes, commas, line breaks and a byte order mark', () => {
    expect(parseCsv('a,"b, c","say ""hi""\nthere"\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'say "hi"\nthere'],
      ['1', '2', '3'],
    ]);
  });

  it('reads semicolon-separated files from European Excel', () => {
    expect(parseCsv('Riddle;Accepted answers;Clue\nWhat?;"a; b";c')).toEqual([
      ['Riddle', 'Accepted answers', 'Clue'],
      ['What?', 'a; b', 'c'],
    ]);
  });
});

describe('templates', () => {
  it('reads its own CSV template back as valid rows, skipping the notes', async () => {
    const rows = await rowsOf(Buffer.from('﻿' + templateCsv('riddle')));
    const r = previewImport('riddle', rows);
    expect(r.ok && r.value.rows.map((x) => x.errors)).toEqual([[], []]);
    expect(r.ok && r.value.items[0]).toEqual({
      publicData: { riddle: 'What has keys but opens no locks?' },
      secretData: { answers: ['keyboard', 'computer keyboard'], clue: 'You type on it.' },
    });
  });

  it('reads its own Excel template back for every task', async () => {
    for (const key of ['riddle', 'hangman', 'ethical_dilemma'] as const) {
      const rows = await rowsOf(await templateXlsx(key));
      const r = previewImport(key, rows);
      expect(r.ok, key).toBe(true);
      if (!r.ok) continue;
      expect(
        r.value.rows.every((x) => x.errors.length === 0),
        key,
      ).toBe(true);
      for (const item of r.value.items) expect(checkPackItem(key, item)).toEqual([]);
    }
    const dataRows = await rowsOf(await templateXlsx('data_story'));
    const d = previewImport('data_story', dataRows, dashboard);
    expect(d.ok && d.value.items[0]?.secretData).toEqual({
      answers: ['South', 'South region'],
      chart: 'sales',
    });
  });
});

describe('checking rows', () => {
  it('names the row and the column of every problem', () => {
    const r = previewImport('ethical_dilemma', [
      ['Scenario', 'Option 1', 'Option 2', 'Option 3', 'Option 4'],
      ['Good one', 'A', 'B', 'C', 'D'],
      [],
      ['', 'A', 'B', '', ''],
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rows).toEqual([
      { row: 2, cells: ['Good one', 'A', 'B', 'C', 'D'], errors: [] },
      {
        row: 4,
        cells: ['', 'A', 'B', '', ''],
        errors: ['Scenario: Write the scenario.', 'Option 1: A dilemma needs 4 options.'],
      },
    ]);
    expect(r.value.items).toHaveLength(1);
  });

  it('needs the header row', () => {
    const r = previewImport('riddle', [['What?', 'a', 'b']]);
    expect(r).toEqual({
      ok: false,
      message:
        'The first row must be the header: Riddle, Accepted answers, Clue (the hint). Download the template to start.',
    });
  });

  it('checks Data Story charts against the dashboard', () => {
    const r = previewImport(
      'data_story',
      [
        ['Question', 'Accepted answers', 'Chart to look at'],
        ['Best month?', 'Sep', 'Profit'],
      ],
      dashboard,
    );
    expect(r.ok && r.value.rows[0]?.errors).toEqual([
      'Chart to look at: Use one of the chart titles: Sales by region, Orders delivered per month.',
    ]);
  });

  it('refuses more than 500 rows', () => {
    const rows = [['Category', 'Phrase'], ...Array.from({ length: 501 }, () => ['A', 'Bee'])];
    expect(previewImport('hangman', rows)).toEqual({
      ok: false,
      message: 'There are 501 rows. The limit is 500 at a time.',
    });
  });
});

describe('reading uploads', () => {
  it('refuses a file that would unpack to a huge size', async () => {
    const zip = new JSZip();
    zip.file('xl/worksheets/sheet1.xml', '0'.repeat(25 * 1024 * 1024));
    const bomb = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const r = await readSheet(bomb);
    expect(r.ok).toBe(false);
  });

  it('refuses a broken workbook and an empty file with a plain message', async () => {
    expect(await readSheet(Buffer.from('PK\u0003\u0004nonsense'))).toMatchObject({ ok: false });
    expect(await readSheet(Buffer.alloc(0))).toEqual({ ok: false, message: 'The file is empty.' });
  });

  it('reads numbers and formulas as text', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Q');
    sheet.addRow(['Question', 'Accepted answers', 'Chart to look at']);
    sheet.addRow(['How many?', 1650, 'orders']);
    sheet.addRow(['Sum?', { formula: '1+1', result: 2 }, 'sales']);
    const rows = await rowsOf(Buffer.from(await book.xlsx.writeBuffer()));
    expect(rows.slice(1).map((r) => r[1])).toEqual(['1650', '2']);
  });
});
