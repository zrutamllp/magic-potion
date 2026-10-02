# Build plan

Work one phase at a time. Start each phase in plan mode, get approval, build, run tests, commit, then tick the phase off here. Each phase ends with something Sunny can click and check.

## Phase 0: Project setup ✅

- npm workspaces monorepo: `apps/web`, `apps/server`, `packages/shared`.
- TypeScript, ESLint, Prettier, Vitest in all packages.
- Prisma connected to Neon (`DATABASE_URL` pooled, `DIRECT_URL` direct).
- `.env.example` files, `.gitignore`, README with local run steps.
- Health check endpoint `GET /healthz`.
- **Done when:** `npm run dev` starts web and server locally; the web page shows "Server OK" from the API.

## Phase 1: Data model and settings ✅

- Prisma schema: Game, GameSettings, Team, TeamSession, TaskDefinition, TaskContent (public and secret fields), TeamTask, TaskAttempt, Fragment, Wallet ledger (FundTransaction), Transfer, FundRequest, ChatMessage, InboxItem, InboxResponse, PotionSnapshot, StaffUser, StaffAssignment, AuditLog, FundAdjustmentRequest.
- Money as integers. Every wallet change is a ledger row; balances are derived or cached with a check.
- `packages/shared/src/defaultSettings.ts` with every number from `GAME_RULES.md`.
- Seed script: first main admin, 12 task definitions, one sample content pack, one demo game with 4 teams.
- **Done when:** migrations run on Neon and the seed creates a demo game.

## Phase 2: Game engine and scoring (most important) ✅

- Game state machine: Lobby, Round 1, Pause, Round 2, Reveal, with pause, resume and extend.
- Play clock from stored timestamps. Scheduler rebuilt from the database on server start.
- Task assignment (2 common + 3 random unique) and fragment chains, exactly as in `GAME_RULES.md` sections 3 and 4.
- Task lifecycle: start, hint, submit, lockout, fail, restart.
- Server-side answer checkers, hints and public views for all 12 tasks (moved here from Phase 5).
- Engine rules for transfers (delay, freeze in the Pause), fund requests, inbox answers and photo review, and the potion (moved here from Phase 3; Phase 3 connects them to Socket.IO).
- Pure scoring function with unit tests for every rule in section 9, including edge cases (negative funds, collaboration cap, time bonus only after 5 tasks, potion not full).
- **Done when:** all engine tests pass and a script can simulate a full game for 20 teams and print a correct leaderboard.

## Phase 3: Auth and real-time layer ✅

- Team login (code + password) with one active session per team.
- Staff login (email + password, bcrypt), roles: main admin, co-facilitator.
- Socket.IO rooms: per game, per team, staff. Long-polling fallback on.
- Server pushes state; client reconnects and reloads full state.
- Chat with per-round limits; visibility rules per round. Connect the Phase 2 engine (transfers, fund requests, potion, inbox) to Socket.IO events.
- **Done when:** two browser windows as two teams can chat, send funds and see the potion update live; refreshing never resets a timer.

## Phase 4: Player screens ✅

- Rebuild the designs in `design/` with the corrections in `GAME_RULES.md` section 14.
- Screens: Login, Lobby (intro video + rules), Home (5 task cards, fragments, potion), Chat, Funds, Inbox, Leaderboard, Rules, Pause screen, Reveal screen.
- Works on a laptop screen shared over Zoom: large text, high contrast.
- **Done when:** a team can play through the lobby, rounds, pause and reveal with placeholder tasks.

## Phase 5: Task framework and tasks ✅

- One shared task shell: brief screen, Start Task, server timer, hint button, submit, lockout, result.
- The answer checkers already exist from Phase 2. This phase builds the task screens on top of them.
- Build in this order, one per commit:
  1. The Vault, Find the Code (chains)
  2. Riddle, Hangman, Ethical Dilemma
  3. Picture Puzzle, Spot the Difference, Data Story
  4. Alien Translator, Guess the Celebrity (replaced Sound Sleuth in Batch 4), Pictionary, Escape Room
- Every answer checked on the server by the Phase 2 checkers (see `GAME_RULES.md` "Server-side checking").
- **Done when:** all 12 tasks play end to end with the sample content pack.

## Phase 6: Admin, facilitator and projector ✅

Built in 4 batches, each planned, approved, built, tested and pushed on its own:

- **6A Setup ✅:** staff login screen, admin panel, create game, settings editor (locked when Round 1 starts), client name / logo (Vercel Blob) / colours, bulk teams with unique codes and passwords (printable sheet and CSV), co-facilitators and team assignment.
- **6B Content library ✅:** forms for all 12 tasks with "preview as player"; question pools (each try draws a fresh set, default 3); Ethical Dilemma: one scenario per game for every team; task images on Vercel Blob; reusable content packs (copy, then edit); inbox bonus questions.
- **6C Live control and facilitator dashboard ✅:** start, pause, resume, extend, end; inbox messages; team progress; chat and transfers; fund adjustments (co-facilitator up to 2,000 with a reason, larger ones to admin approval); rename team, reset login, unlock task; audit log and undo; "stuck team" flag (Task Funds below zero or no activity for 5 minutes).
- **6D Projector and debrief ✅:** projector view (potion, all teams, halftime vs final at the Reveal); team photo inbox task (upload, staff can reject); all CSV exports from `GAME_RULES.md` section 13.

