import { useRef, useState } from 'react';
import { Download, FileUp, X } from 'lucide-react';
import {
  countLabel,
  type PackDetail,
  type PackItem,
  type PackItemData,
  type TaskKey,
} from '@magic-potion/shared';
import { useStaff } from '../StaffContext';
import { SmallButton, Status, useAction } from '../ui';

// Filling a pool from a spreadsheet: download the template, fill it in Excel (or any sheet
// program), upload it, check every row, then add the good rows. Nothing is saved until "Add".

interface ImportRow {
  row: number;
  cells: string[];
  errors: string[];
}
interface ImportPreview {
  headers: string[];
  rows: ImportRow[];
  items: PackItemData[];
}

export function ImportDialog({
  pack,
  task,
  dashboard,
  onDone,
}: {
  pack: PackDetail;
  task: TaskKey;
  // Data Story: the dashboard the questions go into.
  dashboard?: PackItem;
  onDone: (pack: PackDetail | null) => void;
}) {
  const { api } = useStaff();
  const file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const read = useAction();
  const save = useAction();
  const bad = preview?.rows.filter((r) => r.errors.length > 0) ?? [];
  const good = preview?.items.length ?? 0;
  const name = `magic-potion-${task.replace('_', '-')}-template`;

  async function upload(f: File | undefined) {
    if (!f) return;
    setPreview(null);
    const query = `task=${task}${dashboard ? `&itemId=${dashboard.id}` : ''}`;
    const result = await read.run(() =>
      api.upload<ImportPreview>(`/packs/${pack.id}/import?${query}`, f),
    );
    if (result) setPreview(result);
    if (file.current) file.current.value = '';
  }

  async function add() {
    if (!preview || bad.length > 0) return;
    const next = await save.run(() => {
      if (task === 'data_story' && dashboard) {
        return api.put<PackDetail>(
          `/packs/${pack.id}/items/${dashboard.id}`,
          mergeQuestions(dashboard, preview.items, mode),
        );
      }
      return api.post<PackDetail>(`/packs/${pack.id}/items/bulk`, {
        taskKey: task,
        mode,
        items: preview.items,
      });
    });
    if (next) onDone(next);
  }

  const noun =
    task === 'data_story'
      ? good === 1
        ? 'question'
        : 'questions'
      : countLabel(task, good).replace(/^\d+ /, '');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import from a spreadsheet"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
    >
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-2xl border border-line bg-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-xl font-extrabold">Import from Excel or CSV</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onDone(null)}
            className="text-ink-muted hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto p-5">
          <ol className="flex flex-col gap-2 text-base">
            <li>
              <b>1.</b> Download the template:{' '}
              <span className="inline-flex gap-2">
                <SmallButton
                  variant="outline"
                  onClick={() =>
                    void api.download(`/packs-import-template?task=${task}`, `${name}.xlsx`)
                  }
                >
                  <Download className="h-4 w-4" aria-hidden /> Excel
                </SmallButton>
                <SmallButton
                  variant="outline"
                  tone="muted"
                  onClick={() =>
                    void api.download(
                      `/packs-import-template?task=${task}&format=csv`,
                      `${name}.csv`,
                    )
                  }
                >
                  <Download className="h-4 w-4" aria-hidden /> CSV
                </SmallButton>
              </span>
            </li>
            <li>
              <b>2.</b> Fill one row per {task === 'data_story' ? 'question' : 'entry'}. Put several
              accepted answers in one cell, separated by <b>;</b>
              {task === 'data_story' && dashboard
                ? ' The chart must be one of this dashboard’s chart titles.'
                : ''}
            </li>
            <li className="flex items-center gap-2">
              <b>3.</b> Upload it:
              <input
                ref={file}
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                aria-label="Spreadsheet file"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
              <SmallButton onClick={() => file.current?.click()} disabled={read.busy}>
                <FileUp className="h-4 w-4" aria-hidden /> {read.busy ? 'Checking…' : 'Choose file'}
              </SmallButton>
            </li>
          </ol>
          <Status error={read.error} />

          {preview && (
            <>
              <p
                role="status"
                className={`font-semibold ${bad.length ? 'text-danger' : 'text-success'}`}
              >
                {bad.length
                  ? `${bad.length} ${bad.length === 1 ? 'row needs' : 'rows need'} fixing. Fix ${bad.length === 1 ? 'it' : 'them'} in the file and upload it again.`
                  : `All ${preview.rows.length} rows are fine.`}
              </p>
              <div className="max-h-72 overflow-auto rounded-lg border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-card-raised text-ink-muted">
                    <tr>
                      <th className="px-2 py-1">Row</th>
                      {preview.headers.map((h) => (
                        <th key={h} className="px-2 py-1">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {preview.rows.map((r) => (
                      <tr key={r.row} className={r.errors.length ? 'bg-danger/10' : ''}>
                        <td className="px-2 py-1 align-top text-ink-muted">{r.row}</td>
                        {r.cells.map((c, i) => (
                          <td key={i} className="max-w-64 px-2 py-1 align-top">
                            <span className="line-clamp-2">{c}</span>
                            {i === 0 &&
                              r.errors.map((e) => (
                                <span key={e} className="block text-danger">
                                  {e}
                                </span>
                              ))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === 'add'}
                    onChange={() => setMode('add')}
                    className="accent-brand"
                  />
                  Add to the {task === 'data_story' ? 'dashboard’s questions' : 'pool'}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === 'replace'}
                    onChange={() => setMode('replace')}
                    className="accent-brand"
                  />
                  Replace{' '}
                  {task === 'data_story' ? 'the dashboard’s questions' : 'every entry of this task'}
                </label>
              </div>
              <Status error={save.error} />
              <div>
                <SmallButton onClick={add} disabled={bad.length > 0 || good === 0 || save.busy}>
                  {save.busy
                    ? 'Adding…'
                    : `${mode === 'replace' ? 'Replace with' : 'Add'} ${good} ${noun}`}
                </SmallButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Data Story: imported questions go into the chosen dashboard.
function mergeQuestions(
  dashboard: PackItem,
  rows: PackItemData[],
  mode: 'add' | 'replace',
): PackItemData {
  const pub = dashboard.publicData as { questions: string[] } & Record<string, unknown>;
  const sec = dashboard.secretData as { answers: string[][]; hintChartIds: string[] };
  const q = rows.map((r) => (r.publicData as { question: string }).question);
  const a = rows.map((r) => (r.secretData as { answers: string[] }).answers);
  const c = rows.map((r) => (r.secretData as { chart: string }).chart);
  return mode === 'replace'
    ? { publicData: { ...pub, questions: q }, secretData: { answers: a, hintChartIds: c } }
    : {
        publicData: { ...pub, questions: [...pub.questions, ...q] },
        secretData: { answers: [...sec.answers, ...a], hintChartIds: [...sec.hintChartIds, ...c] },
      };
}
