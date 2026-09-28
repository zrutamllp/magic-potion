import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { z } from 'zod';
import {
  AUTH_ERRORS,
  ChatSendSchema,
  FundsRequestSchema,
  FundsSendSchema,
  InboxAnswerSchema,
  RequestIdSchema,
  TaskIdSchema,
  TaskSubmitSchema,
  type Ack,
  type AuthErrorCode,
  type ClientToServerEvents,
  type EngineResult,
  type FeedItem,
  type ServerToClientEvents,
} from '@magic-potion/shared';
import type { AuthService } from '../auth/service';
import type { StaffAccount } from '../auth/store';
import type { Clock } from '../engine/clock';
import type { GameEngine } from '../engine/engine';
import type { EngineEvent } from '../engine/events';
import {
  buildFeed,
  buildPlayerState,
  buildStaffState,
  canSee,
  feedChanges,
  feedTeams,
  type Viewer,
} from './views';

// Socket.IO: the server pushes state, browsers send actions.
//
// Rooms: "game:<id>" (every team in a game), "team:<id>", and "session:<tokenId>" (to end one
// login). Staff sockets are kept in a list per game, because co-facilitators see only their
// assigned teams and so each gets its own filtered state.
//
// On every connection the browser gets the full state, so a refresh or reconnect never loses
// anything and never resets a timer: timers come from the engine's stored timestamps.

export interface EngineSource {
  get(gameId: string): Promise<GameEngine>;
  // Optional, so tests with a fixed engine can leave it out.
  evict?(gameId: string): Promise<boolean>;
}

export interface RealtimeOptions {
  auth: AuthService;
  engines: EngineSource;
  clock: Clock;
  clientOrigins: string[];
  devTools: boolean;
}

type TeamData = { kind: 'team'; teamId: string; gameId: string; tokenId: string };
type StaffData = {
  kind: 'staff';
  staff: StaffAccount;
  gameId: string;
  // Null for the main admin (every team).
  teams: ReadonlySet<string> | null;
};
type SocketData = TeamData | StaffData;
type IoServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

function authError(code: AuthErrorCode): Error {
  const error = new Error(AUTH_ERRORS[code]) as Error & { data?: unknown };
  error.data = { code };
  return error;
}

function toAck(result: EngineResult<unknown>): Ack {
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, code: result.code, message: result.message };
}

export class Realtime {
  private io: IoServer | null = null;
  // Engines this layer listens to, by game id.
  private readonly engines = new Map<string, GameEngine>();
  // Open sockets per team, for the "online" dot on the staff screen.
  private readonly online = new Map<string, number>();
  private readonly staffSockets = new Map<string, Set<IoSocket>>();
  readonly auth: AuthService;

  constructor(private readonly opts: RealtimeOptions) {
    this.auth = opts.auth;
    opts.auth.onSessionsEnded((tokenIds, code) => this.endSessions(tokenIds, code));
  }

  // The engine for a game, with this layer listening to its events. Use this everywhere
  // (REST included), so every change reaches the browsers.
  async engine(gameId: string): Promise<GameEngine> {
    const engine = await this.opts.engines.get(gameId);
    if (this.engines.get(gameId) !== engine) {
      this.engines.set(gameId, engine);
      engine.onEvents((events) => this.push(gameId, engine, events));
    }
    return engine;
  }

  // After the admin changes a Lobby game: load it again and reconnect its browsers, so they
  // get the new settings and teams. Browsers reconnect by themselves and reload full state;
  // a team that was deleted is refused at that point and sent back to the login.
  async reloadGame(gameId: string): Promise<void> {
    if (this.opts.engines.evict && !(await this.opts.engines.evict(gameId))) return;
    this.engines.delete(gameId);
    this.io?.in(`game:${gameId}`).disconnectSockets();
    for (const socket of this.staffSockets.get(gameId) ?? []) socket.disconnect();
  }

