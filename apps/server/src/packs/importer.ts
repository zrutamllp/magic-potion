import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { checkPackItem, type ImportTaskKey, type PackItemData } from '@magic-potion/shared';

// Filling a pool from a spreadsheet (Phase 6B): download a template (Excel or CSV), fill one row
// per entry, upload it, see every row with its problems, then save. Nothing is saved here; the
// preview goes back to the admin, who confirms.

export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;
// An .xlsx file is a zip. Refuse one that would unpack to more than this (a "zip bomb").
const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;

// Several accepted answers go in one cell, separated by this.
export const ANSWER_SEPARATOR = ';';

interface Column {
  header: string;
  // Where this column's problems are reported, as an item error path prefix.
  paths: string[];
  width: number;
}

interface Template {
  sheetName: string;
  columns: Column[];
  examples: string[][];
  notes: string[];
  // One row of cells to an entry (Data Story: to one question).
  build: (cells: string[]) => PackItemData;
}

const splitAnswers = (cell: string) =>
  cell
    .split(ANSWER_SEPARATOR)
    .map((a) => a.trim())
    .filter(Boolean);

const ANSWERS_NOTE = `Put every accepted answer in one cell, separated by "${ANSWER_SEPARATOR}". Case, spaces and punctuation do not matter.`;

export const TEMPLATES: Record<ImportTaskKey, Template> = {
  riddle: {
    sheetName: 'Riddles',
    columns: [
      { header: 'Riddle', paths: ['public.riddle'], width: 60 },
      { header: 'Accepted answers', paths: ['secret.answers'], width: 35 },
      { header: 'Clue (the hint)', paths: ['secret.clue'], width: 40 },
    ],
    examples: [
      ['What has keys but opens no locks?', 'keyboard; computer keyboard', 'You type on it.'],
      ['What gets wetter the more it dries?', 'towel; a towel', 'You use it after a shower.'],
    ],
    notes: ['One riddle per row.', ANSWERS_NOTE],
    build: ([riddle = '', answers = '', clue = '']) => ({
      publicData: { riddle },
      secretData: { answers: splitAnswers(answers), clue },
    }),
  },
  hangman: {
    sheetName: 'Hangman',
    columns: [
      { header: 'Category', paths: ['public.category'], width: 30 },
      { header: 'Phrase', paths: ['secret.phrase'], width: 40 },
    ],
    examples: [
      ['Office problem', 'Printer out of paper'],
      ['In your inbox', 'Out of office reply'],
    ],
    notes: [
      'One phrase per row. Each try plays one phrase.',
      'Letters, spaces, hyphens and apostrophes only. Up to 28 letters, 12 per word.',
    ],
    build: ([category = '', phrase = '']) => ({
      publicData: { category },
      secretData: { phrase },
    }),
  },
  ethical_dilemma: {
    sheetName: 'Dilemmas',
    columns: [
      { header: 'Scenario', paths: ['public.scenario'], width: 70 },
      { header: 'Option 1', paths: ['public.options.0', 'public.options'], width: 35 },
      { header: 'Option 2', paths: ['public.options.1'], width: 35 },
      { header: 'Option 3', paths: ['public.options.2'], width: 35 },
      { header: 'Option 4', paths: ['public.options.3'], width: 35 },
    ],
    examples: [
      [
        'A supplier offers you concert tickets while you are choosing a supplier.',
        'Accept them.',
        'Decline politely.',
        'Accept and tell your manager.',
        'Ask your manager first.',
      ],
    ],
    notes: [
      'One scenario per row, with exactly 4 options.',
      'Each game plays one scenario, chosen on the game’s Content tab.',
    ],
    build: ([scenario = '', ...options]) => ({
      publicData: { scenario, options: options.slice(0, 4).filter((o) => o.trim() !== '') },
      secretData: {},
    }),
  },
  data_story: {
    sheetName: 'Questions',
    columns: [
      { header: 'Question', paths: ['public.questions'], width: 60 },
      { header: 'Accepted answers', paths: ['secret.answers'], width: 30 },
      { header: 'Chart to look at', paths: ['secret.hintChartIds'], width: 30 },
    ],
    examples: [
      ['Which region had the highest sales?', 'South; South region', 'Sales by region'],
      ['How many orders were delivered in June?', '1100; 1,100', 'Orders delivered per month'],
    ],
    notes: [
      'One question per row, about the dashboard you import into.',
      ANSWERS_NOTE,
      '"Chart to look at" is the title of one of the dashboard’s charts. It is the hint.',
    ],
    // Checked against the dashboard in dataStoryRows; here a question is kept as a small item.
    build: ([question = '', answers = '', chart = '']) => ({
      publicData: { question },
      secretData: { answers: splitAnswers(answers), chart },
    }),
  },
};

