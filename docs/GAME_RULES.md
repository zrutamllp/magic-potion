# Game rules (source of truth)

Every number below is a default setting that the admin can change per game before it starts.

`docs/ORIGINAL_BRIEF.txt` is the first brief, kept for background only. Where it differs from this file, this file wins (for example: chat limit is 5, not 8; the time bonus formula is corrected; Deepthink and Memory Tray are not in the task pool).

## 1. Format

- 10 to 20 teams of 4 to 5 players. Support any number of teams from 3 to 25.
- Online: each team is in a Zoom breakout room. One Pilot shares their screen and operates the game.
- In the room: each team sits at a table around one laptop. Teams may talk to other teams only through the game chat.
- One login per team (team code + password). Only one active session per team at a time. A new login on the same team ends the older session. Staff can reset a team's session.
- Team passwords are stored hashed. Staff see a team's password only when it is created. If a team forgets it, staff reset the login, which sets a new password.

## 2. Game phases

| Phase | Default length | What happens |
|---|---|---|
| Lobby | Until admin starts | Teams log in, watch the intro video, read the rules |
| Round 1 | 35 min | Play. Leaderboard shows only the team's own row. Chat is open (5 messages) but not mentioned by the facilitator. |
| Pause | 10 min | Play clock stops. Everything freezes (see below). Players see the potion only. Halftime potion % is saved. |
| Round 2 | 35 min | Play continues with the same tasks. Leaderboard shows all teams. Chat limit resets to 5. |
| Reveal | Until admin ends | Scores are final. Show halftime and final potion side by side, then the leaderboard. |

- Total play time is 70 minutes (4,200 seconds). The play clock runs only in Round 1 and Round 2.
- The admin can pause, resume or extend any phase.
- During the Pause everything freezes: chat, transfers (sending, requests, and transfers already in transit), inbox, task timers and code lockouts. They resume with the same time left when Round 2 starts.
- When play ends (end of Round 2), a running task stops with no penalty and does not count as done.

## 3. Tasks

- Each team gets 5 tasks: 2 common and 3 unique.
- Common tasks: **The Vault** and **Find the Code** (the same task for every team, except for their fragments).
- The Vault: every team has the same 3 clues, but its 3 fragment digits are random per team, so every team's code is different.
- Find the Code: at game start each team gets its own **random letter code** (6 or 7 letters with no repeated letter, for example KRVTBLE; never a real word) and its own random cipher. The team sees its encoded code and part of the key; the rest of the key is its fragment, held by another team. So every team's answer and fragment are different. The code length is part of the task content (default 6 to 7 letters).
- **Find the Code must not be guessable without the fragment.** From its own key a team sees at most half of the different letters (rounded down), never the first letter, only the letters used least often, and never more than half of the letters in the code. Because the code is random letters, the hidden letters cannot be guessed from the visible ones.
- Unique tasks: 3 drawn at random from the other 10. Several teams may draw the same unique task.
- Only one task can be open at a time.
- The task timer starts when the team presses Start Task and stops when they solve it, the timer runs out, or they give up.
- **Exit:** leaves the task and returns to Home. The timer keeps running. The team's other tasks stay locked until this task is solved or fails.
- **Give up:** a button inside the task. It counts as a fail (same penalty as the timer running out).
- **Negative funds:** a team whose Task Funds are below zero cannot start a task (new or restarted) until its Task Funds are back to zero or above. A task already running continues.

Every task follows the same rules:

| Rule | Default |
|---|---|
| Points for solving | +10,000 |
| Hint | 1 per attempt, costs 1,500, only while the timer is running. Paid from whatever is left in Support Funds first; the rest comes from Task Funds. Blocked if it would take Task Funds below zero. |
| Timer runs out or Give up | Task fails and costs 3,500 Task Funds |
| After failing | The team may restart the task with a fresh timer and a fresh hint. Each failure costs 3,500 again. |
| Content on restart | Use a new content variant for that task if one is unused, else reuse the same content. Exception: Find the Code always keeps the same content, because the fragment another team holds is half of its key. The Vault changes its clues but keeps the same fragment digits. |
| Code lockout | The Vault, Find the Code and Escape Room lock after 3 wrong attempts: 60 seconds the first time, 2 minutes the second time, 4 minutes each time after that. Locks on earlier tries of the same task count, so giving up does not reset the lock length. The lengths are a setting. |

