import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser, ImageUp, Trash2, Undo2 } from 'lucide-react';
import { DEFAULT_SETTINGS, DIFFERENCES_NEEDED } from '@magic-potion/shared';
import { toImagePoint } from '../../player/tasks/SpotDifference';
import { useStaff } from '../StaffContext';
import { SmallButton, Status, useAction } from '../ui';
import { AnswersField, FieldError, TextField, errorAt } from './fields';
import type { ItemFormProps } from './textForms';

// Forms for the tasks with pictures: Picture Puzzle, Spot the Difference, Guess the Celebrity,
// and the Pictionary drawing pad. Pictures are uploaded like the logo: saved under a random
// name with their hidden details removed.

type Use = 'puzzle' | 'spot' | 'face' | 'clue';
export interface Uploaded {
  url: string;
  width: number;
  height: number;
}

function UploadButton({
  use,
  label,
  onUploaded,
}: {
  use: Use;
  label: string;
  onUploaded: (image: Uploaded) => void;
}) {
  const { api } = useStaff();
  const input = useRef<HTMLInputElement>(null);
  const action = useAction();
  async function upload(file: File | undefined) {
    if (!file) return;
    const image = await action.run(() => api.upload<Uploaded>(`/uploads/image?use=${use}`, file));
    if (image) onUploaded(image);
    if (input.current) input.current.value = '';
  }
  return (
    <span className="inline-flex flex-col">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        aria-label={`${label} file`}
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <SmallButton variant="outline" onClick={() => input.current?.click()} disabled={action.busy}>
        <ImageUp className="h-4 w-4" aria-hidden /> {action.busy ? 'Uploading…' : label}
      </SmallButton>
      <Status error={action.error} />
    </span>
  );
}

// The entry as it is now. Uploads finish later; reading this then keeps any change made while
// the file was uploading (another upload, a typed name).
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

// ---------- Picture Puzzle ----------

type PuzzlePub = { title: string; imageUrl: string; width: number; height: number };

export function PuzzleForm({ value, onChange, errors }: ItemFormProps) {
  const pub = (value.publicData ?? {}) as Partial<PuzzlePub>;
  const latest = useLatest(value);
  const set = (p: Partial<PuzzlePub>) =>
    onChange({ publicData: { ...(latest.current.publicData as object), ...p }, secretData: {} });
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Title players see"
        value={pub.title ?? ''}
        onChange={(title) => set({ title })}
        error={errorAt(errors, 'public.title')}
        placeholder="The Shattered Blueprint"
      />
      <div>
        <p className="text-sm font-semibold">Picture</p>
        <p className="text-xs text-ink-muted">
          It is cut into tiles (the grid is a game setting, 3 × 3 by default). A clear, busy picture
          works best.
        </p>
        <div className="mt-1 flex items-start gap-3">
          {pub.imageUrl ? (
            <img
              src={pub.imageUrl}
              alt="Puzzle picture"
              className="h-40 rounded-lg border border-line object-contain"
            />
          ) : (
            <span className="flex h-40 w-56 items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-muted">
              No picture yet
            </span>
          )}
          <UploadButton
            use="puzzle"
            label={pub.imageUrl ? 'Replace picture' : 'Upload picture'}
            onUploaded={(img) => set({ imageUrl: img.url, width: img.width, height: img.height })}
          />
        </div>
        <FieldError
          message={errorAt(errors, 'public.imageUrl') ?? errorAt(errors, 'public.width')}
        />
      </div>
    </div>
  );
}

// ---------- Spot the Difference ----------

type SpotPub = {
  leftImageUrl: string;
  rightImageUrl: string;
  width: number;
  height: number;
  rightWidth: number;
  rightHeight: number;
};
type Area = { x: number; y: number; r: number };

