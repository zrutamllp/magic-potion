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
- Staff panel and live dashboard: http://localhost:5173/staff
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
5. **Staff window:** open http://localhost:5173/staff, log in with `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`, press **Live** next to "Demo Game", then **Start game**. Both team windows switch to **Home** with a 5:00 countdown.
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

All 12 tasks are playable. Use the short demo from the section above.

### Batch 1: The Vault, Find the Code

- **The Vault:** answer the 3 clues for the first 3 digits (8, 3, 6 in the sample). The Vault shows its marker, for example "Vault 🍎"; the last 3 digits are the Found item with the same marker ("Fragment: 🍎 1-4-3") on another team's Home. Type all 6 digits and press **Open the vault**. Three wrong codes lock the task: 60 seconds the first time, 2 minutes the second, 4 minutes after that.
- **Find the Code:** each team decodes its own random 6- or 7-letter code (not a word, so it cannot be guessed). The known letters are filled in; typing a letter under one symbol fills every copy of it. The key shows "?" for symbols with no known letter; the missing pairs ("⌘ = R, ❖ = T") are a Found item on another team's Home. Submit the code.
- **Quick testing:** with `ENABLE_DEV_TOOLS=true`, the main admin sees a **Dev tools** box in each team's panel on the live dashboard: who holds that team's Vault and Find the Code fragments, and the values, plus a **Finish all 5 tasks** button. Players never see it, and it never appears in production.
- **Shell:** try **Use hint** (it shows how the 1,500 is paid: Support Funds first), **Give up** (−3,500 Task Funds) and **Try again**. The Funds tab lists the hint and fail lines.

`npm run screenshots:batch1` saves the Batch 1 screens (brief, playing, hint, locked, failed, solved, Funds lines) to `screenshots/phase5/batch1/`.

### Batch 2: Riddle, Hangman, Ethical Dilemma

From `apps/server`, run `npm run db:seed -- --reset-demo --short --tasks riddle,hangman,ethical_dilemma`, so all 4 teams get these 3 tasks (plus The Vault and Find the Code). Log in as any team; each task timer is 4 minutes in the short demo.

- **Riddle:** 3 riddles; answer and **Check** each one on its own. Case, spaces, punctuation and "a", "an", "the" do not matter, and each riddle accepts a few answers: "The Keyboard", "foot steps" and "a comb" all pass. A wrong answer says "Riddle 2: Not right. Try again." at the top. The hint shows a clue under the first unanswered riddle. Restarting gives a new set of riddles (3 sets in the sample).
  - Set 1: keyboard · footsteps · comb (or zip). Set 2: clock (or watch) · towel · calendar (or diary). Set 3: coin · age · needle.
- **Hangman:** click letters or type them on the keyboard. The phrase shows by word, with lives left (6 hearts), wrong letters, and "R is in the phrase." / "R is not in the phrase.". The hint reveals one letter (shown in blue). The 6th wrong letter fails the try (−3,500) with "Too many wrong letters."; **Try again** gives a new phrase.
  - Phrases: PRINTER OUT OF PAPER (Office problem) · QUARTERLY REVIEW MEETING (On the calendar) · OUT OF OFFICE REPLY (In your inbox).
- **Ethical Dilemma:** read the scenario, pick one of the 4 options, type a one-line reason and press **Submit answer**. Any complete answer passes; nothing is marked right or wrong. There is no hint, and Give up sits next to Submit. The done screen shows "Answer saved." with the team's choice and reason. Every saved answer appears in the game's **Debrief** (grouped by option) and in the Ethical Dilemma CSV.

`npm run screenshots:batch2` plays all three for real and saves the screens to `screenshots/phase5/batch2/`, checking that each main button fits a 1280×720 window without scrolling.

### Batch 3: Picture Puzzle, Spot the Difference, Data Story

From `apps/server`, run `npm run db:seed -- --reset-demo --short --tasks picture_puzzle,spot_difference,data_story`, so all 4 teams get these 3 tasks. Log in as any team. These three use the full width, with a compact **Use hint** and **Give up** on the task.

