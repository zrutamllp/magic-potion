# Handoff (2026-10-02)

A short note on where the Magic Potion Challenge stands, for whoever picks it up next (including a new Claude Code session). The rules and numbers are in `docs/GAME_RULES.md`, the phases in `docs/BUILD_PLAN.md`, and the working rules in `CLAUDE.md`.

## Status

- Phases 0 to 6 are done: the game engine and scoring, the player screens and all 12 tasks, the admin panel, the facilitator dashboard, the projector, the debrief and the exports.
- Phase 7A (hardening) and 7B (deploy) are done.
- Phase 7C: **the load tests are complete** and every target is met (`docs/LOAD_TEST_RESULTS.md`). The two must-dos before the first client event are done and live:
  - team photos in a private Blob store with staff-only signed links (7A);
  - action IDs, so every player action and staff change is safe to repeat (7C).
- Also fixed during 7C and live: native bcrypt (a room full of logins no longer freezes the server), a busy database answers "busy, try again" (503) and the login screens retry by themselves.

## What is live

| Part | Where | Notes |
| ---- | ----- | ----- |
| Web app | `https://play.zrutam.com` (Vercel, project `magic-potion-web`) | Rebuilds on every push to `main` |
| API and Socket.IO | `https://potion-api.zrutam.com` (Render `magic-potion-server`, Singapore) | **Auto-Deploy off**: deploys are manual only. Starter instance between events. |
| Database | Neon branch `production` (Singapore) | Marked as production inside itself; scale-to-zero off |
| Files | Vercel Blob `magic-potion-prod-public` and `magic-potion-prod-photos` (private) | Production only; local work uses the dev stores |
| Main admin | `ceo@zrutam.com` | |

The server running on Render is commit `845608f`. Later commits change only documents and the test script. How to deploy, when, and how to roll back: README, "Deploy safely". Never deploy, and never change the Render instance, during an event.

## Event sizing rule

| Teams | Render instance |
| ----- | --------------- |
| up to 12 | **Starter** (as now) |
| 13 to 20 | **Standard**: switch the day before the event, back to Starter after it |

Changing the instance restarts the server, so only do it when no game is running or paused. More than 20 teams has not been tested.

## What is left

1. **7C network checks** (`docs/NETWORK_CHECKLIST.md`):
   - a short game played by a person in Chrome with **WebSockets blocked** (the long-polling fallback with a real browser; bots already passed it under load);
   - the **corporate laptop** and **phone hotspot** checklist.

   Use a test game: `npm run live-test -w @magic-potion/server -- --mode game` makes a `LOADTEST – …` game with one team for a person and deletes it afterwards.
2. **7D event readiness:** an event-day runbook for you and the co-facilitators (before, during, after), and a dry run with at least 4 real teams. Done when the dry run completes with no manual fixes.

Not planned now (see "Later" in `docs/BUILD_PLAN.md`): gathering other teams' updates to bring p95 under 500 ms and support more than 20 teams, a Redis adapter for more than one server, other languages.

## Good to know

- Testing the live site: `npm run live-test` (README, "Testing the live site"). It only ever touches its own `LOADTEST – …` game and `loadtest-N@zrutam.invalid` staff, and deletes them at the end. Results go to `live-results/` (git-ignored, no secrets).
- Secrets live only in the Render and Vercel dashboards and in local `.env` files. Never print `.env` lines.
- Stop processes only by PID, never by name.
