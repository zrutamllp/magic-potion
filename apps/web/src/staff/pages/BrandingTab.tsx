import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import type { AdminGame, GameSettings } from '@magic-potion/shared';
import { PotionBottle } from '../../player/ui/PotionBottle';
import { useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, inputClass, useAction } from '../ui';
import type { GameTabProps } from './GamePage';

// Client name, logo, colours and intro video. Players see these in the Lobby and the game.

type Branding = GameSettings['branding'];
const HEX = /^#[0-9a-fA-F]{6}$/;

export function BrandingTab({ game, onChange }: GameTabProps) {
  const { api } = useStaff();
  const [branding, setBranding] = useState<Branding>(game.settings.branding);
  const [videoText, setVideoText] = useState(game.settings.branding.introVideoUrl ?? '');
  const action = useAction();
  const upload = useAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = game.locked;

  function patch(p: Partial<Branding>) {
    setBranding((b) => ({ ...b, ...p }));
    action.clear();
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    const result = await upload.run(
      () => api.upload<{ url: string }>('/uploads/logo', file),
      'Logo uploaded. Save to use it.',
    );
    if (result) patch({ logoUrl: result.url });
    if (fileInput.current) fileInput.current.value = '';
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const video = videoText.trim();
    if (video && !/^https:\/\/\S+$/.test(video)) {
      action.setError('The intro video must be a web address starting with https://');
      return;
    }
    if (!HEX.test(branding.primaryColor) || !HEX.test(branding.accentColor)) {
      action.setError('Colours must look like #7c3aed.');
      return;
    }
    const settings = { ...game.settings, branding: { ...branding, introVideoUrl: video || null } };
    const updated = await action.run(
      () => api.put<AdminGame>(`/games/${game.id}/settings`, { settings }),
      'Branding saved.',
    );
    if (updated) onChange(updated);
  }

  return (
    <form onSubmit={save} className="grid grid-cols-[1fr_24rem] items-start gap-5">
      <fieldset disabled={locked} className="flex flex-col gap-4">
        <Panel title="Client">
          <label className="block font-semibold">
            Client name
            <input
              className={`${inputClass} mt-1`}
              value={branding.clientName}
              onChange={(e) => patch({ clientName: e.target.value })}
              maxLength={100}
              placeholder="Shown to players instead of “Magic Potion”"
            />
          </label>
          <div className="mt-4">
            <p className="font-semibold">Logo</p>
            <p className="text-sm text-ink-muted">
              PNG, JPG, WebP or GIF, up to 5 MB. A square logo looks best. The file is saved under a
              random name with its hidden details (camera, place, author) removed.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-16 w-16 items-center justify-center rounded-xl border border-line bg-page">
                {branding.logoUrl ? (
                  <img
                    src={branding.logoUrl}
                    alt="Client logo"
                    className="h-14 w-14 object-contain"
                  />
                ) : (
                  <span className="text-xs text-ink-muted">No logo</span>
                )}
              </span>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                aria-label="Logo file"
                onChange={(e) => void uploadLogo(e.target.files?.[0])}
              />
              <SmallButton
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={upload.busy || locked}
              >
                <ImageUp className="h-4 w-4" aria-hidden />
                {upload.busy ? 'Uploading…' : branding.logoUrl ? 'Replace logo' : 'Upload logo'}
              </SmallButton>
              {branding.logoUrl && (
                <SmallButton
                  variant="outline"
                  tone="danger"
                  onClick={() => patch({ logoUrl: null })}
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </SmallButton>
              )}
            </div>
            <div className="mt-1">
              <Status ok={upload.done} error={upload.error} />
            </div>
          </div>
        </Panel>
        <Panel title="Colours">
          <div className="grid grid-cols-2 gap-4">
            <ColourField
              label="Main colour"
              help="Buttons and highlights."
              value={branding.primaryColor}
              onChange={(primaryColor) => patch({ primaryColor })}
            />
            <ColourField
              label="Second colour"
              help="The potion and small accents."
              value={branding.accentColor}
              onChange={(accentColor) => patch({ accentColor })}
            />
          </div>
        </Panel>
        <Panel title="Intro video">
          <label className="block font-semibold">
            Video web address (optional)
            <input
              className={`${inputClass} mt-1`}
              value={videoText}
              onChange={(e) => {
                setVideoText(e.target.value);
                action.clear();
              }}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </label>
          <p className="mt-1 text-sm text-ink-muted">Played in the Lobby before the game starts.</p>
        </Panel>
        <div className="flex items-center gap-3">
          <SmallButton type="submit" disabled={locked || action.busy}>
            {action.busy ? 'Saving…' : 'Save branding'}
          </SmallButton>
          <Status ok={action.done} error={action.error} />
        </div>
      </fieldset>
      <Preview branding={branding} />
    </form>
  );
}

function ColourField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <p className="text-sm text-ink-muted">{help}</p>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-line bg-page"
        />
        <input
          aria-label={`${label} code`}
          className={`${inputClass} w-28 font-mono ${HEX.test(value) ? '' : 'border-danger'}`}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7}
        />
      </div>
    </div>
  );
}

// A small copy of the player sidebar and a button, in the chosen colours.
function Preview({ branding }: { branding: Branding }) {
  const style = {
    '--color-brand': HEX.test(branding.primaryColor) ? branding.primaryColor : undefined,
    '--color-brand-soft': HEX.test(branding.primaryColor)
      ? `color-mix(in srgb, ${branding.primaryColor} 78%, white)`
      : undefined,
    '--color-accent': HEX.test(branding.accentColor) ? branding.accentColor : undefined,
  } as CSSProperties;
  return (
    <Panel title="Preview" className="sticky top-4">
      <div style={style} className="overflow-hidden rounded-xl border border-line bg-sidebar">
        <div className="flex items-center gap-3 border-b border-line p-4">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="h-12 w-12 rounded-xl object-contain" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent">
              <PotionBottle percent={70} size="sm" className="w-7" />
            </span>
          )}
          <span className="text-xl font-extrabold">{branding.clientName || 'Magic Potion'}</span>
        </div>
        <div className="flex items-center gap-4 p-4">
          <PotionBottle percent={55} size="sm" />
          <div className="flex flex-col gap-2">
            <span className="rounded-xl bg-brand px-4 py-2 text-center font-bold text-white">
              Start Task
            </span>
            <span className="font-bold text-brand-soft">Potion 55%</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-muted">This is how players see your brand.</p>
    </Panel>
  );
}
