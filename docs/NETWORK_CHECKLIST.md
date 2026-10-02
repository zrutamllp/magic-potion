# Network checklist (Phase 7C)

Run this once on a **corporate laptop** (on the office network or its VPN) and once on a **phone hotspot**, before the first client event. Use a test game only: start one with `npm run live-test -w @magic-potion/server -- --mode game` (it makes a `LOADTEST – …` game and deletes it afterwards), or just check steps 1 to 3 on the login screen.

Write the result next to each line: ✅, ❌ or a note.

| # | Check | How | Corporate laptop | Phone hotspot |
| - | ----- | --- | ---------------- | ------------- |
| 0 | Connection check | Open `https://play.zrutam.com/check` and wait about 20 seconds. Note the overall result (Ready to play / Will work, with limits / Blocked) and press **Copy results** to keep the summary. | | |
| 1 | The site opens | Go to `https://play.zrutam.com`. No certificate or "blocked site" warning. | | |
| 2 | No proxy warning | No "this site is not allowed" or login page from the company proxy (Zscaler, Netskope and similar). | | |
| 3 | The API answers | Open `https://potion-api.zrutam.com/healthz`. It shows `"status":"ok","db":"ok"`. | | |
| 4 | Team login | Log in with the test team's code and password. | | |
| 5 | Live connection | The dot at the top right is green. | | |
| 6 | Which transport | Press F12 → Network → **Socket** filter → reload. A `transport=websocket` row with status **101** means WebSockets work. No such row but the dot is green means the network blocks WebSockets and the game uses long-polling: that is fine. | | |
| 7 | A task | Start a task and send an answer. The answer comes back within a second or two. | | |
| 8 | Chat | Send one chat message. It shows at once. | | |
| 9 | Reload keeps time | Note the timer, reload the page. The timer carries on from the same time (it does not reset). | | |
| 10 | Staff screen | Log in at `https://play.zrutam.com/staff` and open the game's dashboard. The team shows as online. | | |
| 11 | Projector | Open the projector view. The potion and teams show. | | |

**If step 6 shows long-polling only on the corporate network:** nothing to fix; note it. Tell the client's IT that `potion-api.zrutam.com` needs WebSockets for the smoothest game, but it works without them.

**If step 1, 2 or 3 fails on the corporate network:** ask the client's IT to allow `play.zrutam.com` and `potion-api.zrutam.com` (HTTPS, port 443, including WebSockets). The phone hotspot is the fallback for that room.

## Long-polling only on purpose (the fallback test)

Open the player screen with `?transport=polling` (for example `https://play.zrutam.com/?transport=polling`) and log in with the test team. That tab now uses long-polling only for the whole game, even after a refresh, and shows "Test mode: polling only" in the bottom corner. The game must keep working (green dot, timers, chat, tasks). F12 → Network shows repeated `transport=polling` requests and no WebSocket row. Open `?transport=auto` or close the tab when done. (Chrome's DevTools request blocking did not stop the WebSocket, so it is not used.)