Ethical Dilemma is the exception: it has no hint, and any complete answer passes. The chosen option and reason are saved for the debrief.

### Task list

| # | Task | Type | Players do | Solved when | Timer | Hint gives |
|---|---|---|---|---|---|---|
| 1 | The Vault | Common | Solve 3 on-screen clues for 3 digits of a 6-digit code. The other 3 digits are a fragment held by another team. | All 6 digits entered | 12 min | One of the 3 on-screen digits |
| 2 | Find the Code | Common | Decode a message. Part of the cipher key is on screen; the rest is a fragment held by another team. | Decoded code entered | 12 min | One more letter of the key |
| 3 | Picture Puzzle | Unique | Drag scrambled tiles to rebuild an image | Image complete | 12 min | Numbers on correctly placed tiles |
| 4 | Hangman | Unique | Guess letters of a phrase. 6 wrong guesses fail the task. | Phrase revealed | 8 min | One letter revealed |
| 5 | Spot the Difference | Unique | Click 7 differences between two images | All 7 found | 8 min | One area highlighted |
| 6 | Alien Translator | Unique | Translate alien symbols using a partial legend | Translation entered | 12 min | Three more symbols decoded |
| 7 | Sound Sleuth | Unique | Listen to an audio story, answer 3 questions | All 3 correct | 10 min | Transcript of one clue |
| 8 | Pictionary | Unique | The game draws pictures stroke by stroke; guess 5 words | All 5 guessed | 8 min | First letter of the current word |
| 9 | Escape Room | Unique | Clear 4 linked stages: find the key, mirror puzzle, cipher, escape | Final stage cleared | 15 min | Help on the current stage |
| 10 | Riddle | Unique | Answer 3 riddles | All 3 correct | 8 min | A clue for one riddle |
| 11 | Ethical Dilemma | Unique | Pick one of 4 actions and write a one-line reason | Any complete answer | 8 min | None |
| 12 | Data Story | Unique | Read a mock dashboard, answer 3 questions | All 3 correct | 12 min | Which chart to look at |

Task content (images, words, riddles, audio, dashboards, answers) is uploaded per game in the admin panel. Each task can have several content variants (used on restart). Uploaded files go to Vercel Blob; the database stores only their URLs. The engine must work with any content. Ship one sample content pack so the game is playable out of the box.

### Server-side checking

- Text answers: compare after trimming, lowercasing and collapsing spaces.
- Picture Puzzle: the client sends the tile order; the server checks it.
- Spot the Difference: the client sends click coordinates; the server checks them against secret hit areas.
- Hangman: the client sends one letter at a time; the server reveals matching positions.
- Pictionary: the drawing strokes are public; the words are secret.
- Escape Room: each stage is checked on the server before the next stage is sent.

## 4. Fragment chains

- At game start, shuffle the teams into a random chain order (positions 0 to n-1), so the chain does not follow team names.
- **Vault chain:** the team at position p holds the Vault fragment needed by the team at position (p + 1) mod n.
- **Find the Code chain:** the team at position p holds the Find the Code fragment needed by the team at position (p + 2) mod n. With fewer than 3 teams, use offset 1.
- A fragment appears on the holder's Home screen as a "Found item" card, for example "Fragment: 4-2-9". It gives no hint about which team or task it belongs to.
- Fragment values for other teams are secret. A team only ever receives its own held fragments.
- If a holder team is missing (never logged in, dropped out or removed), staff can release that fragment directly to the team that needs it. The main admin can do this for any team; a co-facilitator for their assigned teams. This is audited.

## 5. Wallets and funds

| Wallet | Default start | Used for | Counts toward score |
|---|---|---|---|
| Task Funds | 10,000 | Transfers to other teams, fail penalties, the part of a hint cost that Support Funds cannot cover | Yes, x 2 |
| Support Funds | 4,500 | Hints only | No |

