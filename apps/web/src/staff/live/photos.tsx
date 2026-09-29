import { useState } from 'react';
import { ExternalLink, ImageOff } from 'lucide-react';
import type { StaffTeamView } from '@magic-potion/shared';
import { useStaff } from '../StaffContext';
import { Dialog, SmallButton, inputClass, useAction } from '../ui';
import { useLiveView } from './context';

// Team photos (GAME_RULES section 7): accepted at once; staff check them here and can reject
// one, which takes its 1,000 away until the team sends a new photo. Staff only.

export function TeamPhoto({ team, size = 'lg' }: { team: StaffTeamView; size?: 'sm' | 'lg' }) {
  const [rejecting, setRejecting] = useState(false);
  const photo = team.photo;
  if (!photo) {
    return <p className="text-sm text-ink-muted">No photo yet.</p>;
  }
  const rejected = photo.status === 'REJECTED';
  return (
    <figure className="space-y-2">
      {photo.url ? (
        <a href={photo.url} target="_blank" rel="noreferrer" title="Open full size">
          <img
            src={photo.url}
            alt={`Team photo of ${team.name}`}
            className={`w-full rounded-xl border object-cover ${
              rejected ? 'border-danger/60 opacity-50' : 'border-line'
            } ${size === 'lg' ? 'max-h-60' : 'aspect-video'}`}
          />
        </a>
      ) : (
        <div className="flex aspect-video items-center justify-center gap-2 rounded-xl border border-line text-sm text-ink-muted">
          <ImageOff className="h-4 w-4" aria-hidden /> Photo deleted (the keep time passed)
        </div>
      )}
      <figcaption className="flex items-center justify-between gap-2 text-sm">
        <span>
          {size === 'sm' && <strong>{team.name} · </strong>}
          <span className={rejected ? 'text-danger' : 'text-success'}>
            {rejected ? 'Rejected: waiting for a new photo' : 'Accepted'}
          </span>
        </span>
        <span className="flex gap-1">
          {photo.url && size === 'lg' && (
            <a
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs font-semibold hover:bg-card-raised"
            >
              <ExternalLink className="h-3 w-3" aria-hidden /> Full size
            </a>
          )}
          {!rejected && photo.url && (
            <SmallButton
              variant="outline"
              tone="danger"
              className="px-2 py-0.5 text-xs"
              onClick={() => setRejecting(true)}
            >
              Reject
            </SmallButton>
          )}
        </span>
      </figcaption>
      {rejecting && <RejectPhotoDialog team={team} onClose={() => setRejecting(false)} />}
    </figure>
  );
}

function RejectPhotoDialog({ team, onClose }: { team: StaffTeamView; onClose: () => void }) {
  const { api } = useStaff();
  const { gameId } = useLiveView();
  const [reason, setReason] = useState('');
  const action = useAction();
  async function submit() {
    const done = await action.run(() =>
      api.post(`/games/${gameId}/live/teams/${team.id}/photo/reject`, { reason }),
    );
    if (done !== undefined) onClose();
  }
  return (
    <Dialog
      title={`Reject the photo of ${team.name}?`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Reject photo"
      tone="danger"
      busy={action.busy}
      canSubmit={reason.trim() !== ''}
      error={action.error}
    >
      <p>
        The team loses the bonus points for it and can upload a new photo. The team sees only that
        the photo was not accepted.
      </p>
      <label className="block font-semibold">
        Reason (staff only)
        <input
          className={`${inputClass} mt-1`}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Not the whole team"
          autoFocus
        />
      </label>
    </Dialog>
  );
}

// Every team's photo at once, so staff can check 20 photos quickly.
export function PhotoGrid() {
  const { state } = useLiveView();
  const withPhoto = state.teams.filter((t) => t.photo);
  if (withPhoto.length === 0) {
    return <p className="py-2 text-sm text-ink-muted">No team photos yet.</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-3 py-1">
      {withPhoto.map((t) => (
        <li key={t.id}>
          <TeamPhoto team={t} size="sm" />
        </li>
      ))}
    </ul>
  );
}
