# Magic Potion Challenge

A real-time, multiplayer team game for corporate learning events. 10 to 20 teams play at once, either in Zoom breakout rooms or at tables in one room. It teaches systems thinking: no team can finish alone, and if the shared potion is not full, nobody wins.

Read these before any work:
- `docs/GAME_RULES.md` is the source of truth for every rule and number.
- `docs/BUILD_PLAN.md` lists the phases. Work on one phase at a time, in order.
- `design/` holds the screen designs. Match the layout and style, but follow `docs/GAME_RULES.md` where the designs differ (see "Design corrections" in that file).

## Stack

| Part | Choice | Hosted on |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | Vercel (static build) |
| Backend | Node.js (LTS) + Express + Socket.IO + TypeScript | Render web service, Singapore region, one paid instance |
| Database | PostgreSQL via Prisma | Neon, AWS Singapore (aws-ap-southeast-1) |
| Tests | Vitest (unit), Playwright (end to end) | Run locally and in CI |

Monorepo using npm workspaces:

```
apps/web        React player app, admin panel, facilitator dashboard, projector view
apps/server     Express API, Socket.IO, game engine, scheduler
packages/shared Shared types, Socket.IO event names, zod schemas, default settings
docs/           Rules and build plan
design/         Screen designs (images)
```

## Non-negotiable principles

1. **The server decides everything that counts.** Answers, timers, funds, scores, chat limits, visibility and potion % are calculated only on the server. The frontend only displays state and sends player actions.
2. **Answers never reach the browser.** Task content has public fields (sent to players) and secret fields (answers, fragment values of other teams). Only public fields leave the server.
3. **Server time is the only clock.** Store start and end timestamps. A page refresh or reconnect must never reset or extend a timer.
4. **Every rule number is a setting.** No hard-coded funds, costs, timers or multipliers. Defaults live in `packages/shared/src/defaultSettings.ts`. Admins edit them per game. Scoring settings lock when a game starts.
5. **Every state change is saved.** Write to Postgres on every change, so the server can restart mid-game and rebuild state, timers and scheduled events from the database.
6. **Every manual change is audited.** Staff actions record who, when, what, before, after and reason.
7. **Scoring is pure and tested.** The scoring engine is a pure function with no I/O, covered by unit tests for every rule in `docs/GAME_RULES.md`. Never change scoring without updating the tests.
8. **Generic branding.** Client name, logo and colours come from game settings. Never hard-code a client brand.

## Working rules for Claude Code

- Start each phase in plan mode. Propose the plan, wait for approval, then build.
- Keep changes inside the current phase. List anything out of scope under "Later" in `docs/BUILD_PLAN.md`.
- Run tests and type checks before saying a phase is done.
- Commit at the end of each working step with a clear message.
- Never put secrets in code. Use `.env` files (ignored by git) and document every variable in `.env.example`.
- If a rule in `docs/GAME_RULES.md` is unclear or contradicts a design, stop and ask. Do not guess.
- Use plain, simple English in all player-facing text.
- Never run a database migration that deletes or rewrites existing data without asking me first and explaining what will be lost. Once we are live, back up the Neon database (create a Neon branch) before any migration.

## Environment variables

Server (`apps/server/.env`):
- `DATABASE_URL`: Neon pooled connection string (runtime)
- `DIRECT_URL`: Neon direct connection string (Prisma migrations)
- `JWT_SECRET`: long random string
- `CLIENT_ORIGIN`: the Vercel frontend URL, for CORS
- `PORT`: provided by Render
- `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`: creates the first main admin on first run
- `TEST_DATABASE_URL` (optional): the Neon `tests` branch, for the database tests; skipped when empty
- Neon branches: `dev` (default, local work), `tests` (database tests), `production` (live only; its connection strings live only in Render). The production database is marked inside itself and every script and test refuses it.

Web (`apps/web/.env`):
- `VITE_API_URL`: the Render backend URL
- `VITE_SOCKET_URL`: the Render backend URL

## Deployment notes

- Run exactly one Render instance. Game state and timers live in that process. Scaling out would need a Redis adapter, which is out of scope.
- Render restarts the instance on every deploy, which drops live connections. **Never deploy during a live event.**
- Socket.IO must keep its long-polling fallback switched on, because some corporate networks block WebSockets.
- The client must reconnect automatically and reload full state after any disconnect.
