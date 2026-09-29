import { useState, type FormEvent } from 'react';
import { CheckCircle2, Lightbulb, XCircle } from 'lucide-react';
import { Button, Card } from '../ui/basics';
import { useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Data Story: read a small dashboard and answer its questions (3 by default), one at a time. The charts sit in
// one row and the questions in a row below. Every value is printed on its chart in large text,
// so it reads on a Zoom share at 1280x720.

interface Point {
  label: string;
  value: number;
}

interface Chart {
  id: string;
  title: string;
  type: 'bar' | 'line' | 'pie';
  data: Point[];
}

interface DataStoryView {
  content: { title?: string; charts: Chart[]; questions: string[] };
  answers: (string | null)[];
  // The hint text is the id of the chart to look at.
  hint: { index: number; text: string } | null;
}

const number = (n: number) => n.toLocaleString('en-IN');
const COLOURS = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#60a5fa'];

export function DataStory({ task, view, hint, giveUp }: TaskPlayProps) {
  const { content, answers, hint: hintQ } = view as DataStoryView;
  const [typed, setTyped] = useState<string[]>(() => content.questions.map(() => ''));
  const [checked, setChecked] = useState<number | null>(null);
  const { submit, feedback, busy } = useTaskSubmit(task.id);
  const hintChart = hintQ ? content.charts.find((c) => c.id === hintQ.text) : undefined;

  async function onCheck(e: FormEvent, index: number) {
    e.preventDefault();
    setChecked(index);
    await submit({ index, answer: typed[index] ?? '' });
  }

  return (
    <Card className="px-4 py-2.5">
      <div className="flex items-center gap-4">
        <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold" title={content.title}>
          {content.title ?? 'Dashboard'}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {/* Once used, the hint shows here, so the question boxes never grow. */}
          {hintQ && hintChart ? (
            <p className="flex items-center gap-1.5 text-lg font-semibold text-info">
              <Lightbulb className="h-5 w-5 shrink-0" aria-hidden />
              Hint for question {hintQ.index + 1}: the outlined chart.
            </p>
          ) : (
            hint
          )}
          {giveUp}
        </div>
      </div>

      <div
        className="mt-2 grid gap-2.5"
        style={{
          gridTemplateColumns: `repeat(${Math.min(content.charts.length, 3)}, minmax(0, 1fr))`,
        }}
      >
        {content.charts.map((chart) => (
          <ChartCard key={chart.id} chart={chart} highlighted={chart.id === hintChart?.id} />
        ))}
      </div>

      <ol className="mt-2.5 grid grid-cols-3 gap-2.5">
        {content.questions.map((q, i) => {
          const solved = answers[i] ?? null;
          return (
            <li
              key={i}
              className={`flex flex-col rounded-xl border px-3 py-1.5 ${
                solved ? 'border-success/50 bg-success/10' : 'border-line bg-card-raised'
              }`}
            >
              <p className="flex-1 text-base leading-snug">
                <span className="font-extrabold text-warning">{i + 1}.</span> {q}
              </p>
              {solved ? (
                <p className="mt-1 flex items-center gap-2 text-xl font-bold text-success">
                  <CheckCircle2 className="h-6 w-6" aria-hidden /> {solved}
                </p>
              ) : (
                <form onSubmit={(e) => onCheck(e, i)} className="mt-1 flex gap-2">
                  <input
                    aria-label={`Answer to question ${i + 1}`}
                    value={typed[i] ?? ''}
                    maxLength={200}
                    autoComplete="off"
                    onChange={(e) =>
                      setTyped((t) => t.map((v, j) => (j === i ? e.target.value : v)))
                    }
                    className="h-10 min-w-0 flex-1 rounded-xl border-2 border-line bg-page px-3 text-xl focus:border-brand focus:outline-none"
                  />
                  <Button
                    type="submit"
                    tone="success"
                    className="h-10 px-3 py-0 text-lg"
                    disabled={busy || (typed[i] ?? '').trim() === ''}
                  >
                    Check
                  </Button>
                </form>
              )}
              {checked === i && !solved && feedback?.tone === 'bad' && (
                <p
                  role="status"
                  className="mt-1 flex items-center gap-1.5 text-base font-bold text-danger"
                >
                  <XCircle className="h-5 w-5" aria-hidden /> {feedback.text}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function ChartCard({ chart, highlighted }: { chart: Chart; highlighted: boolean }) {
  // Short labels (months, days, regions) fit under upright columns; long ones need rows.
  const short = chart.data.every((d) => d.label.length <= 7);
  return (
    <figure
      aria-label={chart.title}
      className={`rounded-xl border-2 bg-card-raised px-3 py-1.5 ${
        highlighted ? 'border-info' : 'border-line'
      }`}
    >
      <figcaption className="text-base leading-tight font-bold">{chart.title}</figcaption>
      {chart.type === 'bar' &&
        (short ? <ColumnChart data={chart.data} /> : <BarChart data={chart.data} />)}
      {chart.type === 'line' && <LineChart data={chart.data} />}
      {chart.type === 'pie' && <PieChart data={chart.data} />}
    </figure>
  );
}

// Upright columns with the value above each and the label below.
function ColumnChart({ data }: { data: Point[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="mt-1 flex h-28 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
          <span className="nums text-base font-bold">{number(d.value)}</span>
          <span
            className="w-full max-w-10 rounded-t-sm bg-info"
            style={{ height: `${Math.max(4, (d.value / max) * 62)}%` }}
          />
          <span className="mt-0.5 truncate text-base leading-tight">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// Horizontal bars for long labels, with every value at the end of its bar.
function BarChart({ data }: { data: Point[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="mt-1.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-base">
      {data.map((d) => (
        <li key={d.label} className="contents">
          <span className="leading-tight">{d.label}</span>
          <span className="h-5">
            <span
              className="block h-full rounded-sm bg-info"
              style={{ width: `${Math.max(4, (d.value / max) * 100)}%` }}
            />
          </span>
          <span className="nums text-right font-bold">{number(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

// A line with every point labelled with its value. The SVG is drawn at about its shown size,
// so the text shows at about 15 px.
function LineChart({ data }: { data: Point[] }) {
  const W = 250;
  const H = 118;
  const pad = { left: 21, right: 21, top: 24, bottom: 24 };
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) =>
    pad.left + (data.length > 1 ? (i / (data.length - 1)) * (W - pad.left - pad.right) : 0);
  const y = (v: number) => pad.top + (1 - (v - min) / span) * (H - pad.top - pad.bottom);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(d.value)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="Line chart">
      <path d={path} fill="none" stroke="#a78bfa" strokeWidth={3} />
      {data.map((d, i) => (
        <g key={d.label}>
          <circle cx={x(i)} cy={y(d.value)} r={4.5} fill="#a78bfa" />
          <text
            x={x(i)}
            y={y(d.value) - 9}
            textAnchor="middle"
            fontSize={15}
            fontWeight={700}
            fill="currentColor"
          >
            {number(d.value)}
          </text>
          <text x={x(i)} y={H - 4} textAnchor="middle" fontSize={15} fill="currentColor">
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// A pie with a legend that prints every value and its share.
function PieChart({ data }: { data: Point[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  // Each slice starts where the ones before it end, from the top of the circle.
  const starts = data.map(
    (_, i) =>
      -Math.PI / 2 + (data.slice(0, i).reduce((sum, d) => sum + d.value, 0) / total) * Math.PI * 2,
  );
  const slices = data.map((d, i) => {
    const a = (d.value / total) * Math.PI * 2;
    const start = starts[i] ?? 0;
    const end = start + a;
    const large = a > Math.PI ? 1 : 0;
    const p = (t: number) => `${50 + 45 * Math.cos(t)} ${50 + 45 * Math.sin(t)}`;
    const shape =
      data.length === 1
        ? 'M50 5 A45 45 0 1 1 49.99 5 Z'
        : `M50 50 L${p(start)} A45 45 0 ${large} 1 ${p(end)} Z`;
    return { d, shape, colour: COLOURS[i % COLOURS.length] };
  });
  return (
    <div className="mt-1 flex items-center gap-3">
      <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" role="img" aria-label="Pie chart">
        {slices.map((s) => (
          <path key={s.d.label} d={s.shape} fill={s.colour} />
        ))}
      </svg>
      <ul className="space-y-0.5 text-base">
        {slices.map((s) => (
          <li key={s.d.label} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.colour }} />
            <span>
              {s.d.label}: <strong className="nums">{number(s.d.value)}</strong> (
              {Math.round((s.d.value / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