// ---------- Templates ----------

export async function templateXlsx(key: ImportTaskKey): Promise<Buffer> {
  const t = TEMPLATES[key];
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(t.sheetName);
  sheet.columns = t.columns.map((c) => ({ header: c.header, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of t.examples) sheet.addRow(row);
  sheet.getColumn(1).alignment = { wrapText: true, vertical: 'top' };
  const help = book.addWorksheet('How to fill');
  help.getColumn(1).width = 100;
  help.addRow(['How to fill this sheet']).font = { bold: true };
  for (const note of [
    ...t.notes,
    `Fill the "${t.sheetName}" sheet: row 1 is the header, then one row per entry.`,
    'Replace the example rows with your own. Then upload the file in the admin panel.',
  ]) {
    help.addRow([note]);
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

export function templateCsv(key: ImportTaskKey): string {
  const t = TEMPLATES[key];
  const rows = [t.columns.map((c) => c.header), ...t.examples];
  // Lines starting with # are notes and are skipped on upload.
  const notes = t.notes.map((n) => `# ${n}`);
  return [...rows.map(csvLine), ...notes.map((n) => csvLine([n]))].join('\r\n') + '\r\n';
}

function csvLine(cells: string[]): string {
  return cells.map((c) => (/[",;\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}

// ---------- Reading an upload ----------

export type ReadResult = { ok: true; rows: string[][] } | { ok: false; message: string };

export async function readSheet(file: Buffer): Promise<ReadResult> {
  if (file.length === 0) return { ok: false, message: 'The file is empty.' };
  if (file.length > MAX_IMPORT_BYTES)
    return { ok: false, message: 'The file is too big. The limit is 1 MB.' };
  const isZip = file[0] === 0x50 && file[1] === 0x4b;
  return isZip ? readXlsx(file) : readCsv(file);
}

async function readXlsx(file: Buffer): Promise<ReadResult> {
  const unreadable: ReadResult = {
    ok: false,
    message:
      'This file could not be read. Save it as an Excel workbook (.xlsx) or CSV and try again.',
  };
  try {
    const zip = await JSZip.loadAsync(file);
    let total = 0;
    for (const entry of Object.values(zip.files)) {
      total +=
        (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ??
        0;
    }
    if (total > MAX_UNZIPPED_BYTES) return unreadable;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file as unknown as ArrayBuffer);
    const sheet = book.worksheets[0];
    if (!sheet) return unreadable;
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellText(cell.value);
      });
      rows.push(Array.from(cells, (c) => c ?? ''));
    });
    return { ok: true, rows };
  } catch {
    return unreadable;
  }
}

// Excel cells can hold numbers, dates, rich text and formulas; turn each into plain text.
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('result' in value) return value.result === undefined ? '' : String(value.result);
    if ('text' in value) return String(value.text);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return '';
  }
  return String(value);
}

function readCsv(file: Buffer): ReadResult {
  let text = file.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\u0000')) {
    return {
      ok: false,
      message: 'This file could not be read. Save it as CSV (UTF-8) or Excel and try again.',
    };
  }
  return { ok: true, rows: parseCsv(text) };
}

// RFC 4180 CSV: quoted cells may hold commas, quotes ("") and line breaks. The separator is the
// one used in the header line: a comma, a semicolon (some European Excel versions) or a tab.
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const outside = firstLine.replace(/"[^"]*"/g, '');
  const counts = [',', ';', '\t'].map((d) => [d, outside.split(d).length - 1] as const);
  const sep = counts.sort((a, b) => b[1] - a[1])[0]![1] > 0 ? counts[0]![0] : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------- Rows to entries ----------

export interface ImportRow {
  // The row number as the spreadsheet shows it (the header is row 1).
  row: number;
  cells: string[];
  errors: string[];
}

export interface ImportPreview {
  headers: string[];
  rows: ImportRow[];
  // The entries of the rows without problems, in order.
  items: PackItemData[];
}

export type PreviewResult = { ok: true; value: ImportPreview } | { ok: false; message: string };

// Checks every row. `dashboard` is the Data Story item questions are imported into.
export function previewImport(
  key: ImportTaskKey,
  sheet: string[][],
  dashboard?: { charts: { id: string; title: string }[] },
): PreviewResult {
  const t = TEMPLATES[key];
  const headers = t.columns.map((c) => c.header);
  const clean = (r: string[]) => r.map((c) => (c ?? '').trim());
  const all = sheet.map((cells, i) => ({ row: i + 1, cells: clean(cells) }));
  const headerAt = all.findIndex((r) => sameText(r.cells[0], headers[0]));
  if (headerAt < 0) {
    return {
      ok: false,
      message: `The first row must be the header: ${headers.join(', ')}. Download the template to start.`,
    };
  }
  const data = all
    .slice(headerAt + 1)
    .filter((r) => r.cells.some((c) => c !== '') && !r.cells[0]?.startsWith('#'));
  if (data.length === 0)
    return { ok: false, message: 'There are no rows to add under the header.' };
  if (data.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      message: `There are ${data.length} rows. The limit is ${MAX_IMPORT_ROWS} at a time.`,
    };
  }

  const rows: ImportRow[] = [];
  const items: PackItemData[] = [];
  for (const r of data) {
    const cells = headers.map((_, i) => r.cells[i] ?? '');
    const item = t.build(cells);
    const errors =
      key === 'data_story'
        ? questionErrors(item, dashboard)
        : columnErrors(t, checkPackItem(key, item));
    rows.push({ row: r.row, cells, errors });
    if (errors.length === 0)
      items.push(key === 'data_story' ? withChartId(item, dashboard!) : item);
  }
  return { ok: true, value: { headers, rows, items } };
}

