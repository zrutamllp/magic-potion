import { useRef, useState, type FormEvent } from 'react';
import { Bell, Camera, CheckCircle2, HelpCircle, Upload } from 'lucide-react';
import type { PlayerInboxView } from '@magic-potion/shared';
import { money } from '../../lib/time';
import { useGame } from '../GameContext';
import { Button, Card, Chip, PageTitle, fieldClass } from '../ui/basics';

// Inbox: the bonus tasks and game alerts, newest first. No filters, XP or achievements.

export function Inbox() {
  const { state } = useGame();
  const bonusTotal = state.settings.inbox.releaseAtPlaySeconds.length;
  const bonusDone = state.inbox.filter((i) => i.kind !== 'ALERT' && i.done).length;
  const items = [...state.inbox].reverse();
  return (
    <>
      <PageTitle
        title="Inbox"
        tone="warning"
        subtitle={`Bonus tasks done: ${bonusDone} of ${bonusTotal}`}
      />
      {items.length === 0 && (
        <Card>
          <p className="text-xl text-ink-muted">Nothing here yet.</p>
        </Card>
      )}
      <div className="space-y-4">
        {items.map((item) =>
          item.kind === 'ALERT' ? (
            <Alert key={item.id} item={item} />
          ) : (
            <BonusTask key={item.id} item={item} />
          ),
        )}
      </div>
    </>
  );
}

function Alert({ item }: { item: PlayerInboxView }) {
  return (
    <Card className="flex items-start gap-4 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card-raised">
        <Bell className="h-6 w-6 text-ink-muted" aria-hidden />
      </span>
      <div>
        <h3 className="text-xl font-bold">{item.title}</h3>
        <p className="text-lg text-ink-muted">{item.body}</p>
      </div>
    </Card>
  );
}

function BonusTask({ item }: { item: PlayerInboxView }) {
  const { state, act, send } = useGame();
  const [answer, setAnswer] = useState('');
  const reward = money(state.settings.inbox.reward);
  const photo = item.kind === 'PHOTO';
  const Icon = photo ? Camera : HelpCircle;
  const outOfTries = !item.done && item.attemptsLeft === 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await act('Answer sent.', () => send('inbox:answer', { itemId: item.id, answer }));
    if (ok) setAnswer('');
  }

  return (
    <Card tone={item.done ? 'success' : 'warning'} className="flex items-start gap-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-warning/15">
        <Icon className="h-8 w-8 text-warning" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-bold">{item.title}</h3>
          <Chip tone="warning">+{reward} points</Chip>
        </div>
        <p className="mt-1 text-lg">{item.body}</p>

        {item.done ? (
          <p className="mt-3 flex items-center gap-2 text-xl font-bold text-success">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
            {photo ? `Photo accepted. +${reward} points.` : `Correct! +${reward} points.`}
          </p>
        ) : photo ? (
          <PhotoUpload item={item} />
        ) : outOfTries ? (
          <p className="mt-3 text-lg text-danger">No tries left for this question.</p>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-wrap gap-3">
            <input
              className={`${fieldClass} min-w-48 flex-1`}
              aria-label={`Answer for ${item.title}`}
              placeholder="Your answer"
              value={answer}
              maxLength={200}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={!state.game.timersRunning}
            />
            <Button type="submit" disabled={!state.game.timersRunning || answer.trim() === ''}>
              Submit
            </Button>
            <p className="w-full text-base text-ink-muted">
              Tries left: {item.attemptsLeft} of {state.settings.inbox.answerAttempts}
            </p>
          </form>
        )}
        {photo && (
          <p className="mt-3 text-base text-ink-muted">
            Only the facilitators see this photo. It is deleted automatically after{' '}
            {state.settings.inbox.photoRetentionDays} days.
          </p>
        )}
      </div>
    </Card>
  );
}

// The team photo: pick a picture (or take one on a phone). It is accepted at once.
function PhotoUpload({ item }: { item: PlayerInboxView }) {
  const { state, act, uploadPhoto } = useGame();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const open = state.game.timersRunning;

  async function send(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    await act(null, () => uploadPhoto(item.id, file));
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="mt-4">
      {item.photoStatus === 'REJECTED' && (
        <p className="mb-3 text-lg text-danger">
          Your photo was not accepted. You can upload a new one.
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        aria-label={`Photo for ${item.title}`}
        onChange={(e) => void send(e.target.files?.[0])}
        disabled={!open || busy}
      />
      <Button onClick={() => input.current?.click()} disabled={!open || busy}>
        <Upload className="h-5 w-5" aria-hidden />
        {busy ? 'Uploading…' : 'Upload photo'}
      </Button>
      <p className="mt-2 text-base text-ink-muted">PNG, JPG, WebP or GIF, up to 5 MB.</p>
    </div>
  );
}
