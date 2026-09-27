# Magic Potion Challenge

A real-time multiplayer team game for corporate learning events. See `CLAUDE.md` for the overview, `docs/GAME_RULES.md` for the rules and `docs/BUILD_PLAN.md` for the build phases.

## Layout

```
apps/web         React + Vite + Tailwind (player app, admin, facilitator, projector)
apps/server      Express API, Socket.IO (src/realtime), auth (src/auth), Prisma, game engine (src/engine)
packages/shared  Types and zod schemas shared by web and server
```

## Requirements

- Node.js 22 (see `.nvmrc`)
- npm 10+

## Run locally

```sh
npm install
cp apps/server/.env.example apps/server/.env   # then fill in the values
cp apps/web/.env.example apps/web/.env
npm run dev
```

- Web: http://localhost:5173 (team login; it also shows "Server OK" when the API answers).
- Staff test page: http://localhost:5173/dev/staff
- API: http://localhost:4000/healthz

The server runs without a database until `DATABASE_URL` is set; `/healthz` then reports `"db": "not_configured"`.

## Scripts (run from the repo root)

| Script                 | What it does                           |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | Starts server and web with live reload |
| `npm run build`        | Production builds of server and web    |
| `npm run typecheck`    | TypeScript checks in every package     |
| `npm run lint`         | ESLint across the repo                 |
| `npm test`             | Vitest in every package                |
| `npm run format`       | Prettier (write)                       |
| `npm run format:check` | Prettier (check only, used in CI)      |

Database (from `apps/server`, once the Neon strings are in `.env`):

| Script                   | What it does                                     |
| ------------------------ | ------------------------------------------------ |
| `npm run prisma:migrate` | Create and apply a migration (uses `DIRECT_URL`) |
| `npm run prisma:deploy`  | Apply existing migrations (production)           |
| `npm run db:seed`        | Create the main admin, task list and demo game   |
| `npm run db:check`       | Print row counts and check wallet balances       |

First-time database setup:

1. `npm run prisma:migrate` applies the migrations to Neon.
2. `npm run db:seed` creates the main admin from `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`, the 12 task definitions, and a "Demo Game" with 4 teams (`TEAM1` to `TEAM4`) and the sample content pack. Team passwords are random and printed only once. Run it again any time; it leaves existing rows alone.
3. `npm run db:seed -- --reset-demo` deletes and recreates the demo game, printing new team passwords.

`DIRECT_URL` must be Neon's direct host (no `-pooler` in the host name). Migrations through the pooler can leave a lock behind.

## Test Phase 3 by hand (two teams, live)

The screens are plain test screens for now; the real player screens come in Phase 4.

1. In `apps/server/.env`, set `JWT_SECRET` (any string of 32+ characters) and `ENABLE_DEV_TOOLS=true`.
2. From `apps/server`, run `npm run db:seed -- --reset-demo`. Copy the 4 team codes and passwords it prints (they are shown only once).
3. From the repo root, run `npm run dev`.
4. **Window A:** open http://localhost:5173/dev/staff and log in with `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`. Choose "Demo Game" and press **Start**. It shows Round 1 and a 35:00 countdown.
5. **Window B:** open http://localhost:5173 in a new window and log in as `TEAM1`.
6. **Window C:** open http://localhost:5173 in another new window (or tab) and log in as `TEAM2`. Put B and C side by side. Each tab keeps its own login.
7. **Chat:** send "hello" from Team 1. It shows at once in B, C and the staff page. Team 1 now shows "Messages left: 4 of 5".
8. **Funds:** from Team 1, send 500 to Team 2. B shows Task Funds 9,500 and "Arriving in 0:59" counting down; C shows the incoming transfer. After 60 seconds C shows 10,500. A Team 3 window would not see this transfer line.
9. **Request:** Team 2 requests 300 from Team 1. Team 1 sees Accept and Decline. Accepting starts a new 60-second transfer.
10. **Potion:** on the staff page, press "Finish all 5 tasks" for Team 1. Both team windows show the potion at 25% straight away.
11. **Refresh:** refresh window B mid-countdown. It stays logged in and shows the same time left.
12. **Pause:** press Pause on the staff page. Countdowns stop, and chat and funds say "The game is paused. Please wait." Press Resume and they carry on from the same time.
13. **One login per team:** log in as `TEAM1` in another window. Window B shows "Your team logged in on another device."

To play again, run step 2 again (it makes a fresh Demo Game with new passwords). Turn `ENABLE_DEV_TOOLS` off when you are done; it is always off when `NODE_ENV=production`.

## Simulating a game

`npm run simulate -w @magic-potion/server -- --teams 20 --seed 42` plays a whole game with simulated teams on a fake clock (a few seconds) and prints the timeline, the halftime and final potion, the final leaderboard with every score part, and a list of checks. Each score is recounted independently of the scoring engine. The same seed always gives the same game.

| Option          | What it does                                                                          |
| --------------- | ------------------------------------------------------------------------------------- |
| `--teams N`     | Number of teams, 3 to 25 (default 20)                                                 |
| `--seed N`      | Random seed (default 42)                                                              |
| `--full-potion` | Strong teams that all finish, so the Full Potion Bonus shows                          |
| `--remove N`    | The admin removes N teams during Round 2                                              |
| `--csv FILE`    | Also write the leaderboard as CSV (for checking in Excel)                             |
| `--db`          | Save to the database in `DATABASE_URL`, rebuild the game from it and compare (slower) |
| `--keep`        | With `--db`, keep the simulated game instead of deleting it                           |

The database integration test runs with `npm test` only when `TEST_DATABASE_URL` is set. Point it at a Neon branch, not the database used for live events.

## Environment variables

Every variable is documented in `apps/server/.env.example` and `apps/web/.env.example`. `.env` files are ignored by git; never commit secrets.

Prisma 7 notes: migrations read `DIRECT_URL` via `apps/server/prisma.config.ts`; the running app connects through the pooled `DATABASE_URL` with the `pg` driver adapter (`apps/server/src/db.ts`). The generated client lives in `apps/server/src/generated` (git-ignored, created on `npm install`).
