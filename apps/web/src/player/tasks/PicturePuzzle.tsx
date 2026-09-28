import { useState, type DragEvent } from 'react';
import { Check } from 'lucide-react';
import { Card } from '../ui/basics';
import { SubmitFeedback, useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Picture Puzzle: rebuild the picture by swapping tiles. Click one tile, then another (made for
// a trackpad over Zoom); drag and drop works too. The server keeps the order and checks it.

interface PuzzleView {
  content: { title: string; imageUrl: string; width: number; height: number };
  rows: number;
  cols: number;
  // order[spot] is the tile shown at that spot. Tile t belongs at spot t.
  order: number[];
  // After the hint: the spots whose tile is in its right place, worked out by the server after
  // every swap. Null before the hint. Wrong tiles get no mark.
  inPlace: number[] | null;
}

export function PicturePuzzle({ task, view, hint, giveUp }: TaskPlayProps) {
  const { content, rows, cols, order, inPlace } = view as PuzzleView;
  const { submit, feedback } = useTaskSubmit(task.id);
  // The spot picked first, waiting for a second click.
  const [picked, setPicked] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  function swap(a: number, b: number) {
    setPicked(null);
    if (a !== b) void submit({ swap: [a, b] });
  }

  function onTile(spot: number) {
    if (picked === null) setPicked(spot);
    else swap(picked, spot);
  }

  function onDrop(e: DragEvent, spot: number) {
    e.preventDefault();
    if (dragFrom !== null) swap(dragFrom, spot);
    setDragFrom(null);
  }

  // The grid keeps the picture's shape and fits the height left on a 1280x720 screen.
  const ratio = content.width / content.height;

  return (
    <Card className="flex flex-wrap items-start gap-5 px-4 py-3">
      <div
        className="grid gap-1 rounded-xl bg-line p-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          aspectRatio: `${ratio}`,
          height: 'min(25rem, calc(100vh - 18rem))',
        }}
        aria-label="Puzzle"
      >
        {order.map((tile, spot) => {
          const row = Math.floor(tile / cols);
          const col = tile % cols;
          const isPicked = picked === spot;
          const placed = inPlace?.includes(spot) ?? false;
          return (
            <button
              key={spot}
              type="button"
              draggable
              onClick={() => onTile(spot)}
              onDragStart={() => {
                setDragFrom(spot);
                setPicked(null);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, spot)}
              aria-label={`Spot ${spot + 1}${placed ? ', in place' : ''}${isPicked ? ', picked' : ''}`}
              aria-pressed={isPicked}
              data-tile={tile}
              className={`relative cursor-pointer rounded-sm bg-no-repeat outline-none focus-visible:ring-4 focus-visible:ring-brand ${
                isPicked ? 'z-10 ring-4 ring-warning' : 'hover:brightness-110'
              }`}
              style={{
                backgroundImage: `url(${content.imageUrl})`,
                backgroundSize: `${cols * 100}% ${rows * 100}%`,
                backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${
                  rows > 1 ? (row / (rows - 1)) * 100 : 0
                }%`,
              }}
            >
              {placed && (
                <span className="absolute top-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-success shadow-lg">
                  <Check className="h-6 w-6 text-white" strokeWidth={4} aria-hidden />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex min-w-60 flex-1 flex-col gap-2.5">
        <div>
          <p className="text-lg font-bold">Finished picture</p>
          <img
            src={content.imageUrl}
            alt={`Finished picture: ${content.title}`}
            className="mt-1 w-full max-w-60 rounded-lg border border-line"
            style={{ aspectRatio: `${ratio}` }}
          />
        </div>
        <p className="text-lg">
          {picked === null
            ? 'Click a tile, then another tile, to swap them.'
            : 'Now click the tile to swap with.'}
        </p>
        <SubmitFeedback feedback={feedback?.tone === 'bad' ? feedback : null} />
        <div className="flex flex-wrap items-center gap-2">
          {hint}
          {giveUp}
        </div>
      </div>
    </Card>
  );
}