  attach(httpServer: HttpServer): IoServer {
    const io: IoServer = new Server(httpServer, {
      cors: { origin: this.opts.clientOrigins, credentials: true },
      // Both transports stay on: some corporate networks block WebSockets.
      transports: ['polling', 'websocket'],
      maxHttpBufferSize: 100_000,
    });
    io.use((socket, next) => {
      this.authenticate(socket).then(
        (data) => {
          socket.data = data;
          next();
        },
        (error: unknown) => next(error instanceof Error ? error : authError('NOT_LOGGED_IN')),
      );
    });
    io.on('connection', (socket) => {
      // The middleware above loaded the engine, so everything here runs at once and no early
      // message from the browser can arrive before its handler exists.
      const data = socket.data;
      const engine = this.engines.get(data.gameId);
      if (!engine) {
        socket.disconnect();
        return;
      }
      if (data.kind === 'team') this.onTeam(socket, data, engine);
      else this.onStaff(socket, data, engine);
    });
    this.io = io;
    return io;
  }

  async close(): Promise<void> {
    await this.io?.close();
    this.io = null;
  }

  // ---------- Connecting ----------

  private async authenticate(socket: IoSocket): Promise<SocketData> {
    const { token, as, gameId } = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    if (as === 'staff') {
      const result = await this.opts.auth.verifyStaff(token);
      if (!result.ok) throw authError(result.code);
      const staff = result.value;
      if (typeof gameId !== 'string') throw authError('GAME_NOT_FOUND');
      let teams: Set<string> | null = null;
      if (staff.role !== 'MAIN_ADMIN') {
        teams = new Set(await this.opts.auth.store.assignedTeamIds(staff.id, gameId));
        if (teams.size === 0) throw authError('NOT_ALLOWED');
      }
      await this.loadOrFail(gameId);
      return { kind: 'staff', staff, gameId, teams };
    }
    const result = await this.opts.auth.verifyTeam(token);
    if (!result.ok) throw authError(result.code);
    const { teamId, gameId: teamGameId, tokenId } = result.value;
    const engine = await this.loadOrFail(teamGameId);
    if (!engine.state.teams[teamId]) throw authError('NOT_LOGGED_IN');
    return { kind: 'team', teamId, gameId: teamGameId, tokenId };
  }

  private async loadOrFail(gameId: string): Promise<GameEngine> {
    try {
      return await this.engine(gameId);
    } catch (error) {
      console.error(`Could not load game ${gameId}:`, error);
      throw authError('GAME_NOT_FOUND');
    }
  }

  private onTeam(socket: IoSocket, data: TeamData, engine: GameEngine): void {
    const { teamId, gameId, tokenId } = data;
    void socket.join([`game:${gameId}`, `team:${teamId}`, `session:${tokenId}`]);
    this.online.set(teamId, (this.online.get(teamId) ?? 0) + 1);
    this.touch(tokenId);

    const viewer: Viewer = { kind: 'team', teamId };
    socket.emit('state:full', {
      state: buildPlayerState(engine, teamId, this.opts.clock.now()),
      feed: buildFeed(engine.state, viewer),
    });
    this.pushStaff(gameId, engine);

    const on = <S extends z.ZodType>(
      event: keyof ClientToServerEvents,
      schema: S,
      run: (e: GameEngine, p: z.infer<S>) => Promise<EngineResult<unknown>>,
    ) => {
      // Typed per event in the shared contract; checked here with zod either way.
      (socket as unknown as Socket).on(event, async (payload: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          ack({ ok: false, code: 'INVALID_REQUEST', message: AUTH_ERRORS.INVALID_REQUEST });
          return;
        }
        try {
          ack(toAck(await run(engine, parsed.data)));
        } catch (error) {
          console.error(`Socket action ${event} failed:`, error);
          ack({ ok: false, message: 'Something went wrong. Please try again.' });
        }
      });
    };