export function SpotForm({ value, onChange, errors }: ItemFormProps) {
  const pub = (value.publicData ?? {}) as Partial<SpotPub>;
  const areas = ((value.secretData as { areas?: Area[] } | undefined)?.areas ?? []) as Area[];
  const [blink, setBlink] = useState(false);
  const [marking, setMarking] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const width = pub.width ?? 0;
  const height = pub.height ?? 0;
  const ready = Boolean(pub.leftImageUrl && pub.rightImageUrl && width && height);
  const sameSize = pub.width === pub.rightWidth && pub.height === pub.rightHeight;
  // The extra click room players get, from the default setting (each game can change it).
  const room = (DEFAULT_SETTINGS.tasks.spotDifferenceTolerancePercent / 100) * width;

  const latest = useLatest(value);
  const emit = (p: Partial<SpotPub>, next?: Area[]) => {
    const now = latest.current;
    const nowAreas = (now.secretData as { areas?: Area[] } | undefined)?.areas ?? [];
    onChange({
      publicData: { ...(now.publicData as object), ...p },
      secretData: { areas: next ?? nowAreas },
    });
  };
  const setAreas = (next: Area[]) => {
    setRefused(null);
    emit({}, next);
  };

  useEffect(() => {
    if (!blink) return;
    const timer = setInterval(() => setShowRight((r) => !r), 500);
    return () => clearInterval(timer);
  }, [blink]);

  function addAt(point: { x: number; y: number }) {
    if (areas.length >= DIFFERENCES_NEEDED) {
      setRefused(`All ${DIFFERENCES_NEEDED} differences are marked. Remove one to mark another.`);
      return;
    }
    setAreas([...areas, { ...point, r: Math.max(4, Math.round(width * 0.04)) }]);
  }

  const overlapping = areas.some((a, i) =>
    areas.some((b, j) => j > i && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r),
  );
  const left = DIFFERENCES_NEEDED - areas.length;
  const status =
    left > 0
      ? `Mark ${DIFFERENCES_NEEDED} differences: ${areas.length} marked, ${left} to go.`
      : left < 0
        ? `Mark exactly ${DIFFERENCES_NEEDED} differences: remove ${-left}.`
        : `All ${DIFFERENCES_NEEDED} differences are marked.`;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-sm font-semibold">Original picture</p>
          <UploadButton
            use="spot"
            label={pub.leftImageUrl ? 'Replace original' : 'Upload original'}
            onUploaded={(img) =>
              emit({ leftImageUrl: img.url, width: img.width, height: img.height })
            }
          />
          <FieldError message={errorAt(errors, 'public.leftImageUrl')} />
        </div>
        <div>
          <p className="text-sm font-semibold">Changed picture</p>
          <UploadButton
            use="spot"
            label={pub.rightImageUrl ? 'Replace changed' : 'Upload changed'}
            onUploaded={(img) =>
              emit({ rightImageUrl: img.url, rightWidth: img.width, rightHeight: img.height })
            }
          />
          <FieldError message={errorAt(errors, 'public.rightImageUrl')} />
        </div>
      </div>
      {pub.leftImageUrl && pub.rightImageUrl && !sameSize && (
        <p role="alert" className="text-sm text-danger">
          The two pictures must be the same size ({pub.width} × {pub.height} and {pub.rightWidth} ×{' '}
          {pub.rightHeight}). Upload the changed picture again at the same size.
        </p>
      )}
      {ready && sameSize && !marking && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p
              className={`text-sm font-semibold ${left === 0 ? 'text-success' : 'text-danger'}`}
              role="status"
            >
              {status}
            </p>
            <SmallButton onClick={() => setMarking(true)}>Mark the differences</SmallButton>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['left', 'right'] as const).map((side) => (
              <MarkingPicture
                key={side}
                label={side === 'left' ? 'Original' : 'Changed'}
                src={side === 'left' ? pub.leftImageUrl! : pub.rightImageUrl!}
                width={width}
                height={height}
                areas={areas}
                room={room}
              />
            ))}
          </div>
        </>
      )}
      {ready && sameSize && marking && (
        // Marking needs big pictures: the whole window, both pictures side by side.
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mark the differences"
          className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-page p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold">Mark the differences</h2>
            <SmallButton onClick={() => setMarking(false)}>Done</SmallButton>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p
              className={`text-sm font-semibold ${left === 0 ? 'text-success' : 'text-danger'}`}
              role="status"
            >
              {status}
            </p>
            <SmallButton variant="outline" tone="muted" onClick={() => setBlink((b) => !b)}>
              {blink ? 'Stop blinking' : 'Blink'}
            </SmallButton>
            <span className="text-xs text-ink-muted">
              Click where the pictures differ. Drag a circle to move it.
            </span>
          </div>
          {refused && (
            <p role="alert" className="text-sm text-danger">
              {refused}
            </p>
          )}
          {overlapping && (
            <p className="text-sm text-warning">
              Two circles overlap. A click there counts for the nearest one not yet found.
            </p>
          )}
          <div
            className={`mx-auto grid w-full gap-3 ${blink ? 'grid-cols-1' : 'grid-cols-2'}`}
            style={{
              maxWidth: `calc((100vh - 15rem) * ${(width / height) * (blink ? 1 : 2)} + 1rem)`,
            }}
          >
            {(blink ? [showRight ? 'right' : 'left'] : ['left', 'right']).map((side) => (
              <MarkingPicture
                key={blink ? 'blink' : side}
                label={side === 'left' ? 'Original' : 'Changed'}
                src={side === 'left' ? pub.leftImageUrl! : pub.rightImageUrl!}
                width={width}
                height={height}
                areas={areas}
                room={room}
                onAdd={addAt}
                onMove={(i, p) => setAreas(areas.map((a, j) => (j === i ? { ...a, ...p } : a)))}
              />
            ))}
          </div>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-1">
            {areas.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning font-bold text-page">
                  {i + 1}
                </span>
                <label className="flex flex-1 items-center gap-2">
                  <span className="text-ink-muted">Size</span>
                  <input
                    type="range"
                    min={Math.max(2, Math.round(width * 0.01))}
                    max={Math.round(width * 0.2)}
                    value={a.r}
                    onChange={(e) =>
                      setAreas(
                        areas.map((x, j) => (j === i ? { ...x, r: Number(e.target.value) } : x)),
                      )
                    }
                    aria-label={`Size of difference ${i + 1}`}
                    className="flex-1 accent-brand"
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove difference ${i + 1}`}
                  className="text-ink-muted hover:text-danger"
                  onClick={() => setAreas(areas.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-muted">
            The dashed ring shows the extra room a click gets (
            {DEFAULT_SETTINGS.tasks.spotDifferenceTolerancePercent}% of the width by default; a game
            setting).
          </p>
        </div>
      )}
      <FieldError message={errors.find((e) => e.path === 'secret.areas')?.message} />
    </div>
  );
}

function MarkingPicture({
  label,
  src,
  width,
  height,
  areas,
  room,
  onAdd,
  onMove,
}: {
  label: string;
  src: string;
  width: number;
  height: number;
  areas: Area[];
  room: number;
  // Without these the picture is a preview only.
  onAdd?: (p: { x: number; y: number }) => void;
  onMove?: (index: number, p: { x: number; y: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const moved = useRef(false);

  const point = (e: { clientX: number; clientY: number }) => {
    const rect = box.current!.getBoundingClientRect();
    const p = toImagePoint(e, rect, { width, height });
    return { x: Math.min(width, Math.max(0, p.x)), y: Math.min(height, Math.max(0, p.y)) };
  };

  return (
    <figure>
      <figcaption className="mb-1 text-xs font-semibold text-ink-muted">{label}</figcaption>
      <div
        ref={box}
        data-testid={onAdd ? `mark-${label.toLowerCase()}` : undefined}
        className={`relative touch-none overflow-hidden rounded-lg border border-line select-none ${onAdd ? 'cursor-crosshair' : ''}`}
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={(e: ReactPointerEvent) => {
          if (onAdd && dragging.current === null) onAdd(point(e));
        }}
        onPointerMove={(e) => {
          if (dragging.current === null || !onMove) return;
          moved.current = true;
          onMove(dragging.current, point(e));
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerLeave={() => {
          dragging.current = null;
        }}
      >
        <img src={src} alt={`${label} picture`} className="h-full w-full" draggable={false} />
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full">
          {areas.map((a, i) => (
            <g
              key={i}
              className={onMove ? 'cursor-move' : undefined}
              onPointerDown={(e) => {
                if (!onMove) return;
                e.stopPropagation();
                (
                  e.currentTarget.ownerSVGElement?.parentElement as HTMLElement | null
                )?.setPointerCapture?.(e.pointerId);
                dragging.current = i;
                moved.current = false;
              }}
            >
              <circle
                pointerEvents="none"
                cx={a.x}
                cy={a.y}
                r={a.r + room}
                fill="none"
                stroke="#facc15"
                strokeWidth={width / 400}
                strokeDasharray={`${width / 120} ${width / 160}`}
                opacity={0.7}
              />
              <circle
                cx={a.x}
                cy={a.y}
                r={a.r}
                fill="rgba(250,204,21,0.18)"
                stroke="#facc15"
                strokeWidth={width / 250}
              />
              <text
                x={a.x}
                y={a.y}
                dy="0.35em"
                textAnchor="middle"
                fontSize={Math.max(12, a.r * 0.9)}
                fontWeight={800}
                fill="#facc15"
                stroke="#0e0e20"
                strokeWidth={width / 600}
              >
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}

// ---------- Guess the Celebrity ----------

type FacePub = { imageUrl: string };
type FaceSec = { names: string[] };

export function CelebrityForm({ value, onChange, errors }: ItemFormProps) {
  const pub = (value.publicData ?? {}) as Partial<FacePub>;
  const sec = (value.secretData ?? {}) as Partial<FaceSec>;
  const latest = useLatest(value);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold">Photo</p>
        <p className="text-xs text-ink-muted">
          Saved under a random name, never the person’s name, with hidden photo details removed.
        </p>
        <div className="mt-1 flex items-start gap-3">
          {pub.imageUrl ? (
            <img
              src={pub.imageUrl}
              alt="Photo"
              className="h-40 w-40 rounded-lg border border-line object-cover"
            />
          ) : (
            <span className="flex h-40 w-40 items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-muted">
              No photo yet
            </span>
          )}
          <UploadButton
            use="face"
            label={pub.imageUrl ? 'Replace photo' : 'Upload photo'}
            onUploaded={(img) =>
              onChange({ publicData: { imageUrl: img.url }, secretData: latest.current.secretData })
            }
          />
        </div>
        <FieldError message={errorAt(errors, 'public.imageUrl')} />
      </div>
      <AnswersField
        label="Accepted names"
        value={sec.names ?? []}
        onChange={(names) => onChange({ publicData: pub, secretData: { names } })}
        error={errorAt(errors, 'secret.names')}
        help="One per line, for example MS Dhoni, Dhoni, Mahendra Singh Dhoni. Dots, hyphens and small typos in long names are forgiven. The first one is used for the hint."
      />
    </div>
  );
}

// ---------- Pictionary ----------

type Point = [number, number];

export function PictionaryForm({ value, onChange, errors }: ItemFormProps) {
  const strokes = ((value.publicData as { strokes?: Point[][] } | undefined)?.strokes ??
    []) as Point[][];
  const word = ((value.secretData as { word?: string[] } | undefined)?.word ?? []) as string[];
  const setStrokes = (next: Point[][]) =>
    onChange({ publicData: { strokes: next }, secretData: { word } });
  return (
    <div className="flex flex-col gap-3">
      <DrawingPad strokes={strokes} onChange={setStrokes} />
      <FieldError message={errorAt(errors, 'public.strokes')} />
      <AnswersField
        label="Word and accepted spellings"
        value={word}
        onChange={(w) => onChange({ publicData: { strokes }, secretData: { word: w } })}
        error={errorAt(errors, 'secret.word')}
        help="One per line. The first letter of the first one is the hint. Simple plurals count."
        rows={2}
      />
    </div>
  );
}

// A square pad on a 0 to 100 grid. Players see the picture drawn stroke by stroke, in this order.
export function DrawingPad({
  strokes,
  onChange,
}: {
  strokes: Point[][];
  onChange: (s: Point[][]) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [current, setCurrent] = useState<Point[] | null>(null);

  const at = (e: { clientX: number; clientY: number }): Point => {
    const rect = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return [
      Math.round(Math.min(100, Math.max(0, x)) * 10) / 10,
      Math.round(Math.min(100, Math.max(0, y)) * 10) / 10,
    ];
  };

  function finish() {
    if (current && current.length >= 2) onChange([...strokes, simplify(current)]);
    setCurrent(null);
  }

  return (
    <div className="flex items-start gap-3">
      <svg
        ref={svg}
        data-testid="drawing-pad"
        viewBox="-4 -4 108 108"
        className="h-64 w-64 shrink-0 cursor-crosshair touch-none rounded-xl border border-line bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setCurrent([at(e)]);
        }}
        onPointerMove={(e) => {
          if (current) setCurrent([...current, at(e)]);
        }}
        onPointerUp={finish}
        onPointerLeave={finish}
      >
        {[...strokes, ...(current ? [current] : [])].map((s, i) => (
          <polyline
            key={i}
            points={s.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="#111"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-ink-muted">
          Draw with the mouse. Each line you draw is one stroke.
          <br />
          {strokes.length} strokes.
        </p>
        <SmallButton
          variant="outline"
          tone="muted"
          onClick={() => onChange(strokes.slice(0, -1))}
          disabled={strokes.length === 0}
        >
          <Undo2 className="h-4 w-4" aria-hidden /> Undo stroke
        </SmallButton>
        <SmallButton
          variant="outline"
          tone="danger"
          onClick={() => onChange([])}
          disabled={strokes.length === 0}
        >
          <Eraser className="h-4 w-4" aria-hidden /> Clear
        </SmallButton>
      </div>
    </div>
  );
}

// Keeps a point only when it has moved at least 1 grid unit, so strokes stay small.
function simplify(points: Point[]): Point[] {
  const out: Point[] = [points[0]!];
  for (const p of points.slice(1)) {
    const last = out[out.length - 1]!;
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1) out.push(p);
  }
  if (out.length < 2) out.push(points[points.length - 1]!);
  return out;
}
