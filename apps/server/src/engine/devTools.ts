import type { EngineResult } from '@magic-potion/shared';
import { fail } from './draft';
import type { GameEngine } from './engine';
import { correctSubmissions } from './solver';
import { runningAttempt, openTask } from './state';

// Local testing only: solves all of a team's tasks through the normal team commands, so the
// potion can be tested by hand before the task screens exist. The server registers the route
// that calls this only when ENABLE_DEV_TOOLS=true and NODE_ENV is not production.

export async function finishAllTasks(
  engine: GameEngine,
  teamId: string,
  // Stop after this many tasks (for screenshots with some tasks done). All when omitted.
  limit = Infinity,
): Promise<EngineResult<{ solved: number }>> {
  const team = engine.state.teams[teamId];
  if (!team) return fail('TEAM_NOT_FOUND');
  // An open task must be solved first, because only one task can be open at a time.
  const open = openTask(team);
  const ids = Object.keys(team.tasks).sort((a, b) =>
    a === open?.id ? -1 : b === open?.id ? 1 : 0,
  );
  let solved = 0;
  for (const taskId of ids) {
    const task = engine.state.teams[teamId]?.tasks[taskId];
    if (!task || task.status === 'DONE') continue;
    if (solved >= limit) break;
    if (!runningAttempt(task)) {
      const started = await engine.startTask(teamId, taskId);
      if (!started.ok) return started;
    }
    for (const submission of correctSubmissions(engine.state, engine.gameContent, teamId, taskId)) {
      const r = await engine.submit(teamId, taskId, submission);
      if (!r.ok) return r;
    }
    if (engine.state.teams[teamId]?.tasks[taskId]?.status === 'DONE') solved++;
  }
  return { ok: true, value: { solved } };
}