- **Picture Puzzle:** click one tile, then another, to swap them (made for a trackpad; click a picked tile again to cancel). Drag and drop also works. The finished picture is shown small on the right. **Use hint** puts a green tick on every tile already in its right place (no numbers), and the ticks follow every swap until the try ends. Each swap is saved on the server, so a refresh keeps the puzzle as it was. The grid size is a game setting (`tasks.picturePuzzleGrid`, default 3x3).
- **Spot the Difference:** click a difference on either picture. Clicks near a difference count too (`tasks.spotDifferenceTolerancePercent`, default 4% of the picture width). Found ones get a green ring on both pictures, with "x of 7 found" at the top. A miss shows a red X and "No difference there." and costs nothing. The hint draws a dashed ring round one difference.
  - The 7 differences in the sample: clock hands, sun in the window, picture on the wall, flower on the plant, mug colour, one pen missing, notebook colour.
- **Data Story:** a small dashboard with 3 charts, every value printed on the chart. Answer each question and press **Check**. Case, spaces, "a/an/the" and thousands commas do not matter. The hint outlines the chart to look at. Restarting gives the other dashboard.
  - Sales and delivery: South · June · 22. Warehouse operations: Saturday · 106 · 12.

### Batch 4: Alien Translator, Guess the Celebrity, Pictionary, Escape Room

Guess the Celebrity replaced Sound Sleuth in this batch. Run `npm run prisma:deploy` from `apps/server` once to apply the migration that swaps them (it removes Sound Sleuth rows from old test games), then `npm run db:seed -- --reset-demo --short --tasks alien_translator,guess_celebrity,pictionary,escape_room`. With 4 unique tasks listed, each team draws 3 of them when the game starts; Home shows which, so log in as another team for the 4th.

- **Alien Translator:** the message is written in large alien glyphs. Letters from the legend are filled in; type a letter under a glyph and every copy of it fills. **Submit** sends the whole sentence. The hint decodes 3 more glyphs (marked in blue). No lockout.
  - Sample: THE PURPLE MOON RISES AT DAWN. The legend gives T, H, E, R, O, S, A, N; the hint gives P, U, L.
- **Guess the Celebrity:** one photo at a time, "Face 3 of 8". Type the name and press **Guess**; a wrong name costs nothing. **Pass** moves to the next photo, and passed photos come back later. Names ignore case, spaces, dots and hyphens, and names of 6+ letters forgive one small typo. The hint shows the first letter of each word ("S_____ T____"). Photos per try is a setting (`tasks.guessCelebrityFaces`, default 8), and the task name comes from the content, so it can be renamed.
  - Sample: placeholder faces labelled Sample 1 to 8; the answer is the label ("sample 3" or "sample three"). Real photos come with the Phase 6 upload.
- **Pictionary:** the game draws each picture stroke by stroke (**Draw again** replays it). "Word 2 of 5" at the top, guessed words as green chips. Guesses ignore case, spaces, punctuation, "a/an/the" and simple plurals. The hint gives the first letter.
  - Words: key · cup (mug, coffee, teacup) · light bulb (bulb) · laptop (computer) · rocket (rocket ship, spaceship).
- **Escape Room:** 4 stages; the server sends each one only after the one before is right. The mirror stage is drawn flipped and cannot be copied as text. Wrong answers count toward the lockout (same setting as The Vault: 3 wrong, then 60 s, 2 min, 4 min). **Chat** opens the shared chat; the timer keeps running.
  - Answers: B (drawer B) · blue · seven · 28.
- **On Zoom:** the Pilot shares the screen as usual; none of these tasks has sound.

`npm run screenshots:batch4` plays all four for real and saves the screens to `screenshots/phase5/batch4/`, checking that each one fits a 1280×720 window.

Sample pictures (and the placeholder faces) are SVG files in `apps/web/public/sample/`. Each game stores only their URLs, so per-client pictures can replace them (Phase 6 upload).

`npm run screenshots:batch3` plays all three with mouse clicks and saves the screens to `screenshots/phase5/batch3/`, checking that pictures and buttons fit a 1280×720 window.

## Admin panel (Phase 6A: setup)

Open `http://localhost:5173/staff` and log in with the main admin (`ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`). Everything is a form; nobody edits JSON or code.

- **Games → New game:** name, client name and number of teams (3 to 25). The game gets the default settings and the sample task content (content packs come in 6B).
- **Teams:** every team gets a 5-character code (no look-alike letters, never used by any other game) and a password like `plum-river-sun-4`. Passwords are shown only once, right after they are made, in the login sheet: **Print login sheet** (one card per team) or **Download CSV**. Lost one? Tick the team and press **New passwords**; its old login ends. Add, rename or delete teams until the game starts.
- **Settings:** every rule number from `docs/GAME_RULES.md`, times in minutes. **Reset to defaults** is there if needed. Everything locks when Round 1 starts.
- **Branding:** client name, logo upload, two colours with a live preview, and the intro video. Logos go to Vercel Blob (`BLOB_READ_WRITE_TOKEN`) as WebP under a random name, with all hidden image details removed. SVG is not accepted.
- **Staff → Add a co-facilitator** (name, email, starting password), then **Co-facilitators** in a game to tick the teams they look after.