Original list:

- Admin: create game, edit settings (locked after start), team names and passwords (bulk create), upload task content and inbox items, create co-facilitators and assign teams.
- Guess the Celebrity upload: photos plus accepted names per photo, and the task name players see. Save photos under random file names (never the person's name) and strip image metadata (EXIF, titles) on upload. Photos must be replaceable before any game without code.
- Live control: start, pause, resume, extend, end; send inbox messages.
- Facilitator dashboard: assigned teams, live progress, chat, transfers, fund adjustments within limits, approval queue for larger ones, audit log, undo.
- Projector view: potion, all teams, halftime vs final potion at the Reveal.
- CSV exports (section 13).
- **Done when:** Sunny can set up and run a full game from the admin panel without touching code.

## Phase 7: Test and deploy

Built in 4 batches, each planned, approved, built, tested and pushed on its own:

- **7A Hardening (before any deploy):** Neon branches `dev` (default, local work), `tests` and `production` (schema only), none auto-deleting (the production database is marked inside itself; the seed, scripts and tests refuse it, and a local server refuses to start on it); database tests that run for real, including a mid-game restart test; team photos in a private Blob store with 5-minute staff-only signed links (`PHOTO_LINK_SECRET`); login limits that suit a whole room on one Wi-Fi (10 per team code, 200 per address, 5 per staff email) and an Unblock logins button; security headers on the API and the web app; an automated check that no answer reaches the browser for any of the 12 tasks; `sslmode=verify-full` everywhere; a production start check.
- ✅ **7B Deploy (done 2026-09-30):** server on Render (Singapore, one instance, `/healthz`), web on Vercel, env vars, CORS, `play.zrutam.com` and `potion-api.zrutam.com` (`api.zrutam.com` is kept for another project) (DNS on Hostinger). Migrations, `db:mark-production` and the admin seed run on the production branch from the Render shell, so its connection strings never leave Render. The production branch was made schema only, so Prisma's migration history table is empty there: its existing migrations must be marked as applied (`prisma migrate resolve --applied`) before `migrate deploy`. Check the web security headers on the live site. Done: live checks listed in the README ("Deploy safely"); the production start check also refuses a pooled `DIRECT_URL`. A game played through on the live site was not completed in 7B; it is the first item of 7C.
- **7C Real-world tests:** a full short game end to end against the live site; a load test with 25 teams and 5 staff for 10 minutes; a test with WebSockets blocked (long-polling fallback); a corporate laptop and phone hotspot checklist. Progress: Round A (4 teams × 4 tabs, full short game on the server's own timers) passed every target. Round B (20 teams × 5 tabs) stopped in its login storm: the JavaScript bcrypt froze the server while 20 passwords were checked at once, so database transactions could not start (P2028) and logins answered 500. Fixed: native bcrypt (worker threads, prebuilt binaries), a shorter login transaction, an explicit connection pool, busy answers 503 with Retry-After, and the login screens retry by themselves. **Load tests complete (2026-10-02):** runs C (12 teams, Starter), B on Standard (20 teams) and D (after the action-ID fix) met every target; p95 target set to under 750 ms from India; sizing rule up to 12 teams on Starter, 13 to 20 on Standard (`docs/LOAD_TEST_RESULTS.md`). Still open: the WebSocket-blocked game with a person playing and the corporate laptop / phone hotspot checklist (`docs/NETWORK_CHECKLIST.md`).
- ✅ **7C must-do before the first client event: action IDs (safe to repeat).** Live since 2026-10-02 (commit `845608f`), confirmed by run D: `apps/server/src/idempotency.ts`, the player socket actions, the staff routes (`apps/server/src/http/idempotentRoutes.ts`; uploads, imports and previews are never replayed), `apps/web/src/lib/emit.ts` and `apps/web/src/lib/api.ts`. A busy database while loading a game now answers 503 (REST) or lets the browser keep reconnecting (sockets) instead of "game not found". If an answer is lost because a connection drops at that moment and the player presses again, some actions are applied twice: sending money, money requests (the other team may pay twice), a wrong task or inbox answer (an extra wrong try), chat, and staff money adjustments and "Message all". Accept, decline, cancel, hint, give up, start and correct answers are already safe (the repeat is refused). Fix: every player action carries a random action ID; after a drop the web app waits for the reconnect and resends the same action with the same ID instead of asking the player to press again; the server remembers each team's last 200 action IDs and their answers for 10 minutes and answers a repeat with the stored answer without applying it (also when the repeat arrives while the first is still running); staff money and message routes take an `Idempotency-Key` header, stored the same way per staff member. Kept in memory (a restart forgets them; deploys never happen during events). Tests: the same `funds:send` ID twice, one after the other and at once, gives one transfer and the same answer; different IDs give two; the web resends with the same ID after a drop; a staff adjustment with the same key twice applies once. Also not safe today: staff **End phase** (pressed again it ends the next phase too) and **Extend** (adds the time twice); the `Idempotency-Key` covers every staff live-control route. Built after the three 7C load runs (12 teams on Starter, 20 teams on Standard, back to Starter), planned first and approved before building. Load test results and the event sizing rule (up to 12 teams on Starter, 13 to 20 on Standard): `docs/LOAD_TEST_RESULTS.md`.
- **7D Event readiness:** an event-day runbook for you and co-facilitators (before, during, after), and a dry run with at least 4 real teams.

Original list:

- Playwright end-to-end test of a full short game (rounds set to 2 minutes).
- Load test: 25 teams and 5 staff connected, sending actions for 10 minutes.
- Deploy: server to Render (Singapore, one instance, health check `/healthz`), web to Vercel, database on Neon Singapore. Set CORS and env vars.
- Custom domains, for example `play.zrutam.com` (web) and `api.zrutam.com` (server).
- Test from a corporate laptop network and a phone hotspot.
- **Must do before the first client event:** move team photos to a private Blob store, served to staff only through short-lived signed links. They are photos of real employees. 6D keeps them in the public store under random names, sent only to staff and deleted after the keep time (default 30 days).
- Internal dry run with real people before any client event.
- **Done when:** a dry run with at least 4 teams completes with no manual fixes.

## Later (out of scope for now)

- From 7C: gather the state updates for other teams over about 200 ms and send them once, so an action no longer waits for every team's state to be rebuilt. Would bring p95 from India under 500 ms and help games over 20 teams. The adopted target is p95 under 750 ms (`docs/LOAD_TEST_RESULTS.md`).
- Check whether the /check Vimeo test gives a false 'blocked' (seen on laptop + iPhone, 2 Oct). For clients we recommend YouTube or our own uploaded video anyway.
- Multiple Render instances with a Redis adapter.
- Hostinger VPS as a self-hosted option for clients who need it.
- ~~More questions per task, set from the admin panel.~~ Done in 6B: question pools (Riddle, Hangman, Pictionary, Guess the Celebrity, Data Story questions) draw a fresh set per try; the per-try counts are settings; Ethical Dilemma plays one scenario per game, chosen by the admin.
- Languages other than English.
- ~~Unique team codes across games.~~ Done in 6A: new codes are checked against every team code in every game. Older demo and screenshot games keep their codes.
- ~~From 6C: remove the `/dev/staff` test page once 6D is done.~~ Done in 6D: its fragment values and "Finish all 5 tasks" moved to a Dev tools box in the dashboard's team panel (dev tools and main admin only), and the Ethical Dilemma answers to the Debrief.
- From 6C: a co-facilitator's team list is read when their dashboard connects; if the admin changes their teams mid-game, they reload the page to see the change.
- From 6C: the stuck flag's idle clock counts from the round start or the team's last action; time spent paused by the admin can count toward it right after Resume.
- Replace the Phase 3 test screens (`apps/web/src/pages/TeamPage.tsx`, `StaffDevPage.tsx`) with the real player screens (Phase 4) and admin panel (Phase 6), and remove the dev-only "finish all tasks" route (`ENABLE_DEV_TOOLS`) once the task screens exist.
- ~~Vercel rewrite so deep links such as `/staff` load the app in production (Phase 7).~~ Done in 7B (`apps/web/vercel.json`).
- ~~Team photo upload in the Inbox.~~ Done in 6D (upload, staff reject, auto-delete after the keep time). Private storage is a Phase 7 must-do (see above).
- ~~Hint, fail penalty and facilitator adjustment lines in the Funds transaction list.~~ Done (hints and fails in Phase 5, adjustments in 6C).
- ~~Facilitator messages in the inbox: Phase 6.~~ Done in 6C (Message all).
- ~~From 6A: renaming a team or changing settings after the start needs the live engine to take the change.~~ Done in 6C: live rename from the dashboard; settings stay locked.
- ~~From 6A: co-facilitators see their games in the list but have no screen yet.~~ Done in 6C: Open dashboard.
- From 6B: Spot the Difference marking shows the default click room (4%); a game can change it in Settings, and the preview uses the default unless opened from a game.
- Intro video upload: an admin upload button for MP4/WebM files to the public picture store. Today a video file is uploaded in the Vercel dashboard and its link pasted in Branding; only YouTube, Vimeo and our own store are allowed.
- From 6B: task pictures in packs that are deleted stay in Vercel Blob (they may still be used by a game's frozen copy). A clean-up of unused pictures could come later.
- From 6B: `exceljs` (spreadsheet import) brings a moderate `uuid` advisory for functions it does not use. Revisit when exceljs updates.
- From 6A: `npm audit` reports issues inside Prisma's and tsup's own tooling (dev only). The only automatic fix downgrades Prisma to v6; revisit when Prisma ships a fix.