- Teams can send Task Funds to another team. A transfer needs enough balance and arrives 60 seconds after it is sent. The sender sees "Arriving in 0:45". The amount leaves the sender immediately.
- Teams can request funds from another team. A request carries only an amount and no free text. The receiving team accepts or declines.
- Accepting a request creates a normal transfer (60-second delay, counts as given and received). The accept is blocked if the payer's Task Funds are too low.
- Transfers in transit when the game ends still arrive and count.
- Transfers and requests appear in the chat feed but do not count toward the message limit.
- Task Funds may go below zero only through fail penalties and staff adjustments (a reason is required).
- While Task Funds are below zero the team cannot start a task (see section 3).

## 6. Chat

- One channel shared by all teams.
- 5 outgoing messages per team per round. After the 5th, the send box is blocked for the rest of that round.
- Show "Messages left: 3 of 5" beside the send box.
- Maximum 300 characters per message.

## 7. Inbox

- 3 bonus tasks per game, each worth +1,000 points, released at play times set by the admin (default: 10, 30 and 55 minutes).
- Inbox tasks stay open until the game ends.
- One is always the team photo: upload a screenshot or phone photo of the whole team. It is accepted automatically; staff can reject it. A rejected photo can be re-uploaded, and its 1,000 is removed until a photo is accepted.
- The other two are short questions with an answer checked by the server. 3 attempts per question.
- The inbox also shows game alerts: round start, pause, 5 minutes left, and facilitator messages.

## 8. Potion

- Each team's share = 100% / number of teams.
- The admin can remove a team from a running game. Shares are then recalculated over the remaining teams. A removed team does not count toward the potion.
- A team's share pours into the potion when it completes all 5 tasks. There is no partial fill.
- Save the potion % at the end of Round 1 as the halftime snapshot.

## 9. Scoring

Calculated only on the server, by a pure function.

```
score =
    10,000 x tasks completed
  + time bonus
  + 2 x Task Funds at the end
  + inbox bonus                      (1,000 per inbox task, up to 3,000)
  + min(floor(1.5 x funds given), 10,000)   (collaboration bonus, rounded down)
  - 2 x funds received               (shown as "Funds received", not "penalty")
  + Full Potion Bonus                (15,000 to every team if the potion reaches 100%)

time bonus = 5 x play seconds remaining when the team completes its 5th task, else 0
```

- "Play seconds remaining" counts to the current end of play, including any extensions the admin has added.
- All scores are whole numbers. The collaboration bonus is rounded down (1.5 x 333 = 499.5 becomes 499).
- "Funds given" and "funds received" count only transfers that have arrived.
- Staff fund adjustments change Task Funds but do not count as given or received.
- Show a live provisional score during play. The Full Potion Bonus is added only at the Reveal.
- The final leaderboard is only valid if the potion reaches 100%. If it does not, the Reveal screen says that nobody wins and still shows the scores.
- A removed team gets no score on the leaderboard and no Full Potion Bonus. Transfers it sent that already arrived still count for the teams that received them.

## 10. Leaderboard

- Round 1: the team sees only its own row, with no rank. Hide the rank everywhere in Round 1 (including the top bar).
- Round 2 and Reveal: all teams, ranked by score, showing tasks done (x/5), Task Funds, score and potion share.
- Equal scores share a rank, and the next rank is skipped (1, 2, 2, 4). Tied teams are listed by more tasks done, then by team name.
- Removed teams are not shown on the leaderboard.
- The projector view always shows all teams and the potion.

## 11. Staff roles

Staff log in with their own name, email and password. The main admin creates co-facilitator accounts and sets their starting password. Accounts persist across games; teams are assigned per game. No email service is needed.