Every change is written to the audit log. Changing a game in the Lobby reloads it for teams that are already logged in.

`npm run screenshots:6a` sets up a whole game this way with a throwaway main admin (including a real logo upload), logs a team in to check the branding, starts the game, checks that settings lock, and saves the screens to `screenshots/phase6/6a/`. It deletes everything it made afterwards.

## Content library (Phase 6B)

**Content packs** (sidebar) hold the content of all 12 tasks and can be reused across games and clients. The built-in **Sample pack** is read-only: press **Copy**, give the copy a name, and edit the copy. Every new game starts with the Sample pack.

- **Pack page:** the 12 tasks are on the left, each with how many entries it has. Pick a task, then an entry, edit the form, and press **Save**. Missing or wrong fields are marked in red. **Preview as player** plays the entry on the real task screen. Nothing is saved there, and answers never reach the browser.
- **Question pools:** Riddle, Hangman, Pictionary, Guess the Celebrity and Data Story questions hold a pool. Each try draws a fresh set, starting with entries the team has not seen. The per-try counts are on the Settings tab (3 riddles, 3 Data Story questions and 5 drawings by default; Hangman plays one phrase).
- **Import from Excel/CSV** (Riddle, Hangman, Ethical Dilemma, Data Story questions): download the template, fill one row per entry (several accepted answers in one cell, separated by `;`), and upload it. Every row is checked and problems are shown by row and column. Nothing is saved until you press **Add**.
- **Pictures** (Picture Puzzle, Spot the Difference, Guess the Celebrity) are uploaded to Vercel Blob under random names, with hidden image details removed.
- **Spot the Difference:** upload the original and the changed picture (same size), then click each difference, on either picture. Drag a circle to move it, and use the slider to resize it. **Blink** swaps the pictures so changes stand out. Exactly 7 are needed.
- **Pictionary:** draw with the mouse on the pad; each line is one stroke, played back in order.
- **A game's Content tab:** choose the pack and the one Ethical Dilemma scenario every team gets. Until Round 1 starts, the game follows the pack's latest content; from Round 1 it keeps its own copy.
- **A game's Inbox tab:** the team photo text and the 2 bonus questions with their accepted answers.
- **Games list:** **Archive** hides a finished game but keeps all its data (**Show archived** brings it back). **Delete** is offered for a game that never started and, as **Delete played game now**, for a game in the Reveal or ended (not paused), only after typing its name. It uses the same deletion as the automatic one below.
- **Game data is deleted automatically** (main admin setting **Delete game data after (days)** at the top of Settings, default 90, 7 to 365). The days count from **End game**; for a game that was never ended (left in the Reveal, paused or mid-round), from its last activity (team action, chat or staff change). It can change after the game starts, but never to a date less than 7 days away. Everything of the game goes: teams, logins, chat, answers, transfers, photos and its audit lines. A deletion record keeps only the game id and name, when, by whom (`auto` or the staff member) and how many rows of each kind were removed. The games list shows **Data will be deleted on …** for each played game and a warning at the top when a game goes within 7 days, so the exports can be downloaded first. The job runs when the server starts and every 3 hours, from database times, so a restart never loses or moves a deletion. No game is deleted within 7 days of the first server start with this feature.

`npm run screenshots:6b` does all of this with a throwaway admin, including a team seeing a different set of 3 riddles on its second try, and saves the screens to `screenshots/phase6/6b/`. It deletes the games, packs and pictures it made.

## Live control and facilitator dashboard (Phase 6C)

Press **Live** next to a game (co-facilitators: **Open dashboard**). The page uses the whole screen and fits a 1366×768 laptop. It updates by itself; there is no need to refresh.

