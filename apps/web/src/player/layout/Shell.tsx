import { useEffect, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Coins,
  House,
  Inbox as InboxIcon,
  LogOut,
  MessagesSquare,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { GamePhase } from '@magic-potion/shared';
import { formatMs, money } from '../../lib/time';
import { ownRow, useGame } from '../GameContext';
import type { Tab } from '../router';
import { TONE_BG, TONE_TEXT, type Tone } from '../ui/basics';
import { PotionBottle, potionLabel } from '../ui/PotionBottle';

// The in-game layout: sidebar on wide screens, tab bar on narrow ones (one navigation,
// GAME_RULES section 14), a top bar with the team, timer, funds and score, and the potion.

interface NavItem {
  tab: Tab;
  label: string;
  icon: LucideIcon;
  tone: Tone;
}

export const NAV: NavItem[] = [
  { tab: 'home', label: 'Home', icon: House, tone: 'brand' },
  { tab: 'chat', label: 'Chat', icon: MessagesSquare, tone: 'info' },
  { tab: 'funds', label: 'Funds', icon: Coins, tone: 'success' },
  { tab: 'inbox', label: 'Inbox', icon: InboxIcon, tone: 'warning' },
  { tab: 'leaderboard', label: 'Leaderboard', icon: Trophy, tone: 'alert' },
  { tab: 'rules', label: 'Rules', icon: BookOpen, tone: 'brand' },
];

export const PHASE_LABEL: Record<GamePhase, string> = {
  LOBBY: 'Lobby',
  ROUND1: 'Round 1',
  PAUSE: 'Pause',
  ROUND2: 'Round 2',
  REVEAL: 'Reveal',
};

function latestChatAt(feed: ReturnType<typeof useGame>['feed']): number {
  return feed.reduce((max, f) => (f.kind === 'chat' ? Math.max(max, f.at) : max), 0);
}

export function Shell({
  children,
  onLogOut,
}: {
  children: ReactNode;
  onLogOut: (message: string | null) => void;
}) {
  const game = useGame();
  const { state, feed, route } = game;
  const activeTab: Tab = route.tab === 'task' ? 'home' : route.tab;
  // New chat lines from other teams since the chat tab was last open.
  const [chatSeenAt, setChatSeenAt] = useState(() => latestChatAt(feed));
  const unreadChat =
    activeTab === 'chat'
      ? 0
      : feed.filter((f) => f.kind === 'chat' && f.teamId !== state.team.id && f.at > chatSeenAt)
          .length;

  const counts: Partial<Record<Tab, number>> = {
    chat: unreadChat,
    funds: state.pendingRequests.filter((r) => r.direction === 'incoming').length,
    inbox: state.inbox.filter((i) => i.kind !== 'ALERT' && !i.done).length,
  };

  function navigate(tab: Tab) {
    if (activeTab === 'chat' || tab === 'chat') setChatSeenAt(latestChatAt(feed));
    game.go({ tab });
  }

  return (
    <div className="min-h-screen">
      <Sidebar activeTab={activeTab} counts={counts} onNavigate={navigate} onLogOut={onLogOut} />
      <div className="pb-28 lg:ml-72 lg:pb-0">
        <TopBar />
        <main className="mx-auto max-w-6xl p-4 md:p-6 lg:p-8">
          <NoticeBar />
          {children}
        </main>
      </div>
      <TabBar activeTab={activeTab} counts={counts} onNavigate={navigate} />
    </div>
  );
}

function Brand() {
  const { branding } = useGame().state;
  return (
    <div className="flex items-center gap-3">
      {branding.logoUrl ? (
        <img src={branding.logoUrl} alt="" className="h-12 w-12 rounded-xl object-contain" />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent">
          <PotionBottle percent={70} size="sm" className="w-7" />
        </span>
      )}
      <span className="text-xl leading-tight font-extrabold">
        {branding.clientName || 'Magic Potion'}
      </span>
    </div>
  );
}

function Badge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto min-w-7 rounded-full bg-danger px-2 text-center text-sm font-bold text-white">
      {count}
    </span>
  );
}

