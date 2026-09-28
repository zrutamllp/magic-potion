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
4. `npm run db:seed -- --reset-demo --short` does the same with short timings for hand testing: Round 1 5 min, Pause 1 min, Round 2 5 min, every task timer 4 min (so a task fits inside a round), and inbox tasks at 1, 6 and 8 minutes of play. Every other rule keeps its real default.
5. Add `--tasks riddle,hangman,ethical_dilemma` (any 3 or more unique tasks) to load only those unique tasks, so every demo team draws them. Useful for testing one batch of task screens.

`DIRECT_URL` must be Neon's direct host (no `-pooler` in the host name). Migrations through the pooler can leave a lock behind.

Use `sslmode=verify-full` in both Neon strings (Neon's copy button gives `sslmode=require`). The app also changes `require` to `verify-full` itself (`withVerifyFullSsl` in `apps/server/src/db.ts`), so older strings work without the pg SSL warning.

## Test the player screens with the short demo

About 15 minutes for a whole game.

1. In `apps/server/.env`, set `JWT_SECRET` (any string of 32+ characters) and `ENABLE_DEV_TOOLS=true`.
2. From `apps/server`, run `npm run db:seed -- --reset-demo --short`. Copy the 4 team codes and passwords it prints (they are shown only once). `--short` gives 5-minute rounds and a 1-minute pause; leave it out for the real 35/10/35 timings.
3. From the repo root, run `npm run dev`.
4. **Team windows:** open http://localhost:5173 in two new windows (or tabs) and log in as `TEAM1` and `TEAM2`. Each tab keeps its own login. Both show the **Lobby** with the rules and the empty potion.
5. **Staff window:** open http://localhost:5173/dev/staff, log in with `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`, choose "Demo Game" and press **Start**. Both team windows switch to **Home** with a 5:00 countdown.
6. **Round 1:** try each tab in the sidebar:
   - **Home:** open a task and press **Start Task** (its timer runs), **Exit** (the timer keeps running, and the other cards say another task is open), then **Give up** (Task Funds drop by 3,500).
   - **Chat:** send a message from Team 1. It appears at once for Team 2, and "Messages left" goes to 4 of 5.
   - **Funds:** send 500 to the other team, and request funds back. Watch "Arriving in 0:59", the Accept/Decline buttons and the transaction list.
   - **Inbox:** "Round 1 has started" is there, and "5 minutes left" arrives in full-length games. The first bonus task arrives at 1 minute of play.
   - **Leaderboard:** your own row only, with no rank. **Rules:** the approved text.
   - **Potion:** on the staff page press "Finish all 5 tasks" for Team 1. The bottle fills to 25% in both windows.
7. **Pause:** after 5 minutes (or press **Next phase** on the staff page) both windows show only the potion and the Pause countdown.
8. **Round 2:** after 1 minute (or **Next phase**) play carries on with the same task time left. The top bar now shows a rank and the leaderboard shows every team.
9. **Reveal, full potion:** press "Finish all 5 tasks" for every team, then **Next phase**. The Reveal shows the halftime and final potions, "The potion is full!", then the leaderboard.
10. **Reveal, nobody wins:** run step 2 again, start, finish tasks for only one team, and press **Next phase** three times. The Reveal says "The potion is not full. Nobody wins."
11. **Refresh** any window at any time: it stays logged in on the same screen and time. **One login per team:** logging in as the same team elsewhere sends the old window to "Your team logged in on another device."

Turn `ENABLE_DEV_TOOLS` off when you are done; it is always off when `NODE_ENV=production`.

## Play the tasks (Phase 5, built in batches)

Batches 1 and 2 are playable; the other tasks show a placeholder until their batch is built. Use the short demo from the section above.

### Batch 1: The Vault, Find the Code

- **The Vault:** answer the 3 clues for the first 3 digits (8, 3, 6 in the sample). The Vault shows its marker, for example "Vault 🍎"; the last 3 digits are the Found item with the same marker ("Fragment: 🍎 1-4-3") on another team's Home. Type all 6 digits and press **Open the vault**. Three wrong codes lock the task: 60 seconds the first time, 2 minutes the second, 4 minutes after that.
- **Find the Code:** each team decodes its own random 6- or 7-letter code (not a word, so it cannot be guessed). The known letters are filled in; typing a letter under one symbol fills every copy of it. The key shows "?" for symbols with no known letter; the missing pairs ("⌘ = R, ❖ = T") are a Found item on another team's Home. Submit the code.
- **Quick testing:** with `ENABLE_DEV_TOOLS=true`, the staff page `/dev/staff` shows a **Fragments** table: for each team, who holds its Vault and Find the Code fragment, and the value. Players never see it.
- **Shell:** try **Use hint** (it shows how the 1,500 is paid: Support Funds first), **Give up** (−3,500 Task Funds) and **Try again**. The Funds tab lists the hint and fail lines.

`npm run screenshots:batch1` saves the Batch 1 screens (brief, playing, hint, locked, failed, solved, Funds lines) to `screenshots/phase5/batch1/`.

### Batch 2: Riddle, Hangman, Ethical Dilemma

From `apps/server`, run `npm run db:seed -- --reset-demo --short --tasks riddle,hangman,ethical_dilemma`, so all 4 teams get these 3 tasks (plus The Vault and Find the Code). Log in as any team; each task timer is 4 minutes in the short demo.

- **Riddle:** 3 riddles; answer and **Check** each one on its own. Case, spaces, punctuation and "a", "an", "the" do not matter, and each riddle accepts a few answers: "The Keyboard", "foot steps" and "a comb" all pass. A wrong answer says "Riddle 2: Not right. Try again." at the top. The hint shows a clue under the first unanswered riddle. Restarting gives a new set of riddles (3 sets in the sample).
  - Set 1: keyboard · footsteps · comb (or zip). Set 2: clock (or watch) · towel · calendar (or diary). Set 3: coin · age · needle.
- **Hangman:** click letters or type them on the keyboard. The phrase shows by word, with lives left (6 hearts), wrong letters, and "R is in the phrase." / "R is not in the phrase.". The hint reveals one letter (shown in blue). The 6th wrong letter fails the try (−3,500) with "Too many wrong letters."; **Try again** gives a new phrase.
  - Phrases: PRINTER OUT OF PAPER (Office problem) · QUARTERLY REVIEW MEETING (On the calendar) · OUT OF OFFICE REPLY (In your inbox).
- **Ethical Dilemma:** read the scenario, pick one of the 4 options, type a one-line reason and press **Submit answer**. Any complete answer passes; nothing is marked right or wrong. There is no hint, and Give up sits next to Submit. The done screen shows "Answer saved." with the team's choice and reason. With `ENABLE_DEV_TOOLS=true`, `/dev/staff` lists every saved answer under **Ethical Dilemma answers** (the real debrief view and CSV come in Phase 6).

`npm run screenshots:batch2` plays all three for real and saves the screens to `screenshots/phase5/batch2/`, checking that each main button fits a 1280×720 window without scrolling.

## Screenshots

`npm run screenshots` saves a PNG of every player screen to `screenshots/phase4/` (git-ignored), at 1280×720 (a typical Zoom share) plus two at phone width. It uses the real server and database with two throwaway games that it creates and deletes; the Demo Game is not touched. It needs `ENABLE_DEV_TOOLS=true`, and runs `npm run dev` itself if it is not already running. First time only: `npx playwright install chromium`.

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