- **Top bar (main admin):** **Start game**, **Pause** / **Resume**, **+1 min**, **+5 min**, **End Round 1** (or End the Pause, End Round 2, End game) and **Message all**. Starting and ending always ask first. A message goes to every team's Inbox; if it uses words the game rules keep out of player text ("help", "together"...), a yellow note says so, but it can still be sent.
- **Teams table:** one row per team: its 5 tasks (grey not started, blue in progress, yellow locked, green done, red failed; hover for the name and time left), tasks x/5, Task Funds, Support Funds, chat messages left, last action and live score. **Stuck** (red) means Task Funds are below zero, or no action for 5 minutes during a round (a setting under Facilitator dashboard).
- **Click a team** for its panel: **Change funds** (add or take away, with a reason only staff see), **Rename**, **Reset login** (a new password, shown once; the team's screen logs out), **View as team**, and **Release** for a fragment whose holder team is missing. The main admin also gets **Clear lock** and **Stop try** (no penalty) on a running task, and **Remove from game** (the fragments that team held go straight to the teams that need them).
- **Co-facilitators** see only their teams. They can change Task Funds by up to 2,000 at once (a setting); a larger change goes to **Approvals** for the main admin. They cannot run the clock, message all teams, unlock tasks or remove teams. The server checks all of this.
- **Feeds:** **Chat**, **Transfers** (and requests), **Approvals** and the **Audit log** (who, when, what and why). **Undo** reverses a fund change or a rename: the main admin can undo any, a co-facilitator only their own.
- **View as team** shows exactly the team's own screens, live. Nothing pressed there is sent.
- Players only ever see "Funds adjusted by the facilitator" and the amount, never who made the change or why.

`npm run screenshots:6c` runs a game this way with a throwaway admin and co-facilitator (fund changes, an approval, undo, rename, View as team, the stuck flag, a login reset) and saves the screens to `screenshots/phase6/6c/`. It deletes everything it made.

## Projector, team photo, debrief and exports (Phase 6D)

- **Projector:** press **Projector** on the Live page. It opens in a new window for the room's screen or the main Zoom share; press **Full screen**. Co-facilitators can open it too. It always shows every team:
  - **Lobby:** the empty potion, "Starting soon".
  - **Round 1:** the round timer, the potion and each team's tasks x/5, by name. No scores or ranks.
  - **Pause:** the halftime potion, very large, and "Round 2 starts in …".
  - **Round 2:** the timer, the potion and the ranked teams with scores.
  - **Reveal:** one step per click, Space, → or presenter remote (← goes back): halftime vs final potion, then the verdict ("The potion is full!" or "The potion is not full. Nobody wins."), then the teams from last place to first.
- **Team photo:** the photo bonus task in the Inbox has an **Upload photo** button (PNG, JPG, WebP or GIF, up to 5 MB). It is accepted at once. Staff see it in the team panel and on the dashboard's **Photos** tab and can **Reject** it with a reason; the team can then upload a new one. Photos are stored under random names with all hidden image details removed, only staff see them, and they are deleted automatically after 30 days (a setting under Inbox bonus tasks).
- **Debrief** (main admin, from the Reveal): the game's **Debrief** tab, or **Debrief** on the Live page. Halftime vs final potion, each team's first chat message, who sent funds to whom, and the Ethical Dilemma answers grouped by option.
- **Exports:** on the Debrief tab, one button per CSV (final scores with the full breakdown, every transfer, every chat message, Ethical Dilemma answers, the audit log, first message per team) and **Download all (zip)**. Times are in your computer's time zone.
- **Dev tools:** with `ENABLE_DEV_TOOLS=true`, the main admin sees a Dev tools box in each team panel (fragment values, Finish all 5 tasks). Never in production.

`npm run screenshots:6d` runs all of this with a throwaway admin, including the projector at 1280×720 and 1920×1080 in every phase and a 20-team game, and saves the screens to `screenshots/phase6/6d/`. It deletes everything it made, photos included.

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

The database tests (the save-and-reload test and the mid-game restart test) run with `npm test` only when `TEST_DATABASE_URL` is set. They refuse the branch in `DATABASE_URL` and any database marked as production.

### Neon branches

| Branch                     | Used for                                                                                                                                                               | Where its connection strings go                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `dev` (the default branch) | Local development, the demo game, screenshots                                                                                                                          | `apps/server/.env`: `DATABASE_URL`, `DIRECT_URL` |
| `tests`                    | The database tests (made from `dev`, with data, so it has the main admin)                                                                                              | `apps/server/.env`: `TEST_DATABASE_URL`          |
| `production`               | Live events only (made from `dev`, schema only, no data). Marked as production inside the database (`npm run db:mark-production -- --yes`, run from the Render shell). | Render only, never a local `.env`                |

All three are set never to auto-delete. The seed, the test and screenshot scripts and the database tests refuse the production database, and a local server refuses to start on it.

## Deploy safely

Live addresses: web `https://play.zrutam.com` (Vercel), API `https://potion-api.zrutam.com` (Render). Secrets live only in the Render and Vercel dashboards.

### Production setup (reference)

| Where              | Setting                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Render web service | Singapore, Starter (paid, never sleeps), exactly 1 instance, health check `/healthz`, **Auto-Deploy off**                                                                                                                                                                |
| Render build       | `npm ci --include=dev && npm run build -w @magic-potion/server` (dev tools like Prisma and tsx are needed to build and to run the scripts)                                                                                                                               |
| Render start       | `npm run start -w @magic-potion/server`                                                                                                                                                                                                                                  |
| Render pre-deploy  | `cd apps/server && npx prisma migrate deploy`                                                                                                                                                                                                                            |
| Render environment | `NODE_ENV=production`, `NODE_VERSION=22`, `CLIENT_ORIGIN=https://play.zrutam.com`, `DATABASE_URL`, `DIRECT_URL` (Neon `production`), `JWT_SECRET`, `PHOTO_LINK_SECRET`, `BLOB_READ_WRITE_TOKEN`, `BLOB_PRIVATE_READ_WRITE_TOKEN`, `PUBLIC_BLOB_HOST`, `ADMIN_SEED_EMAIL` |
| Vercel project     | `magic-potion-web`, root `apps/web`, install `cd ../.. && npm ci`, build `npm run build`, output `dist`; `VITE_API_URL` and `VITE_SOCKET_URL` = `https://potion-api.zrutam.com` (type Config, not Secret: they are public; Production only)                              |
| Blob stores        | Production has its own: `magic-potion-prod-public` (public) and `magic-potion-prod-photos` (private). Local `.env` files use the dev stores.                                                                                                                             |
| Neon               | Branch `production`, scale-to-zero off                                                                                                                                                                                                                                   |
| DNS (Hostinger)    | `CNAME potion-api` → `magic-potion-server.onrender.com`, `CNAME play` → the value Vercel shows, TTL 300. (`api.zrutam.com` belongs to another project.)                                                                                                                  |

The server refuses to start in production unless every variable above is set and safe (`apps/server/src/productionCheck.ts`) and the database is marked as production (`apps/server/src/safety.ts`).

One-time database setup (done in 7B, from the Render shell, while a placeholder start command kept the instance up): check that the schema matches (`npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`), mark every existing migration as applied (`npx prisma migrate resolve --applied <name>`), `npx prisma migrate deploy`, `npm run db:mark-production -- --yes`, then `npm run db:seed` (on production it adds only the main admin and the task definitions). `ADMIN_SEED_PASSWORD` was removed from Render afterwards.

Keep Render's **Deploy Hook** URL secret (Settings): anyone who has it can start a deploy.

Checked live in 7B: `/healthz` answers `ok` with the database; http redirects to https on both sites; the security headers on the API and on the web pages (including `/staff` and `/projector`, which load through the rewrite); CORS allows only `https://play.zrutam.com`; Socket.IO connects over WebSocket (101) and long-polling; staff login; the start check refuses dev tools, a localhost `CLIENT_ORIGIN` and a non-production server on the production database.

### When

- Only when no game is running or paused (check the games list in the admin panel). Ideally the day before an event. **Never during an event**: a deploy restarts the server and drops every connection.
- Vercel rebuilds the web app on every push to `main`, so do not push to `main` during an event either.
- **Safe to repeat:** every player action and staff change carries an action ID (`Idempotency-Key` for staff). After a network drop the page sends it once more with the same ID and the server applies it only once. Uploads, spreadsheet imports and previews are never replayed.
- **Event size:** up to 12 teams on Render **Starter**; 13 to 20 teams on **Standard**, switched the day before and back after the event (never during one: it restarts the server). Results behind this rule: `docs/LOAD_TEST_RESULTS.md`.

### How

1. CI is green on `main`.
2. If the deploy includes a database migration: in Neon, create a backup branch from `production` (for example `backup-2026-10-01`). **Every backup branch gets an automatic expiry of 30 days or less** (set when creating it), so deleted game data never outlives its deletion date by more than about 30 days, as the client IT note promises. The main `dev`, `tests` and `production` branches never expire. Migrations must only add; anything that deletes or rewrites data needs a separate, agreed plan.
3. Render → the service → **Manual Deploy → Deploy latest commit**. The pre-deploy step runs the migrations first; if it fails, the old server keeps running.
4. Watch the logs for `Server listening` and `Loaded N live game(s)`, and no `Refusing to start`.
5. Open `https://potion-api.zrutam.com/healthz` (`"status":"ok","db":"ok"`), then log in at `https://play.zrutam.com/staff`.

### Roll back

- **Server:** Render → the service → Events → an earlier successful deploy → **Rollback**. This rolls back code only, not the database, which is why migrations must only add.
- **Web:** Vercel → `magic-potion-web` → Deployments → an earlier production deployment → **Instant Rollback**.
- **Database:** only if a migration went wrong. Restore `production` from the backup branch in Neon. Everything written after the backup is lost, so decide this together first.

## Testing the live site (Phase 7C)

`npm run live-test -w @magic-potion/server -- --mode game` or `-- --mode load` tests the live site from your own terminal. It asks for the main admin password with hidden typing and keeps it only in memory.

- Everything happens in one new game named `LOADTEST – <date time> <mode>` and, for the load test, 5 test co-facilitators (`loadtest-1..5@zrutam.invalid`). The script's guard refuses any call for another game or person.
- **Game mode:** 3 bot teams and 1 team for you, 4-minute rounds and a 1-minute pause run by the server's own timers, then the Debrief and every export are checked.
- **Load mode:** 25 teams (5 of them on long-polling only), 5 staff and a projector for 10 minutes (`--minutes`, `--teams`), with a login storm, a start storm, a pause and resume, a message to all and a reconnect storm.
- At the end, and on Ctrl+C or any error, the test game and test staff are deleted through two main-admin routes that only accept `LOADTEST – …` games (finished or never started) and `loadtest-N@zrutam.invalid` accounts. The script then checks from the API that nothing is left and every other game is unchanged.
- Results (no secrets) go to `live-results/` (git-ignored): a `.md` table of pass/fail targets and a `.json` with every number.
- Rehearse on your local server first: `-- --api http://localhost:4000` (uses `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` from `apps/server/.env`, and `--round 1` for 1-minute rounds). Timings there are slow because every database call travels to Neon in Singapore; only the live numbers count.

The corporate laptop and phone hotspot checks are in `docs/NETWORK_CHECKLIST.md`.

## Connection check page (/check)

`https://play.zrutam.com/check` is public: client IT teams and participants open it before an event to see whether the game will work on their network. No login, nothing stored, no client branding, and it never joins or sees a game.

- It checks: the website, the game server over HTTPS (`/healthz`, with the time), the live connection on long-polling and then on WebSocket, the speed (median of 10 pings: Good under 150 ms, OK under 400 ms, else Slow), a test picture from the public store, Google Fonts, YouTube and Vimeo (information only), and the browser version (minimums: Vite's default build target).
- Overall: **Ready to play**, **Will work, with limits** (WebSocket blocked, slow, pictures failing or an old browser) or **Blocked** (no server or no live connection), the addresses to allow for whatever failed, and **Copy results** (a text summary with the date and time, nothing personal).
- Its live connection is the server's own `/check` Socket.IO namespace (`apps/server/src/realtime/check.ts`): no login, no game rooms, one ping event, closed by the server after 30 s or 20 pings. Limits, separate from the login limits: 400 check connections per address per 10 minutes (a run uses 2, so a whole office on one address can run it the same morning) and 300 open at once.
- The test picture is `connection-check/pixel.png` in the public store (`PUBLIC_BLOB_HOST`); the file is `docs/connection-check/pixel.png`. `GET /check-info` tells the page its address.
- Only `/check` may contact YouTube and Vimeo (its own Content-Security-Policy in `apps/web/vercel.json`); every other page keeps the game's policy.

**Forcing long-polling for a whole game (our own tests):** open the player screen with `?transport=polling`, for example `https://play.zrutam.com/?transport=polling`. That browser tab then uses long-polling only, even after a refresh, and shows "Test mode: polling only" in the corner. `?transport=auto` or closing the tab switches it off. Normal players are never affected.

## Environment variables

Every variable is documented in `apps/server/.env.example` and `apps/web/.env.example`. `.env` files are ignored by git; never commit secrets.

Prisma 7 notes: migrations read `DIRECT_URL` via `apps/server/prisma.config.ts`; the running app connects through the pooled `DATABASE_URL` with the `pg` driver adapter (`apps/server/src/db.ts`). The generated client lives in `apps/server/src/generated` (git-ignored, created on `npm install`).
