# Start here

## 1. Before you open Claude Code (about 20 minutes)

1. **Neon:** create a new project in region **AWS Asia Pacific (Singapore)**. Copy two connection strings: the pooled one (host contains `-pooler`) and the direct one.
2. **GitHub:** create a private repo called `magic-potion` and push this folder to it.
3. **Render and Vercel:** don't set these up yet. You'll use them in Phase 7.
4. Install Node.js LTS on your computer if you don't have it.

## 2. Open the folder in Claude Code

```
cd magic-potion
claude
```

Choose **Opus** as the model (`/model`).

## 3. First prompt (paste this)

```
Read CLAUDE.md, docs/GAME_RULES.md, docs/BUILD_PLAN.md and look at the images in design/.

Then:
1. Tell me in 10 lines what you understand the game is and how it will be built.
2. List any rule that is unclear or contradicts itself. Ask me before assuming.
3. Propose a plan for Phase 0 and Phase 1 only. Do not write code until I approve.
```

## 4. For every phase after that

```
We are on Phase N in docs/BUILD_PLAN.md. Enter plan mode, propose the plan, and wait for my approval. After building, run tests and type checks, commit, and tick the phase off in BUILD_PLAN.md.
```

## 5. Tips

- One phase per session. Start a new session (`/clear`) for each phase so the context stays clean.
- When Claude Code asks for the Neon strings, paste them into `apps/server/.env`, never into chat history you share.
- If something looks wrong on screen, take a screenshot and paste it into Claude Code.
- Never deploy during a live event.
