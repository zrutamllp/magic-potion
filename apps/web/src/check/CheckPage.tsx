import { useEffect, useState } from 'react';
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { SOCKET_URL } from '../config';
import { Button, Card, TONE_TEXT, type Tone } from '../player/ui/basics';
import { parseBrowser } from './browser';
import { runChecks } from './runChecks';
import {
  OVERALL_TEXT,
  addressesToAllow,
  emptyResults,
  overall,
  rows,
  summaryText,
  type CheckResults,
  type Hosts,
  type Overall,
  type Status,
} from './verdict';

// The public connection check (/check). No login, nothing stored, never joins a game.
// Generic on purpose: no client name or branding.

const STATUS: Record<Status, { icon: LucideIcon; tone: Tone; label: string }> = {
  pass: { icon: CircleCheck, tone: 'success', label: 'OK' },
  warn: { icon: CircleAlert, tone: 'warning', label: 'Warning' },
  fail: { icon: CircleX, tone: 'danger', label: 'Problem' },
  info: { icon: Info, tone: 'info', label: 'Information' },
  running: { icon: LoaderCircle, tone: 'muted', label: 'Checking' },
};

const OVERALL: Record<Overall, { status: Status; detail: string }> = {
  ready: { status: 'pass', detail: 'Everything the game needs works on this network.' },
  limited: {
    status: 'warn',
    detail: 'The game will work, but not at its best. See the details below.',
  },
  blocked: {
    status: 'fail',
    detail: 'The game cannot connect from this network. Send this page to your IT team.',
  },
  checking: { status: 'running', detail: 'This takes about 20 seconds.' },
};

function apiHost(): string {
  try {
    return new URL(SOCKET_URL).host;
  } catch {
    return SOCKET_URL;
  }
}

export function CheckPage() {
  const [results, setResults] = useState<CheckResults>(() =>
    emptyResults(parseBrowser(navigator.userAgent)),
  );
  const [picturesHost, setPicturesHost] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  // Goes up for "Run again"; each round runs the checks once.
  const [round, setRound] = useState(0);

  useEffect(() => {
    let current = true;
    runChecks(({ picturesHost: host, ...patch }) => {
      if (!current) return;
      if (host !== undefined) setPicturesHost(host);
      setResults((r) => ({ ...r, ...patch }));
    }).finally(() => {
      if (current) setRunning(false);
    });
    return () => {
      current = false;
    };
  }, [round]);

  function runAgain() {
    setResults(emptyResults(parseBrowser(navigator.userAgent)));
    setPicturesHost(null);
    setCopied(null);
    setRunning(true);
    setRound((n) => n + 1);
  }

  const hosts: Hosts = { site: window.location.host, api: apiHost(), pictures: picturesHost };
  const result = overall(results);
  const allow = running ? [] : addressesToAllow(results, hosts);
  const top = OVERALL[result];
  const TopIcon = STATUS[top.status].icon;
  const topTone = STATUS[top.status].tone;

  async function copy() {
    const text = summaryText(results, hosts, new Date());
    try {
      await navigator.clipboard.writeText(text);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-extrabold sm:text-3xl">
        Magic Potion Challenge – Connection check
      </h1>
      <p className="mt-2 text-ink-muted">
        This page checks that the game will work on your network and browser. It does not need a
        login and stores nothing.
      </p>

      <Card className="mt-6" tone={topTone}>
        <div className="flex items-start gap-3" role="status" aria-live="polite">
          <TopIcon
            aria-hidden
            className={`mt-1 h-8 w-8 shrink-0 ${TONE_TEXT[topTone]} ${result === 'checking' ? 'animate-spin' : ''}`}
          />
          <div>
            <p className={`text-2xl font-extrabold ${TONE_TEXT[topTone]}`}>
              {OVERALL_TEXT[result]}
            </p>
            <p className="mt-1">{top.detail}</p>
            <p className="mt-1 text-ink-muted">Share these results with your event organiser.</p>
          </div>
        </div>

        {allow.length > 0 && (
          <div className="mt-4">
            <p className="font-semibold">Addresses to allow:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 break-all">
              {allow.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => void copy()} disabled={running}>
            Copy results
          </Button>
          <Button variant="outline" tone="muted" onClick={runAgain} disabled={running}>
            Run again
          </Button>
        </div>
        {copied === 'yes' && (
          <p className="mt-3 text-success">Copied. Paste it into an email or chat.</p>
        )}
        {copied === 'no' && (
          <div className="mt-3">
            <p className="text-warning">Could not copy. Select the text below and copy it.</p>
            <textarea
              readOnly
              aria-label="Results"
              className="mt-2 h-48 w-full rounded-lg border border-line bg-page p-2 font-mono text-sm"
              value={summaryText(results, hosts, new Date())}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        )}
      </Card>

      <ul className="mt-6 space-y-3" aria-label="Checks">
        {rows(results, hosts).map((row) => {
          const s = STATUS[row.status];
          const Icon = s.icon;
          return (
            <li
              key={row.key}
              data-testid={`check-${row.key}`}
              data-status={row.status}
              className="flex items-start gap-3 rounded-xl border border-line bg-card p-4"
            >
              <Icon
                aria-label={s.label}
                className={`mt-0.5 h-6 w-6 shrink-0 ${TONE_TEXT[s.tone]} ${row.status === 'running' ? 'animate-spin' : ''}`}
              />
              <div className="min-w-0">
                <p className="font-semibold">{row.label}</p>
                <p className="text-ink-muted break-words">{row.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
