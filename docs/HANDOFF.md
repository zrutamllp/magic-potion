# Handoff (2026-10-02, end of day)

A short note on where the Magic Potion Challenge stands, for whoever picks it up next (including a new Claude Code session). The rules and numbers are in `docs/GAME_RULES.md`, the phases in `docs/BUILD_PLAN.md`, and the working rules in `CLAUDE.md`.

## Status

- Phases 0 to 6 are done: the game engine and scoring, the player screens and all 12 tasks, the admin panel, the facilitator dashboard, the projector, the debrief and the exports.
- Phase 7A (hardening) and 7B (deploy) are done.
- Phase 7C: **the load tests are complete** and every target is met (`docs/LOAD_TEST_RESULTS.md`). The two must-dos before the first client event are done and live:
  - team photos in a private Blob store with staff-only signed links (7A);
  - action IDs, so every player action and staff change is safe to repeat (7C).
- Also fixed during 7C and live: native bcrypt (a room full of logins no longer freezes the server), a busy database answers "busy, try again" (503) and the login screens retry by themselves.
- **Data retention is live** (deployed 2026-10-02, commit `e5033d2`):
  - game data is deleted automatically 90 days after End game (per-game setting, 7 to 365 days; a game never ended counts from its last activity). A deletion record keeps only counts;
  - **Delete played game now** (main admin, type the name);
  - the games list shows each deletion date, plus a banner 7 days ahead;
  - the intro video may only be YouTube, Vimeo or a file in our own public store (`PUBLIC_BLOB_HOST` in Render, `media-src` in `apps/web/vercel.json`).

  Both production games show "Data will be deleted on 30 Dec 2026".
- **Security scans (2026-10-02):**
  - securityheaders.com: both **A+** (`potion-api.zrutam.com` rescanned after the Permissions-Policy header went live; only a harmless note that `/` returns 404);
  - SSL Labs: both **A+** (one of Vercel's servers A).
- **The /check connection page is live** (deployed 2026-10-02, commit `bf8d02c`; README, "Connection check page"), with the hidden `?transport=polling` switch for the long-polling network test. The test picture is in `magic-potion-prod-public` at `connection-check/pixel.png`. Checked live: `/check` and `/check/` get the CSP that adds YouTube and Vimeo, every other page keeps the game's (one CSP header each); `/check-info` gives the picture; the check socket connects over polling and WebSocket without a login, ignores game events and is closed by the server after 30 s. Checked by hand: **Ready to play** on a laptop (Chrome, 108 ms, WebSocket) and an iPhone (Safari, iOS 26.6, 105 ms, WebSocket). On both, Vimeo showed as blocked, possibly a false result (under "Later" in `docs/BUILD_PLAN.md`); for clients we recommend YouTube or our own uploaded video.
- Client IT note (hosts, ports, WebSocket, personal data, retention, security; scan table now A+ for both sites): https://claude.ai/code/artifact/532fddc7-2991-4660-8bfb-6a831b308c96

## What is live

| Part | Where | Notes |
| ---- | ----- | ----- |
| Web app | `https://play.zrutam.com` (Vercel, project `magic-potion-web`) | Rebuilds on every push to `main` |
| API and Socket.IO | `https://potion-api.zrutam.com` (Render `magic-potion-server`, Singapore) | **Auto-Deploy off**: deploys are manual only. Starter instance between events. |
| Database | Neon branch `production` (Singapore) | Marked as production inside itself; scale-to-zero off. Backup branches always expire within 30 days |
| Files | Vercel Blob `magic-potion-prod-public` (`3webxzmniefozaez.public.blob.vercel-storage.com`) and `magic-potion-prod-photos` (private), both BOM1 Mumbai | Production only; local work uses the dev stores |
| Main admin | `ceo@zrutam.com` | |

The server running on Render is commit `bf8d02c`. Later commits: documents only. How to deploy, when, and how to roll back: README, "Deploy safely". Never deploy, and never change the Render instance, during an event.

## Event sizing rule

| Teams | Render instance |
| ----- | --------------- |
| up to 12 | **Starter** (as now) |
| 13 to 20 | **Standard**: switch the day before the event, back to Starter after it |

Changing the instance restarts the server, so only do it when no game is running or paused. More than 20 teams has not been tested.

## What is left

1. **Corporate network test** (`docs/NETWORK_CHECKLIST.md`, step 0 is now `/check`):
   - **open:** a short game played on **long-polling only** with `?transport=polling`, in real browser windows (a test game with real team logins, not the bot script's game, whose teams you cannot log in to). The fallback with a real browser; bots already passed it under load;
   - the **corporate laptop** and **phone hotspot** checklist.

   Use a test game made in the admin panel (named `LOADTEST – …`), with team logins you can use in real windows, and delete it afterwards.
2. **The client 1-page note:** a short version of the IT note above for the client.
3. **7D event readiness:** an event-day runbook for you and the co-facilitators (before, during, after), and a dry run with at least 4 real teams. Done when the dry run completes with no manual fixes.
4. **The first content pack** for a real event.

Not planned now (see "Later" in `docs/BUILD_PLAN.md`): gathering other teams' updates to bring p95 under 500 ms and support more than 20 teams, a Redis adapter for more than one server, other languages.

## Good to know

- Testing the live site: `npm run live-test` (README, "Testing the live site"). It only ever touches its own `LOADTEST – …` game and `loadtest-N@zrutam.invalid` staff, and deletes them at the end. Results go to `live-results/` (git-ignored, no secrets).
- Secrets live only in the Render and Vercel dashboards and in local `.env` files. Never print `.env` lines.
- Stop processes only by PID, never by name.
- Before a deploy that adds a Render variable: add it with **Save only**, never "Save and deploy". Before a migration: a Neon backup branch with automatic expiry (30 days or less).
