// CSV for the debrief exports. Excel opens these with the UTF-8 byte order mark at the start.

export type Cell = string | number | boolean | null | undefined;

// The UTF-8 byte order mark, so Excel reads names with accents correctly.
export const BOM = String.fromCharCode(0xfeff);

// Team names and chat are typed by players. A cell that starts with = + - @ (or a tab or
// carriage return) could run as a formula in a spreadsheet, so it gets a leading apostrophe.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