function Sidebar({
  activeTab,
  counts,
  onNavigate,
  onLogOut,
}: {
  activeTab: Tab;
  counts: Partial<Record<Tab, number>>;
  onNavigate: (tab: Tab) => void;
  onLogOut: (message: string | null) => void;
}) {
  const { potion } = useGame().state;
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-line bg-sidebar lg:flex">
      <div className="border-b border-line p-5">
        <Brand />
      </div>
      <nav className="flex flex-col gap-1 p-4" aria-label="Main">
        {NAV.map((item) => {
          const active = item.tab === activeTab;
          const Icon = item.icon;
          return (
            <button
              key={item.tab}
              onClick={() => onNavigate(item.tab)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-lg font-semibold transition ${
                active
                  ? `${TONE_BG[item.tone]} ${TONE_TEXT[item.tone]} border-current/40`
                  : 'border-transparent text-ink hover:bg-card-raised'
              }`}
            >
              <Icon className="h-6 w-6" aria-hidden />
              {item.label}
              <Badge count={counts[item.tab]} />
            </button>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-line p-4">
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-card p-3">
          <PotionBottle percent={potion.percent} size="sm" className="w-14" />
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-wider text-ink-muted uppercase">
              Magic Potion
            </p>
            <p className="nums text-3xl font-extrabold text-accent">
              {potionLabel(potion.percent)}
            </p>
            <p className="text-sm text-ink-muted">
              {potion.completedTeams} of {potion.totalTeams} teams done
            </p>
          </div>
        </div>
        <button
          onClick={() => onLogOut(null)}
          className="mt-3 flex items-center gap-2 text-ink-muted hover:text-ink"
        >
          <LogOut className="h-4 w-4" aria-hidden /> Log out
        </button>
      </div>
    </aside>
  );
}

function TabBar({
  activeTab,
  counts,
  onNavigate,
}: {
  activeTab: Tab;
  counts: Partial<Record<Tab, number>>;
  onNavigate: (tab: Tab) => void;
}) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-line bg-sidebar lg:hidden"
    >
      {NAV.map((item) => {
        const active = item.tab === activeTab;
        const Icon = item.icon;
        return (
          <button
            key={item.tab}
            onClick={() => onNavigate(item.tab)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-1 py-2.5 text-xs font-semibold ${
              active ? TONE_TEXT[item.tone] : 'text-ink-muted'
            }`}
          >
            <Icon className="h-6 w-6" aria-hidden />
            {item.label}
            {counts[item.tab] ? (
              <span className="absolute top-1 right-[22%] h-3 w-3 rounded-full bg-danger" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

// Shared by the in-game top bar and the Lobby, Pause and Reveal screens.
export function PhaseClock({ big = false }: { big?: boolean }) {
  const { state, phaseMsLeft } = useGame();
  const { phase, frozen } = state.game;
  const left = phaseMsLeft();
  return (
    <div className="flex flex-col items-center leading-tight">
      <span
        className={`text-sm font-bold tracking-wider uppercase ${frozen ? 'text-warning' : 'text-ink-muted'}`}
      >
        {frozen ? 'Paused' : PHASE_LABEL[phase]}
      </span>
      {left !== null && (
        <span
          className={`nums font-extrabold ${big ? 'text-6xl' : 'text-4xl'} ${
            frozen ? 'text-warning' : left < 5 * 60_000 ? 'text-alert' : 'text-success'
          }`}
          aria-label="Time left"
        >
          {formatMs(left)}
        </span>
      )}
    </div>
  );
}

export function ConnectionDot() {
  const { status } = useGame();
  const look = {
    online: ['bg-success', 'Connected'],
    connecting: ['bg-warning', 'Connecting'],
    offline: ['bg-danger', 'Reconnecting…'],
  }[status];
  return (
    <span className="flex items-center gap-2 text-sm text-ink-muted" title={look[1]}>
      <span className={`h-3 w-3 rounded-full ${look[0]}`} />
      <span className={status === 'online' ? 'sr-only' : ''}>{look[1]}</span>
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-sm font-bold tracking-wider text-ink-muted uppercase">{label}</span>
      <span className={`nums text-2xl font-extrabold ${TONE_TEXT[tone]}`}>{value}</span>
    </div>
  );
}

function TopBar() {
  const { state } = useGame();
  const row = ownRow(state);
  const showRank = state.game.phase !== 'ROUND1' && row?.rank != null;
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-page/95 px-4 py-3 backdrop-blur md:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <span className="lg:hidden">
          <PotionBottle percent={state.potion.percent} size="sm" />
        </span>
        <div className="leading-tight">
          <span className="text-sm font-bold tracking-wider text-ink-muted uppercase">Team</span>
          <p className="text-2xl font-extrabold">{state.team.name}</p>
        </div>
      </div>
      <div className="mx-auto">
        <PhaseClock />
      </div>
      <div className="flex items-center gap-6">
        <Stat
          label="Task Funds"
          value={money(state.team.taskFunds)}
          tone={state.team.taskFunds < 0 ? 'danger' : 'success'}
        />
        {row && <Stat label="Score" value={money(row.score)} tone="warning" />}
        {showRank && <Stat label="Rank" value={`#${row.rank}`} tone="alert" />}
        <ConnectionDot />
      </div>
    </header>
  );
}

// The answer to the last action ("Funds sent.", or why not). Disappears after a few seconds.
function NoticeBar() {
  const { notice, dismissNotice } = useGame();
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(dismissNotice, 6000);
    return () => clearTimeout(id);
    // dismissNotice changes every render; the notice id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.id]);
  if (!notice) return null;
  return (
    <div
      role="status"
      className={`mb-5 flex items-center gap-3 rounded-xl border p-4 text-lg font-semibold ${
        notice.ok
          ? 'border-success/50 bg-success/15 text-success'
          : 'border-danger/60 bg-danger/15 text-danger'
      }`}
    >
      <span className="flex-1">{notice.text}</span>
      <button onClick={dismissNotice} aria-label="Close message">
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