function sameText(a: string | undefined, b: string | undefined) {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

// "Option 2: Write this option." — each problem named by its column.
function columnErrors(t: Template, errors: { path: string; message: string }[]): string[] {
  return errors.map((e) => {
    const col =
      t.columns.find((c) => c.paths.includes(e.path)) ??
      t.columns.find((c) => c.paths.some((p) => e.path.startsWith(`${p}.`)));
    return col ? `${col.header}: ${e.message}` : e.message;
  });
}

function questionErrors(
  item: PackItemData,
  dashboard: { charts: { id: string; title: string }[] } | undefined,
): string[] {
  const q = item.publicData as { question: string };
  const s = item.secretData as { answers: string[]; chart: string };
  const errors: string[] = [];
  if (!q.question) errors.push('Question: Write the question.');
  if (s.answers.length === 0) errors.push('Accepted answers: Add at least one accepted answer.');
  if (!dashboard) errors.push('Choose the dashboard to add these questions to.');
  else if (!findChart(dashboard, s.chart)) {
    errors.push(
      `Chart to look at: Use one of the chart titles: ${dashboard.charts.map((c) => c.title).join(', ')}.`,
    );
  }
  return errors;
}

function findChart(dashboard: { charts: { id: string; title: string }[] }, name: string) {
  return dashboard.charts.find((c) => sameText(c.title, name) || sameText(c.id, name));
}

function withChartId(
  item: PackItemData,
  dashboard: { charts: { id: string; title: string }[] },
): PackItemData {
  const s = item.secretData as { answers: string[]; chart: string };
  return {
    publicData: item.publicData,
    secretData: { answers: s.answers, chart: findChart(dashboard, s.chart)!.id },
  };
}
