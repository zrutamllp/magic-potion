import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '../ui/basics';
import { useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Spot the Difference: click a difference on either picture. The click is sent in image pixels
// and checked on the server, which counts clicks near a difference too. A miss costs nothing.

interface Circle {
  x: number;
  y: number;
  r: number;
}

interface SpotView {
  content: { leftImageUrl: string; rightImageUrl: string; width: number; height: number };
  found: (Circle | null)[];
  total: number;
  hint: Circle | null;
}

// Where a click lands in image pixels, whatever size the picture is shown at.
export function toImagePoint(
  e: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  size: { width: number; height: number },
) {
  return {
    x: Math.round(((e.clientX - rect.left) / rect.width) * size.width),
    y: Math.round(((e.clientY - rect.top) / rect.height) * size.height),
  };
}

export function SpotDifference({ task, view, hint, giveUp }: TaskPlayProps) {
  const { content, found, total, hint: hintArea } = view as SpotView;
  const { submit } = useTaskSubmit(task.id);
  // The last miss, shown briefly where it was clicked.
  const [miss, setMiss] = useState<{ x: number; y: number; side: string; n: number } | null>(null);
  const [lastHit, setLastHit] = useState(false);
  // Numbers each miss, so a second miss restarts the timer that hides the mark.
  const missCount = useRef(0);
  const circles = found.filter((c): c is Circle => c !== null);

  useEffect(() => {
    if (!miss) return;
    const t = setTimeout(() => setMiss(null), 3000);
    return () => clearTimeout(t);
  }, [miss]);

  async function onClick(e: MouseEvent<HTMLDivElement>, side: string) {
    const point = toImagePoint(e, e.currentTarget.getBoundingClientRect(), content);
    const ack = await submit(point);
    const status = ack.ok ? (ack.value as { status?: string } | undefined)?.status : undefined;
    const hit = status === 'correct' || status === 'solved';
    setLastHit(hit);
    missCount.current += 1;
    setMiss(hit ? null : { ...point, side, n: missCount.current });
  }

  const picture = (url: string, side: string) => (
    <div
      role="button"
      tabIndex={-1}
      aria-label={`${side} picture`}
      onClick={(e) => void onClick(e, side)}
      className="relative flex-1 cursor-crosshair overflow-hidden rounded-xl border-2 border-line"
      style={{ aspectRatio: `${content.width / content.height}` }}
    >
      <img src={url} alt="" draggable={false} className="h-full w-full select-none" />
      <svg
        viewBox={`0 0 ${content.width} ${content.height}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        {circles.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={c.r}
            fill="rgba(34,197,94,0.15)"
            stroke="#22c55e"
            strokeWidth={8}
          />
        ))}
        {hintArea && (
          <circle
            cx={hintArea.x}
            cy={hintArea.y}
            r={hintArea.r}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={6}
            strokeDasharray="18 12"
          />
        )}
        {miss && (
          <g>
            <g stroke="#ef4444" strokeWidth={8} strokeLinecap="round">
              <line x1={miss.x - 16} y1={miss.y - 16} x2={miss.x + 16} y2={miss.y + 16} />
              <line x1={miss.x + 16} y1={miss.y - 16} x2={miss.x - 16} y2={miss.y + 16} />
            </g>
            {/* On the clicked picture, the message sits by the mark, inside the picture. */}
            {miss.side === side && (
              <text
                x={Math.min(Math.max(miss.x, 190), content.width - 190)}
                y={miss.y > 80 ? miss.y - 30 : miss.y + 58}
                textAnchor="middle"
                fontSize={34}
                fontWeight={800}
                fill="#ef4444"
                stroke="#fff"
                strokeWidth={8}
                paintOrder="stroke"
              >
                No difference there.
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );

  return (
    <Card className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-3xl font-extrabold" aria-label={`${circles.length} of ${total} found`}>
          <span className="nums text-success">{circles.length}</span> of {total} found
        </p>
        {/* For screen readers; the picture shows the same message by the mark. */}
        <p role="status" className="sr-only">
          {miss ? 'No difference there.' : lastHit ? 'Found one.' : ''}
        </p>
        {lastHit && !miss && (
          <p className="flex items-center gap-1.5 text-lg font-bold text-success" aria-hidden>
            <CheckCircle2 className="h-5 w-5" /> Found one.
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          {hint}
          {giveUp}
        </div>
      </div>
      <div className="mt-3 flex gap-4">
        {picture(content.leftImageUrl, 'Left')}
        {picture(content.rightImageUrl, 'Right')}
      </div>
    </Card>
  );
}
