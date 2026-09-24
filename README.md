# Magic Potion Challenge

A real-time multiplayer team game for corporate learning events. See `CLAUDE.md` for the overview, `docs/GAME_RULES.md` for the rules and `docs/BUILD_PLAN.md` for the build phases.

## Layout

```
apps/web         React + Vite + Tailwind (player app, admin, facilitator, projector)
apps/server      Express API (Socket.IO from Phase 3), Prisma
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

- Web: http://localhost:5173. It shows "Server OK" when the API answers.
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

## Environment variables

Every variable is documented in `apps/server/.env.example` and `apps/web/.env.example`. `.env` files are ignored by git; never commit secrets.

Prisma 7 notes: migrations read `DIRECT_URL` via `apps/server/prisma.config.ts`; the running app connects through the pooled `DATABASE_URL` with the `pg` driver adapter (`apps/server/src/db.ts`). The generated client lives in `apps/server/src/generated` (git-ignored, created on `npm install`).
