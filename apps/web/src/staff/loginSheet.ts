import { loginSheetCsv, type TeamLoginCard } from '@magic-potion/shared';

// The team login sheet: one card per team with the game address, team code and password.
// Printed from a separate window so the admin panel itself never ends up on paper.

// Where teams log in: the player app at the site root.
export function playUrl(): string {
  return `${window.location.origin}/`;
}

// New logins replace older ones for the same team code; the rest are added in order.
export function mergeLogins(current: TeamLoginCard[], added: TeamLoginCard[]): TeamLoginCard[] {
  const byCode = new Map(added.map((l) => [l.code, l]));
  const merged = current.map((l) => byCode.get(l.code) ?? l);
  const known = new Set(current.map((l) => l.code));
  return [...merged, ...added.filter((l) => !known.has(l.code))];
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function loginSheetHtml(
  gameName: string,
  clientName: string,
  url: string,
  logins: TeamLoginCard[],
): string {
  const cards = logins
    .map(
      (l) => `<div class="card">
  <div class="team">${escape(l.name)}</div>
  <div class="row"><span>Go to</span><b>${escape(url)}</b></div>
  <div class="row"><span>Team code</span><b class="mono">${escape(l.code)}</b></div>
  <div class="row"><span>Password</span><b class="mono">${escape(l.password)}</b></div>
</div>`,
    )
    .join('\n');
  const title = clientName ? `${clientName}: ${gameName}` : gameName;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Team logins: ${escape(title)}</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.note { margin: 0 0 16px; color: #444; font-size: 13px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .card { border: 2px dashed #888; border-radius: 10px; padding: 14px 16px; break-inside: avoid; }
  .team { font-size: 20px; font-weight: 800; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; gap: 12px; font-size: 15px; padding: 3px 0; }
  .row span { color: #555; }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 17px; letter-spacing: 0.5px; }
  @media print { body { margin: 10mm; } .noprint { display: none; } }
</style></head><body>
<h1>Team logins: ${escape(title)}</h1>
<p class="note">Cut along the dashed lines and give each team its card. Keep this sheet private.</p>
<div class="grid">
${cards}
</div>
</body></html>`;
}

export function printLoginSheet(gameName: string, clientName: string, logins: TeamLoginCard[]) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(loginSheetHtml(gameName, clientName, playUrl(), logins));
  win.document.close();
  win.focus();
  win.print();
  return true;
}

export function downloadLoginCsv(gameName: string, logins: TeamLoginCard[]) {
  const csv = loginSheetCsv(gameName, playUrl(), logins);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${gameName.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'game'}-team-logins.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