| Action | Main admin | Co-facilitator |
|---|---|---|
| See teams, progress, chat and transfers | All | Assigned teams only |
| Adjust Task Funds | Any amount | Up to 2,000 up or down per change, reason required. Larger changes become a request the admin approves. |
| Rename a team, reset its login | Yes | Assigned teams only |
| Unlock or reopen a task | Yes | No |
| Release a missing team's fragment | Yes | Assigned teams only |
| Remove a team from a running game | Yes | No |
| Start, pause, end or extend phases | Yes | No |
| Send inbox messages to all teams | Yes | No |
| Create games, upload content, edit settings | Yes | No |
| Create co-facilitators, assign teams, reset staff passwords | Yes | No |
| Projector view | Yes | Yes |
| Undo a manual change | Any | Own changes only |

- Every staff action is written to an audit log: staff name, time, team, action, before, after and reason.
- Players see only "Funds adjusted by the facilitator: +1,000", never who made the change.

## 12. Game settings (all editable per game)

Client name, logo and colours; number of teams; team names and passwords; task content; starting funds for both wallets; hint cost; fail penalty; lockout attempts and lock lengths; task timers; round and pause lengths; chat limit and message length; transfer delay; inbox release times, reward and answer attempts; scoring multipliers; collaboration cap; Full Potion Bonus.

Scoring settings lock when Round 1 starts. Team names, funds and phase timing can still change live.

## 13. Exports (for the debrief)

CSV per game: final scores; every transfer; every chat message with time; Ethical Dilemma answers; the audit log; first cross-team message time per team.

## 14. Design corrections

The images in `design/` came from a generic gaming template. Where they differ from these rules, the rules win:

- Show the team name, not a person or "Level". Remove XP, achievements, levels and "worldwide" rankings.
- Use one navigation: sidebar on desktop, tab bar on narrow screens.
- Replace "Overall progress 15/20 tasks" with the potion meter and the team's own tasks (x/5).
- Home: every task is worth 10,000. Show the timer, a Unique or Common tag and a status (Not started, In progress, Done, Failed). Add the "Found item" fragment cards.
- Chat: one channel for all teams, with no call or video buttons. Show messages left and transfer events.
- Funds: remove the power-ups, cosmetics shop, "Add Funds" and "Earned today". Show both wallets, Send and Request panels, and a transaction log with pending transfers.
- Inbox: only the 3 bonus tasks and game alerts.
- Leaderboard: teams, not individual players.
- Escape Room: hint costs 1,500 Support Funds. "Ask for Help" opens the shared chat.
- Task screens: "Exit" returns to Home and the timer keeps running. Add a "Give up" button that counts as a fail.
- Picture Puzzle ("The Shattered Blueprint"): 12-minute timer, not 20. The factory photo is sample content only.
- Keep the dark theme, card style and colours from the designs.

## 15. Answered questions

1. **Hints paid from Task Funds:** the cost is split. Take whatever is left in Support Funds first, and the rest from Task Funds. Example: Support Funds 1,000, hint 1,500, so 1,000 comes from Support Funds and 500 from Task Funds. The hint is blocked if it would take Task Funds below zero.
2. **Releasing a missing team's fragment:** co-facilitators can release it for their assigned teams (the team that needs the fragment). It is audited like every staff action.
3. **Team passwords:** stored hashed, like staff passwords. Staff see them only when created; "reset login" sets a new one.
4. **Rounding the collaboration bonus:** round down, then apply the 10,000 cap. Any whole transfer amount is allowed.
5. **Tied scores:** teams share the rank (1, 2, 2, 4). See section 10.
6. **Removed teams:** dropped from the leaderboard, the potion and the Full Potion Bonus. See sections 8 and 9.
7. **Restarting Find the Code:** it keeps the same content, so the held fragment still works. See section 3.
8. **Find the Code fragments:** each team gets its own random code and cipher, so a team never holds the fragment it needs itself. See section 3.

## 16. Player-facing text (learning design)

Teams must discover for themselves that they depend on each other. So everything players read (the Rules tab, screens, buttons, alerts, empty states and error messages):

- Never tells teams to cooperate, help, share or talk to other teams, and never suggests using the chat for that.
- Never explains why Round 1 and Round 2 differ (for example, that other teams appear on the leaderboard in Round 2).
- Never explains what Found items are for or who needs them. The cards on Home show the value only.
- States facts only: what a thing is, what it costs, and the limits. Facilitators give any guidance in the room or in Zoom.
