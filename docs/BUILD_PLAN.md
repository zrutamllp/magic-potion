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

## Phase 5: Task framework and tasks

- One shared task shell: brief screen, Start Task, server timer, hint button, submit, lockout, result.
- The answer checkers already exist from Phase 2. This phase builds the task screens on top of them.
- Build in this order, one per commit:
  1. The Vault, Find the Code (chains)
  2. Riddle, Hangman, Ethical Dilemma
  3. Picture Puzzle, Spot the Difference, Data Story
  4. Alien Translator, Sound Sleuth, Pictionary, Escape Room
- Every answer checked on the server by the Phase 2 checkers (see `GAME_RULES.md` "Server-side checking").
- **Done when:** all 12 tasks play end to end with the sample content pack.

## Phase 6: Admin, facilitator and projector

- Admin: create game, edit settings (locked after start), team names and passwords (bulk create), upload task content and inbox items, create co-facilitators and assign teams.
- Live control: start, pause, resume, extend, end; send inbox messages.
- Facilitator dashboard: assigned teams, live progress, chat, transfers, fund adjustments within limits, approval queue for larger ones, audit log, undo.
- Projector view: potion, all teams, halftime vs final potion at the Reveal.
- CSV exports (section 13).
- **Done when:** Sunny can set up and run a full game from the admin panel without touching code.

## Phase 7: Test and deploy

- Playwright end-to-end test of a full short game (rounds set to 2 minutes).
- Load test: 25 teams and 5 staff connected, sending actions for 10 minutes.
- Deploy: server to Render (Singapore, one instance, health check `/healthz`), web to Vercel, database on Neon Singapore. Set CORS and env vars.
- Custom domains, for example `play.zrutam.com` (web) and `api.zrutam.com` (server).
- Test from a corporate laptop network and a phone hotspot.
- Internal dry run with real people before any client event.
- **Done when:** a dry run with at least 4 teams completes with no manual fixes.

## Later (out of scope for now)

- Multiple Render instances with a Redis adapter.
- Hostinger VPS as a self-hosted option for clients who need it.
- More questions per task, set from the admin panel, not in code (Sunny, after Batch 2). For example, Ethical Dilemma with about 10 scenarios and Riddle with 10 to 12 riddles. Today the content schemas fix the counts (Riddle exactly 3, one dilemma scenario) and the only content is the sample pack in `apps/server/prisma/sampleContent.ts`. To do: make the count per task a game setting or part of the uploaded content, loosen the schemas in `packages/shared/src/taskContent.ts`, and let admins add and edit questions in Phase 6 (content upload). Before building, decide with Sunny: are all questions played in one try, or is a set drawn from a bigger pool? Does the timer or the points change with more questions? For Ethical Dilemma, is each scenario answered in one task, and is every answer saved for the debrief?
- Languages other than English.
- Unique team codes across games. Team login finds the team by code among games that have not ended, and refuses a code that two live games share. Phase 6 should generate codes that never clash.
- Replace the Phase 3 test screens (`apps/web/src/pages/TeamPage.tsx`, `StaffDevPage.tsx`) with the real player screens (Phase 4) and admin panel (Phase 6), and remove the dev-only "finish all tasks" route (`ENABLE_DEV_TOOLS`) once the task screens exist.
- Vercel rewrite so deep links such as `/dev/staff` load the app in production (Phase 7).
- Team photo upload in the Inbox (needs Vercel Blob storage): Phase 6, with content upload. The card shows its status until then.
- Hint, fail penalty and facilitator adjustment lines in the Funds transaction list (needs ledger rows in the player state): Phase 5 for hints and fails, Phase 6 for adjustments.
- Facilitator messages in the inbox: Phase 6.
- The Escape Room "Ask for Help" button opens the shared chat (GAME_RULES section 14). Check its label against section 16 in Phase 5.
