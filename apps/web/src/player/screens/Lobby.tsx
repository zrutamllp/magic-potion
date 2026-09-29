import { LogOut } from 'lucide-react';
import { useGame } from '../GameContext';
import { ConnectionDot } from '../layout/Shell';
import { Card } from '../ui/basics';
import { PotionMeter } from '../ui/PotionBottle';
import { RulesContent } from './Rules';

// The Lobby: teams log in, watch the intro video and read the rules until the facilitator
// starts the game.

// YouTube and Vimeo links play in their own player; anything else as a plain video file.
export function videoEmbed(url: string): { kind: 'iframe' | 'video'; src: string } {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (yt) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}` };
  return { kind: 'video', src: url };
}

// Without onLogOut (staff "View as team") there is no Log out button.
export function Lobby({ onLogOut }: { onLogOut?: (message: string | null) => void }) {
  const { state } = useGame();
  const { branding, potion } = state;
  const video = branding.introVideoUrl ? videoEmbed(branding.introVideoUrl) : null;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="flex flex-wrap items-center gap-4">
        {branding.logoUrl && (
          <img src={branding.logoUrl} alt="" className="h-12 w-12 rounded-xl object-contain" />
        )}
        <span className="text-xl font-extrabold">{branding.clientName || 'Magic Potion'}</span>
        <span className="ml-auto">
          <ConnectionDot />
        </span>
        {onLogOut && (
          <button
            onClick={() => onLogOut(null)}
            className="flex items-center gap-2 text-ink-muted hover:text-ink"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        )}
      </header>

      <section className="mt-6 flex flex-col items-center gap-8 rounded-3xl border border-brand/50 bg-gradient-to-br from-brand/40 via-card to-accent/20 p-8 md:flex-row">
        <div className="flex-1">
          <p className="text-lg font-bold tracking-wider text-ink-muted uppercase">Welcome</p>
          <h1 className="mt-1 text-5xl font-extrabold">{state.team.name}</h1>
          <p className="mt-4 text-2xl">The Magic Potion Challenge is about to begin.</p>
          <p className="mt-6 inline-flex items-center gap-3 rounded-full bg-page/60 px-5 py-2 text-xl font-semibold">
            <span className="h-3 w-3 animate-pulse rounded-full bg-warning" />
            Waiting for the facilitator to start
          </p>
        </div>
        <PotionMeter
          percent={potion.percent}
          completedTeams={potion.completedTeams}
          totalTeams={potion.totalTeams}
          size="lg"
        />
      </section>

      {video && (
        <Card className="mt-6 overflow-hidden p-0">
          {video.kind === 'iframe' ? (
            <iframe
              title="Introduction video"
              src={video.src}
              className="aspect-video w-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video controls src={video.src} className="aspect-video w-full bg-black">
              <track kind="captions" />
            </video>
          )}
        </Card>
      )}

      <h2 className="mt-10 mb-4 text-3xl font-extrabold">How to play</h2>
      <RulesContent settings={state.settings} />
    </div>
  );
}