    on('chat:send', ChatSendSchema, (e, p) => e.sendChat(teamId, p.body));
    on('funds:send', FundsSendSchema, (e, p) => e.sendFunds(teamId, p.toTeamId, p.amount));
    on('funds:request', FundsRequestSchema, (e, p) =>
      e.requestFunds(teamId, p.payerTeamId, p.amount),
    );
    on('funds:accept', RequestIdSchema, (e, p) => e.acceptRequest(teamId, p.requestId));
    on('funds:decline', RequestIdSchema, (e, p) => e.declineRequest(teamId, p.requestId));
    on('funds:cancel', RequestIdSchema, (e, p) => e.cancelRequest(teamId, p.requestId));
    on('inbox:answer', InboxAnswerSchema, (e, p) => e.answerInbox(teamId, p.itemId, p.answer));
    on('task:start', TaskIdSchema, (e, p) => e.startTask(teamId, p.taskId));
    on('task:hint', TaskIdSchema, (e, p) => e.useHint(teamId, p.taskId));
    on('task:submit', TaskSubmitSchema, (e, p) => e.submit(teamId, p.taskId, p.submission));
    on('task:giveUp', TaskIdSchema, (e, p) => e.giveUp(teamId, p.taskId));

    socket.on('disconnect', () => {
      const left = (this.online.get(teamId) ?? 1) - 1;
      if (left <= 0) this.online.delete(teamId);
      else this.online.set(teamId, left);
      this.touch(tokenId);
      this.pushStaff(gameId, engine);
    });
  }

  private onStaff(socket: IoSocket, data: StaffData, engine: GameEngine): void {
    let set = this.staffSockets.get(data.gameId);
    if (!set) this.staffSockets.set(data.gameId, (set = new Set()));
    set.add(socket);
    socket.emit('staff:full', {
      state: this.staffState(engine, data),
      feed: buildFeed(engine.state, { kind: 'staff', teams: data.teams }),
    });
    socket.on('disconnect', () => set.delete(socket));
  }

  // ---------- Pushing ----------

  private staffState(engine: GameEngine, data: StaffData) {
    return buildStaffState(
      engine,
      data.staff,
      data.teams,
      (id) => this.online.has(id),
      this.opts.devTools,
      this.opts.clock.now(),
    );
  }

  private pushStaff(gameId: string, engine: GameEngine, feed: FeedItem[] = []): void {
    for (const socket of this.staffSockets.get(gameId) ?? []) {
      const data = socket.data as StaffData;
      socket.emit('staff:update', { state: this.staffState(engine, data) });
      const viewer: Viewer = { kind: 'staff', teams: data.teams };
      for (const item of feed) if (canSee(viewer, item)) socket.emit('feed:item', item);
    }
  }

  // After every saved change: fresh state to each connected team, new feed lines to the
  // teams allowed to see them, and fresh state to staff.
  private push(gameId: string, engine: GameEngine, events: readonly EngineEvent[]): void {
    const io = this.io;
    if (!io) return;
    const now = this.opts.clock.now();
    for (const teamId of Object.keys(engine.state.teams)) {
      if (!io.sockets.adapter.rooms.get(`team:${teamId}`)?.size) continue;
      io.to(`team:${teamId}`).emit('state:update', {
        state: buildPlayerState(engine, teamId, now),
      });
    }
    const feed = feedChanges(engine.state, events);
    for (const item of feed) {
      const rooms =
        item.kind === 'chat' ? [`game:${gameId}`] : feedTeams(item).map((t) => `team:${t}`);
      io.to(rooms).emit('feed:item', item);
    }
    this.pushStaff(gameId, engine, feed);
  }

  // Tells the browsers of ended logins why, then disconnects them. They do not reconnect.
  private endSessions(tokenIds: string[], code: AuthErrorCode): void {
    const io = this.io;
    if (!io) return;
    for (const tokenId of tokenIds) {
      const room = `session:${tokenId}`;
      io.to(room).emit('session:ended', { code, message: AUTH_ERRORS[code] });
      io.in(room).disconnectSockets();
    }
  }

  private touch(tokenId: string): void {
    this.opts.auth.store
      .touchTeamSession(tokenId)
      .catch((error: unknown) => console.error('Could not update lastSeenAt:', error));
  }
}
