import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  FeedItem,
  PlayerState,
  ProjectorState,
  ServerToClientEvents,
  StaffState,
} from '@magic-potion/shared';
import { SOCKET_URL } from '../config';
import { emitWithAck } from './emit';
import { upsertFeed } from './feed';
import { monotonicNow } from './time';

// The live connection. The server sends the full state on every (re)connect, then updates.
// Socket.IO reconnects by itself after a drop (long-polling first, so it also works on
// networks that block WebSockets), and the full state arrives again.

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
export type LiveStatus = 'connecting' | 'online' | 'offline';

// Login problems that need a new login rather than a retry.
const LOGIN_ENDED = new Set(['NOT_LOGGED_IN', 'SESSION_ENDED', 'SESSION_REPLACED', 'NOT_ALLOWED']);

export interface Snapshot<S> {
  state: S;
  // When it arrived, on the monotonic clock. Countdowns start from here.
  receivedAt: number;
}

export interface Live<S> {
  status: LiveStatus;
  snapshot: Snapshot<S> | null;
  feed: FeedItem[];
  // Set when the login has ended (another device logged in, staff reset it, or it expired).
  ended: string | null;
  // A connection problem worth showing, such as "That game was not found."
  problem: string | null;
  send: <E extends keyof ClientToServerEvents>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ) => Promise<Ack>;
}

function useLive<S>(
  auth: Record<string, string> | null,
  fullEvent: 'state:full' | 'staff:full' | 'projector:full',
  updateEvent: 'state:update' | 'staff:update' | 'projector:update',
  // Extra listeners for this kind of connection (the staff dashboard). Must be stable.
  extra?: (socket: Client) => void,
): Live<S> {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [snapshot, setSnapshot] = useState<Snapshot<S> | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [ended, setEnded] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const socketRef = useRef<Client | null>(null);
  const authKey = auth ? JSON.stringify(auth) : null;

  useEffect(() => {
    if (!authKey) return;
    const socket: Client = io(SOCKET_URL, {
      auth: JSON.parse(authKey) as Record<string, string>,
      transports: ['polling', 'websocket'],
    });
    // Callers remount this hook (React key) for a new login, so the state starts fresh.
    socketRef.current = socket;

    const onFull = (p: { state: S; feed: FeedItem[] }) => {
      setSnapshot({ state: p.state, receivedAt: monotonicNow() });
      setFeed(p.feed);
    };
    const onUpdate = (p: { state: S }) =>
      setSnapshot({ state: p.state, receivedAt: monotonicNow() });
    const on = socket.on.bind(socket) as (event: string, fn: (p: never) => void) => void;
    on(fullEvent, onFull);
    on(updateEvent, onUpdate);
    socket.on('feed:item', (item) => setFeed((f) => upsertFeed(f, item)));
    extra?.(socket);
    // Set when the login has ended, so the disconnect that follows is not retried.
    let loginEnded = false;
    socket.on('session:ended', (p) => {
      loginEnded = true;
      setEnded(p.message);
    });
    socket.on('connect', () => {
      setStatus('online');
      setProblem(null);
    });
    socket.on('disconnect', (reason) => {
      setStatus('offline');
      // The server closed the connection on purpose to reload the game (the admin changed it
      // in the Lobby). Socket.IO does not retry that by itself, so connect again for fresh state.
      if (reason === 'io server disconnect' && !loginEnded) socket.connect();
    });
    socket.on('connect_error', (error) => {
      setStatus('offline');
      const data = (error as Error & { data?: { code?: string } }).data;
      if (data?.code && LOGIN_ENDED.has(data.code)) {
        loginEnded = true;
        setEnded(error.message);
        socket.disconnect();
      } else if (data?.code) {
        // The server refused (for example an unknown game). Show why; it will not retry.
        setProblem(error.message);
      }
      // Otherwise the network is down: Socket.IO keeps retrying on its own.
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authKey, fullEvent, updateEvent, extra]);

  const send = useCallback<Live<S>['send']>((event, payload) => {
    const socket = socketRef.current;
    if (!socket) {
      return Promise.resolve({ ok: false, message: 'Not connected. Wait a moment and try again.' });
    }
    return emitWithAck(socket as unknown as Socket, event, payload);
  }, []);

  return { status, snapshot, feed, ended, problem, send };
}

export function useTeamLive(token: string | null): Live<PlayerState> {
  return useLive<PlayerState>(token ? { token, as: 'team' } : null, 'state:full', 'state:update');
}

export function useStaffLive(token: string | null, gameId: string | null): Live<StaffState> {
  return useLive<StaffState>(
    token && gameId ? { token, as: 'staff', gameId } : null,
    'staff:full',
    'staff:update',
  );
}

// The projector view (Phase 6D): read only, every team.
export function useProjectorLive(token: string | null, gameId: string | null) {
  return useLive<ProjectorState>(
    token && gameId ? { token, as: 'projector', gameId } : null,
    'projector:full',
    'projector:update',
  );
}

// "View as team": the team's own state and feed, exactly as the team receives them.
export interface WatchedTeam {
  teamId: string;
  snapshot: Snapshot<PlayerState>;
  feed: FeedItem[];
}

export interface DashboardLive extends Live<StaffState> {
  watched: WatchedTeam | null;
  // Goes up each time the server says the audit log changed.
  auditVersion: number;
}

// The facilitator dashboard's connection (Phase 6C).
export function useDashboardLive(token: string | null, gameId: string | null): DashboardLive {
  const [watched, setWatched] = useState<WatchedTeam | null>(null);
  const [auditVersion, setAuditVersion] = useState(0);
  const extra = useCallback((socket: Client) => {
    socket.on('staff:team', (p) => {
      const snapshot = { state: p.state, receivedAt: monotonicNow() };
      setWatched((w) => ({
        teamId: p.teamId,
        snapshot,
        feed: p.feed ?? (w?.teamId === p.teamId ? w.feed : []),
      }));
    });
    socket.on('staff:audit', () => setAuditVersion((v) => v + 1));
  }, []);
  const live = useLive<StaffState>(
    token && gameId ? { token, as: 'staff', gameId } : null,
    'staff:full',
    'staff:update',
    extra,
  );
  return { ...live, watched, auditVersion };
}
