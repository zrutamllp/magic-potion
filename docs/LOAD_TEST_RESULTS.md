# Phase 7C: live-site test results

Tests run against the live site (`https://potion-api.zrutam.com`, Render Singapore, Neon `production` in Singapore) from a PC in India, with `npm run live-test` (see the README, "Testing the live site"). Every run used its own `LOADTEST – …` game and deleted it afterwards; every clean-up check found 0 test games, 0 test staff and the other games unchanged.

**Status: the load tests are complete (2026-10-02).** Every target is met at up to 12 teams on Starter and 13 to 20 teams on Standard. Still open in 7C: the network checks at the end of this page.

## Event sizing rule

| Teams | Render instance | When to switch |
| ----- | --------------- | -------------- |
| up to 12 | **Starter** (0.5 CPU, 512 MB) | normal setting |
| 13 to 20 | **Standard** (1 CPU, 2 GB) | switch **the day before** the event, back to Starter after it |

Changing the instance type restarts the server. **Never change it during an event**, and only when no game is running or paused. More than 20 teams has not been tested.

## Runs

| Run | Size | Instance | p95 | Max | Errors | Notes |
| --- | ---- | -------- | --- | --- | ------ | ----- |
| A: full short game | 4 teams × 4 tabs | Starter | 155 ms | 453 ms | 0 | All 8 targets met. The server's own timers ran Round 1, the Pause, Round 2 and the Reveal; Debrief and every export worked. |
| B (first try) | 20 teams × 5 tabs | Starter | – | – | – | Stopped in the login storm: the JavaScript bcrypt froze the server, logins answered 500. Fixed (native bcrypt, shorter login transaction, connection pool, busy = 503 + retry). |
| B | 20 teams × 5 tabs | Starter | 682 ms | 8.3 s | 1 | The 8.3 s answer and the error were both money-request accepts, most likely caught in the deliberate reconnect storm (the script did not record times yet). |
| C | 12 teams × 5 tabs | Starter | 614 ms | 1.35 s | 0 | Every check passes against the adopted p95 target (750 ms); only the first target (500 ms) was missed. |
| B on Standard | 20 teams × 5 tabs | Standard | 588 ms | 1.5 s | 0 | Every check passes against the adopted p95 target (750 ms). 1 answer lost in the deliberate reconnect storm (counted apart, not an error). |
| D: full short game, after the action-ID fix | 4 teams × 4 tabs | Starter | 202 ms | 894 ms | 0 | All 8 targets met on the live site with action IDs: phases on the server's own timers (Pause at 240 s, Round 2 at 301 s, Reveal at 578 s), reconnect storm back in 1.3 s with timers unchanged, 0 lost updates (151 checked), no answer over 1 s. |

Every load run also passed: login storm (all teams within 1.6 to 2.7 s), start storm (every team's task started within 2.2 s), pause, resume and "Message all" reaching every connection (within 0.4 s), reconnect storm (every connection back within 2.5 to 3.9 s, timers unchanged), 0 lost state updates (over 1,000 checked per run).

## Where the p95 time goes (runs C and B on Standard)

These are estimates from the answer times per action; the script measures whole round trips, not their parts.

- **Network, India to Singapore: about 110 to 150 ms.** In run A (almost no server work) the median answer was 112 ms. `staff:watch`, which writes nothing and does not wait for other teams, answered in 155 to 170 ms (median) and 240 to 300 ms (p95) in runs C and B.
- **Waiting behind other teams: most of the rest, about 300 to 450 ms at p95.** A game runs one action at a time. Each action is saved in one database transaction (a few round trips to Neon in the same region, roughly 10 to 30 ms) and is then followed by rebuilding the state of every team, every co-facilitator and the projector (`apps/server/src/realtime/server.ts`, `push()`): about 9 ms of CPU on a fast PC for 20 teams, several times that on 0.5 CPU. When several teams act in the same moment they queue behind each other. That is why the slowest answers cluster in the start storm and the reconnect storm.
- **CPU alone is not the whole story.** Doubling the CPU (20 teams, Starter to Standard) only moved p95 from 682 to 588 ms, though it removed the multi-second outliers (max 8.3 s to 1.5 s). Twelve teams on Starter (614 ms) behave like 20 on Standard.

## Targets (decided 2026-10-02)

| Target | Value |
| ------ | ----- |
| Action answer time p95, end to end from India | **under 750 ms** |
| Action answer time max | under 2 s (strict) |
| Errors | 0 (strict) |
| Lost state updates | 0 (strict) |
| Memory | under 70% of the instance |

The first target was p95 under 500 ms. From India it is not reachable with the current design at 12 to 20 teams: with about 110 to 150 ms of network, the server would need its own p95 under about 350 ms, and the queue described above takes more than that in busy moments. Under a second feels immediate for these actions (sending money, answering, chat), so p95 under 750 ms was adopted. Runs C (614 ms) and B on Standard (588 ms) meet it; run B on Starter (682 ms) met p95 but not max (8.3 s), which is why 13 to 20 teams need Standard.

The code change that would bring p95 under 500 ms (gather the updates for other teams over about 200 ms and send them once) is listed under "Later" in `docs/BUILD_PLAN.md`.

## Memory

| Run | Instance | Peak |
| --- | -------- | ---- |
| B (20 teams) | Starter, 512 MB | about 38% |
| C (12 teams) | Starter, 512 MB | about 38% |
| B (20 teams) | Standard, 2 GB | about 13% |

All under the 70% target.

## Must-do before the first client event

- ✅ **Action IDs (safe to repeat)** – live since 2026-10-02 (commit `845608f`), confirmed by run D. If an answer is lost because a connection drops at that moment and the player or facilitator presses again, some actions are applied twice: sending money, money requests, a wrong answer (an extra wrong try), chat, staff money adjustments, "Message all", **End phase** (would also end the next phase) and **Extend** (adds the time twice). See `docs/BUILD_PLAN.md`, Phase 7C.

## Still to do in 7C (network checks)

- The full short game with a person playing and **WebSockets blocked** in the browser (`docs/NETWORK_CHECKLIST.md`, "Blocking WebSockets on purpose"). Long-polling under load already passed: 5 teams in every load run used long-polling only.
- The corporate laptop and phone hotspot checklist (`docs/NETWORK_CHECKLIST.md`).
