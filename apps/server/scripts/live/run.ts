// Live-site tests (Phase 7C), run from your own terminal against the real server:
//
//   npm run live-test -w @magic-potion/server -- --mode game
//   npm run live-test -w @magic-potion/server -- --mode load
//
// Options: --api <url> (default https://potion-api.zrutam.com), --email <main admin>
// (default ceo@zrutam.com), --minutes <load minutes> (default 10), --teams <load teams>
// (default 25), --round <game-mode round minutes> (default 4).
//
// Everything happens in one new game named "LOADTEST – …" and with test co-facilitators
// (loadtest-N@zrutam.invalid). No other game or person is changed. At the end, and on Ctrl+C or
// any error, the test game and the test staff are deleted and the counts are checked.
// The main admin password is typed with hidden input and kept only in memory. Against a local
// server (--api http://localhost:4000) it comes from apps/server/.env instead.
// Results (no secrets) go to live-results/ in the repo root.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPORT_FILES,
  TEST_GAME_PREFIX,
  type AdminGame,
  type GameSettings,
  type StaffMember,
} from '@magic-potion/shared';
import {
  SLOW_MS,
  StaffApi,
  Timings,
  act,
  between,
  botTurn,
  connectStaff,
  connectTeam,
  hiddenPrompt,
  isTestGameName,
  isTestStaffEmail,
  newLog,
  now,
  phaseEndsAt,
  pick,
  sleep,
  teamLogin,
  timeline,
  waitForEnter,
  type Bot,
  type TeamLogin,
  type Watcher,
} from './lib';

// ---------- Options ----------

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const MODE = arg('mode', '');
if (MODE !== 'game' && MODE !== 'load') {
  console.error('Use --mode game (full short game) or --mode load (load test).');
  process.exit(1);
}
const API = arg('api', 'https://potion-api.zrutam.com').replace(/\/$/, '');
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API);
const EMAIL = arg('email', LOCAL ? (process.env['ADMIN_SEED_EMAIL'] ?? '') : 'ceo@zrutam.com');
const LOAD_MINUTES = Number(arg('minutes', '10'));
const LOAD_TEAMS = Number(arg('teams', '25'));
// --name "bots A" names the game "LOADTEST – bots A" (default: date, time and mode).
const NAME = arg('name', '');
// Game mode with bots on every team and no person (no Enter prompts).
const BOTS_ONLY = process.argv.includes('--bots-only');
// Browser tabs per team. A team has one login; its tabs share it, like several players
// watching one logged-in screen. The team's pace stays the same, spread over its tabs.
const TABS = Math.max(1, Number(arg('tabs', '1')));
const STAFF_COUNT = 5;
const POLLING_TEAMS = 5;

// The game mode: 3 bot teams and 1 team for a person.
const GAME_TEAMS = 4;
// --round <minutes> shortens the rounds for a rehearsal on a local server.
const GAME_ROUND = Number(arg('round', '4')) * 60;
const GAME_PAUSE = 60;

// ---------- State (for the clean-up) ----------

const log = newLog();
const api = new StaffApi(API, log);
let gameName = '';
const bots: Bot[] = [];
const watchers: Watcher[] = [];
let cleaning: Promise<void> | null = null;
const results: Record<string, unknown> = {
  mode: MODE,
  api: API,
  startedAt: new Date().toISOString(),
};
const checks: { name: string; target: string; value: string; pass: boolean }[] = [];
const check = (name: string, target: string, value: string, pass: boolean) => {
  checks.push({ name, target, value, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}: ${value} (target ${target})`);
};

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- Setup ----------

async function password(): Promise<string> {
  if (LOCAL) {
    const pw = process.env['ADMIN_SEED_PASSWORD'];
    if (!pw || !EMAIL)
      throw new Error(
        'Local run: set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in apps/server/.env.',
      );
    return pw;
  }
  return hiddenPrompt(`Password for ${EMAIL} (not shown): `);
}

function testSettings(base: GameSettings): GameSettings {
  const s = structuredClone(base);
  if (MODE === 'game') {
    s.phases = { round1Seconds: GAME_ROUND, pauseSeconds: GAME_PAUSE, round2Seconds: GAME_ROUND };
    s.inbox.releaseAtPlaySeconds = [60, 180, 360];
    s.transfers.delaySeconds = 20;
  } else {
    // The whole load stays inside Round 1.
    s.phases = { round1Seconds: (LOAD_MINUTES + 5) * 60, pauseSeconds: 60, round2Seconds: 120 };
    s.inbox.releaseAtPlaySeconds = [120, 600, 1200];
    s.transfers.delaySeconds = 30;
    // More chat than a real game, because chat goes to every team.
    s.chat.messagesPerRound = 40;
  }
  return s;
}

async function makeTestStaff(game: AdminGame, users: StaffMember[]) {
  // A test co-facilitator left over from a run that could not finish.
  for (const u of users.filter((x) => isTestStaffEmail(x.email))) {
    api.testStaffIds.add(u.id);
    await api.call('DELETE', `/users/${u.id}`);
  }
  const staff: { id: string; label: string; token: string; teamIds: string[] }[] = [];
  for (let i = 1; i <= STAFF_COUNT; i++) {
    const pw = randomBytes(18).toString('base64url');
    const made = await api.call<StaffMember>('POST', '/users', {
      name: `Load test ${i}`,
      email: `loadtest-${i}@zrutam.invalid`,
      password: pw,
    });
    api.testStaffIds.add(made.id);
    // Dealt out in turn (12 teams: 3, 3, 2, 2, 2), so every co-facilitator has teams.
    const teamIds = game.teams.filter((_, t) => t % STAFF_COUNT === i - 1).map((t) => t.id);
    await api.call('PUT', `/games/${game.id}/assignments`, { staffUserId: made.id, teamIds });
    const own = new StaffApi(API, log);
    await own.login(`loadtest-${i}@zrutam.invalid`, pw);
    staff.push({ id: made.id, label: `staff ${i}`, token: own.bearer, teamIds });
  }
  return staff;
}

async function loginStorm(logins: TeamLogin[]) {
  console.log(`Login storm: ${logins.length} teams at once...`);
  const started = now();
  const done = await Promise.all(logins.map((l) => teamLogin(API, l)));
  const total = now() - started;
  const slowest = Math.max(...done.map((d) => d.ms));
  results['loginStorm'] = { teams: logins.length, totalMs: total, slowestMs: slowest };
  return done;
}

async function connectBots(logins: TeamLogin[], auths: { token: string; teamId: string }[]) {
  const connected = await Promise.all(
    logins.flatMap((l, i) =>
      Array.from({ length: TABS }, (_, tab) =>
        connectTeam(
          API,
          TABS > 1 ? { ...l, code: `${l.code}#${tab + 1}` } : l,
          auths[i]!,
          MODE === 'load' && i < POLLING_TEAMS ? 'polling' : 'websocket',
        ),
      ),
    ),
  );
  bots.push(...connected);
}

// Every connection drops at the same moment. Each must get its full state back, with the
// phase end time unchanged.
async function reconnectStorm() {
  const endsBefore = new Map(bots.map((b) => [b, phaseEndsAt(b.state)]));
  const before = timeline.label;
  timeline.label = 'reconnect storm';
  const dropAt = now();
  timeline.deliberateDropAt = dropAt;
  for (const b of bots) b.socket.io.engine.close();
  const backMs = await waitAll('Reconnect', (b) => b.lastFullAt > dropAt, 30_000);
  // The few seconds after everyone is back still count as the storm.
  void sleep(5_000).then(() => {
    if (timeline.label === 'reconnect storm') timeline.label = before;
  });
  const perTeam = bots.map((b) => b.lastFullAt - dropAt);
  const drift = bots.map((b) => {
    const before = endsBefore.get(b);
    const after = phaseEndsAt(b.state);
    return before && after ? Math.abs(after - before) : 0;
  });
  results['reconnectStorm'] = {
    connections: bots.length,
    allBackMs: backMs,
    slowestMs: Math.max(...perTeam),
    maxTimerDriftMs: Math.max(...drift),
  };
}

// ---------- Checks during play ----------

async function waitAll(label: string, ok: (b: Bot) => boolean, withinMs: number) {
  const started = now();
  while (now() - started < withinMs) {
    if (bots.every(ok)) return now() - started;
    await sleep(100);
  }
  const missing = bots.filter((b) => !ok(b)).map((b) => b.login.code);
  log.errors.push(`${label}: ${missing.length} team(s) did not get it: ${missing.join(', ')}`);
  return null;
}

let lost = 0;
let updatesChecked = 0;
async function botLoop(bot: Bot, until: () => boolean, gapMs: [number, number]) {
  while (!until()) {
    await sleep(between(gapMs[0], gapMs[1]));
    if (until() || !bot.socket.connected) continue;
    const before = bot.lastUpdateAt;
    const { event, ok } = await botTurn(log, bot);
    if (ok && event !== 'funds:decline') {
      updatesChecked++;
      setTimeout(() => {
        if (bot.lastUpdateAt <= before) {
          lost++;
          log.errors.push(`${bot.login.code} ${event}: no state update within 3 s`);
        }
      }, 3_000);
    }
  }
}

async function health(until: () => boolean, timings: Timings) {
  while (!until()) {
    const started = now();
    try {
      const res = await fetch(`${API}/healthz`);
      const body = (await res.json()) as { status: string; db: string };
      if (body.status !== 'ok' || body.db !== 'ok')
        log.errors.push(`healthz: ${JSON.stringify(body)}`);
      timings.add(now() - started);
    } catch (e) {
      log.errors.push(`healthz: ${e instanceof Error ? e.message : 'failed'}`);
    }
    await sleep(5_000);
  }
}

async function phase(): Promise<string> {
  return (await api.call<AdminGame>('GET', `/games/${api.gameId}`)).phase;
}

async function endGame() {
  for (let i = 0; i < 6 && (await phase()) !== 'REVEAL'; i++) {
    await api.call('POST', `/games/${api.gameId}/end-phase`);
    await sleep(1_000);
  }
}

// ---------- The two modes ----------

async function runLoad(game: AdminGame, logins: TeamLogin[], users: StaffMember[]) {
  const staff = await makeTestStaff(game, users);
  const auths = await loginStorm(logins);
  await connectBots(logins, auths);
  for (const s of staff) watchers.push(await connectStaff(API, s.token, game.id, 'staff', s.label));
  watchers.push(await connectStaff(API, api.bearer, game.id, 'projector', 'projector'));
  console.log(
    `Connected: ${logins.length} teams × ${TABS} tab(s) = ${bots.length} team connections (${POLLING_TEAMS} teams on long-polling only), ${staff.length} staff, 1 projector.`,
  );

  // Start storm: every team starts a task in the first seconds of Round 1.
  timeline.label = 'start storm';
  await api.call('POST', `/games/${game.id}/start`);
  const startAt = now();
  timeline.startedAt = startAt;
  await waitAll('Round 1 start', (b) => b.state?.game.phase === 'ROUND1', 10_000);
  // One tab per team starts it, as one player would.
  const firstTabs = bots.filter((_, i) => i % TABS === 0);
  const storm = await Promise.all(
    firstTabs.map(async (b) => {
      const task = b.state?.team.tasks.find((t) => t.status === 'NOT_STARTED');
      const sent = now();
      const ack = task ? await act(log, b.socket, 'task:start', { taskId: task.id }) : null;
      return { ok: ack?.ok === true, doneAt: now(), ms: now() - sent };
    }),
  );
  timeline.label = 'normal load';
  results['startStorm'] = {
    teams: firstTabs.length,
    started: storm.filter((s) => s.ok).length,
    lastDoneAfterMs: Math.max(...storm.map((s) => s.doneAt - startAt)),
    slowestAckMs: Math.max(...storm.map((s) => s.ms)),
  };

  const loadMs = LOAD_MINUTES * 60_000;
  const stopAt = startAt + loadMs;
  const until = () => now() >= stopAt;
  const healthTimes = new Timings();
  const loops = [
    ...bots.map((b) => botLoop(b, until, [4_000 * TABS, 8_000 * TABS])),
    health(until, healthTimes),
    ...watchers
      .filter((w) => w.label.startsWith('staff'))
      .map(async (w, i) => {
        while (!until()) {
          await sleep(10_000);
          await act(log, w.socket, 'staff:watch', { teamId: pick(staff[i]!.teamIds) ?? null });
        }
      }),
  ];

  const at = (fraction: number) => sleep(Math.max(0, startAt + loadMs * fraction - now()));
  const events = (async () => {
    // Broadcast: pause and resume once, and one message to every team.
    await at(0.3);
    timeline.label = 'pause';
    await api.call('POST', `/games/${game.id}/freeze`);
    const frozenMs = await waitAll('Pause', (b) => b.state?.game.frozen === true, 10_000);
    await sleep(15_000);
    timeline.label = 'resume';
    await api.call('POST', `/games/${game.id}/resume`);
    const resumedMs = await waitAll('Resume', (b) => b.state?.game.frozen === false, 10_000);
    await sleep(5_000);
    timeline.label = 'normal load';
    await at(0.4);
    timeline.label = 'message all';
    const title = `Load test message ${stamp()}`;
    await api.call('POST', `/games/${game.id}/live/message`, {
      title,
      body: 'Please ignore: this is a test.',
    });
    const messageMs = await waitAll(
      'Message all',
      (b) => b.state?.inbox.some((i) => i.title === title) === true,
      10_000,
    );
    results['broadcast'] = { frozenMs, resumedMs, messageMs };
    await sleep(5_000);
    timeline.label = 'normal load';

    // Reconnect storm: every team's connection drops at the same moment.
    await at(0.7);
    await reconnectStorm();
  })();

  await Promise.all([...loops, events]);
  timeline.label = 'wind-down';
  await sleep(3_500);
  results['healthz'] = healthTimes.summary();
  console.log('Load finished. Ending the test game...');
  await endGame();
}

async function runGame(game: AdminGame, logins: TeamLogin[]) {
  const people = BOTS_ONLY ? null : logins.at(-1)!;
  const botLogins = BOTS_ONLY ? logins : logins.slice(0, -1);
  if (people) {
    console.log('');
    console.log(`Your team is ${people.name} (code ${people.code}).`);
    console.log(
      'In the admin panel, open this LOADTEST game, give that team a new password there,',
    );
    console.log(
      'and log in as it at https://play.zrutam.com (its password is only on your screen).',
    );
    await waitForEnter('Press Enter when you are logged in and ready to start... ');
  }

  const auths = await loginStorm(botLogins);
  await connectBots(botLogins, auths);
  watchers.push(await connectStaff(API, api.bearer, game.id, 'staff', 'admin'));
  const projector = await connectStaff(API, api.bearer, game.id, 'projector', 'projector');
  watchers.push(projector);

  timeline.label = 'ROUND1';
  await api.call('POST', `/games/${game.id}/start`);
  const startAt = now();
  timeline.startedAt = startAt;
  console.log(
    `Started. The server's own timers now run Round 1 (${GAME_ROUND / 60} min), the Pause (${GAME_PAUSE / 60} min), Round 2 and the end.`,
  );
  if (people) {
    console.log(
      'Halfway through Round 1: block WebSockets in DevTools (see the checklist) and reload.',
    );
  }
  // Bots only: a reconnect storm halfway through Round 1.
  const storm = BOTS_ONLY
    ? sleep((GAME_ROUND / 2) * 1000).then(() => (done() ? undefined : reconnectStorm()))
    : Promise.resolve();
  const limit = startAt + (2 * GAME_ROUND + GAME_PAUSE + 180) * 1000;
  const done = () => projector.lastPhase === 'REVEAL' || now() > limit;
  const healthTimes = new Timings();
  const phases: string[] = [];
  const watch = (async () => {
    let last = '';
    while (!done()) {
      if (projector.lastPhase && projector.lastPhase !== last) {
        last = projector.lastPhase;
        if (timeline.label !== 'reconnect storm') timeline.label = last;
        phases.push(`${last} at ${Math.round((now() - startAt) / 1000)} s`);
        console.log(`  Phase: ${last} (${Math.round((now() - startAt) / 1000)} s)`);
      }
      await sleep(1_000);
    }
  })();
  await Promise.all([
    ...bots.map((b) => botLoop(b, done, [6_000 * TABS, 12_000 * TABS])),
    health(done, healthTimes),
    watch,
    storm,
  ]);
  phases.push(`${projector.lastPhase ?? '?'} at ${Math.round((now() - startAt) / 1000)} s`);
  results['phases'] = phases;
  results['healthz'] = healthTimes.summary();
  if (projector.lastPhase !== 'REVEAL') {
    log.errors.push('The game did not reach the Reveal on its own timers.');
    await endGame();
  }

  // The Debrief and every export.
  const exportsChecked: Record<string, string> = {};
  const debrief = await api.call<Record<string, unknown>>('GET', `/games/${game.id}/debrief`);
  exportsChecked['debrief'] = `${Object.keys(debrief).length} sections`;
  for (const f of EXPORT_FILES) {
    const csv = await api.call<string>('GET', `/games/${game.id}/exports/${f.name}.csv`);
    exportsChecked[`${f.name}.csv`] = `${csv.trim().split('\n').length} lines`;
  }
  const zip = await fetch(`${API}/api/staff/games/${game.id}/exports/all.zip`, {
    headers: { authorization: `Bearer ${api.bearer}` },
  });
  exportsChecked['all.zip'] = `${zip.status}, ${(await zip.arrayBuffer()).byteLength} bytes`;
  if (!zip.ok) log.errors.push(`all.zip: ${zip.status}`);
  results['exports'] = exportsChecked;
  console.log('Exports:', exportsChecked);
  if (people) {
    await waitForEnter('Look at the Reveal and the Debrief now. Press Enter to clean up... ');
  }
}

// ---------- Clean-up ----------

async function cleanup(before: { id: string; name: string }[]) {
  for (const b of bots) b.socket.disconnect();
  for (const w of watchers) w.socket.disconnect();
  const cleanupLog: Record<string, unknown> = {};
  if (api.gameId) {
    try {
      const p = await phase();
      if (p !== 'LOBBY' && p !== 'REVEAL') await endGame();
      const deleted = await api.call<{ teams: number; photos: number }>(
        'POST',
        `/games/${api.gameId}/delete-test-game`,
        { confirmName: gameName },
      );
      cleanupLog['deletedGame'] = { name: gameName, ...deleted };
    } catch (e) {
      cleanupLog['deleteGameError'] = e instanceof Error ? e.message : String(e);
    }
  }
  for (const id of api.testStaffIds) {
    try {
      await api.call('DELETE', `/users/${id}`);
    } catch (e) {
      cleanupLog[`deleteStaffError ${id}`] = e instanceof Error ? e.message : String(e);
    }
  }

  // Proof, from the API: nothing left, and every other game as it was.
  const after = await api.games();
  const users = await api.call<StaffMember[]>('GET', '/users');
  // Nothing is made unless this server can delete it again afterwards.
  await api.preflight();
  const others = (list: { id: string; name: string }[]) =>
    list
      .filter((g) => !isTestGameName(g.name))
      .map((g) => `${g.id}|${g.name}`)
      .sort()
      .join('\n');
  const counts = {
    testGamesLeft: after.filter((g) => isTestGameName(g.name)).length,
    testStaffLeft: users.filter((u) => isTestStaffEmail(u.email)).length,
    otherGamesBefore: before.filter((g) => !isTestGameName(g.name)).length,
    otherGamesAfter: after.filter((g) => !isTestGameName(g.name)).length,
    otherGamesUnchanged: others(before) === others(after),
  };
  cleanupLog['counts'] = counts;
  results['cleanup'] = cleanupLog;
  console.log('Clean-up:', JSON.stringify(cleanupLog, null, 2));
}

// ---------- Results ----------

// Slow answers (over 1 s) by what the test was doing, and the slowest ten with their minute.
function slowSection(): string[] {
  const out = [`## Answers slower than ${SLOW_MS / 1000} s: ${log.slow.length}`, ''];
  const by = new Map<string, number>();
  for (const s of log.slow) by.set(s.during, (by.get(s.during) ?? 0) + 1);
  if (by.size > 0) {
    out.push('| During | How many |', '|---|---|');
    for (const [during, n] of by) out.push(`| ${during} | ${n} |`);
    out.push('', '| Action | Answer time | Sent at (m:ss) | During | Connection dropped |');
    out.push('|---|---|---|---|---|');
    for (const s of [...log.slow].sort((a, b) => b.ms - a.ms).slice(0, 10)) {
      out.push(
        `| ${s.event} | ${s.ms} ms | ${s.sentAt} | ${s.during} | ${s.connectionDropped ? 'yes' : 'no'} |`,
      );
    }
  }
  const lost = log.lostInDeliberateDrop;
  out.push(
    '',
    `## Answers lost because the test cut their connection on purpose: ${lost.length}`,
    '',
    'Not counted as errors. A real player would see "The server did not answer" and could press again.',
  );
  for (const l of lost) out.push(`- ${l.event}, sent at ${l.sentAt} during ${l.during}`);
  const w = log.acksWithoutDeliberateDrop.summary();
  out.push(
    '',
    `Answer times without the answers caught in the deliberate drop: p95 ${w.p95} ms, max ${w.max} ms (${w.count} answers). The pass/fail lines above use every answer.`,
  );
  return out;
}

function report() {
  const acks = log.acks.summary();
  results['acks'] = acks;
  results['acksWithoutDeliberateDrop'] = log.acksWithoutDeliberateDrop.summary();
  results['slowAnswers'] = log.slow;
  results['lostInDeliberateDrop'] = log.lostInDeliberateDrop;
  results['byEvent'] = Object.fromEntries([...log.byEvent].map(([k, v]) => [k, v.summary()]));
  results['refusedByRules'] = Object.fromEntries(log.refused);
  results['errors'] = log.errors;
  results['lostUpdates'] = { checked: updatesChecked, lost };
  results['connections'] = {
    teams: bots.map((b) => ({
      code: b.login.code,
      transport: b.transport,
      connects: b.connects,
      disconnects: b.disconnects,
    })),
    staff: watchers.map((w) => ({
      label: w.label,
      updates: w.updates,
      disconnects: w.disconnects,
    })),
  };

  console.log('');
  console.log('Targets:');
  // Target adopted in 7C for players in India (docs/LOAD_TEST_RESULTS.md).
  check('Action answer time p95', '< 750 ms', `${acks.p95} ms`, acks.p95 < 750);
  check('Action answer time max', '< 2000 ms', `${acks.max} ms`, acks.max < 2_000);
  check('Errors', '0', String(log.errors.length), log.errors.length === 0);
  check('Lost state updates', '0', `${lost} of ${updatesChecked}`, lost === 0);
  const ls = results['loginStorm'] as { totalMs: number } | undefined;
  if (ls) check('Login storm', '< 10 s', `${ls.totalMs} ms`, ls.totalMs < 10_000);
  const ss = results['startStorm'] as
    { teams: number; started: number; lastDoneAfterMs: number } | undefined;
  if (ss) {
    check(
      'Start storm',
      `${ss.teams} tasks started within 5 s`,
      `${ss.started} started, last after ${ss.lastDoneAfterMs} ms`,
      ss.started === ss.teams && ss.lastDoneAfterMs < 5_000,
    );
  }
  const bc = results['broadcast'] as Record<string, number | null> | undefined;
  if (bc) {
    const all = Object.values(bc).every((v) => v !== null);
    check('Pause, resume and message reach every team', 'all', JSON.stringify(bc), all);
  }
  const rs = results['reconnectStorm'] as
    { allBackMs: number | null; maxTimerDriftMs: number } | undefined;
  if (rs) {
    check(
      'Reconnect storm: every team back',
      '< 15 s',
      rs.allBackMs === null ? 'not all back' : `${rs.allBackMs} ms`,
      rs.allBackMs !== null && rs.allBackMs < 15_000,
    );
    check(
      'Timers unchanged after reconnect',
      '< 1 s drift',
      `${rs.maxTimerDriftMs} ms`,
      rs.maxTimerDriftMs < 1_000,
    );
  }
  const counts = (results['cleanup'] as { counts?: Record<string, unknown> } | undefined)?.counts;
  if (counts) {
    check(
      'Clean-up',
      'no test game or staff left, other games unchanged',
      JSON.stringify(counts),
      counts['testGamesLeft'] === 0 &&
        counts['testStaffLeft'] === 0 &&
        counts['otherGamesUnchanged'] === true,
    );
  }
  results['checks'] = checks;
  results['finishedAt'] = new Date().toISOString();

  const dir = join(import.meta.dirname, '../../../../live-results');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${MODE}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  writeFileSync(`${file}.json`, JSON.stringify(results, null, 2));
  const md = [
    `# Live test: ${MODE} (${results['startedAt'] as string})`,
    '',
    `API: ${API}`,
    '',
    '| Check | Target | Result | |',
    '|---|---|---|---|',
    ...checks.map((c) => `| ${c.name} | ${c.target} | ${c.value} | ${c.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '',
    ...slowSection(),
    '',
    'Full numbers are in the .json file next to this one.',
  ].join('\n');
  writeFileSync(`${file}.md`, md);
  console.log(`\nResults: ${file}.md and .json`);
  return checks.every((c) => c.pass);
}

// ---------- Main ----------

async function main() {
  console.log(`Live test (${MODE}) against ${API}`);
  const me = await api.login(EMAIL, await password());
  if (me.role !== 'MAIN_ADMIN') throw new Error('Log in as the main admin.');
  const before = await api.games();
  const leftover = before.filter((g) => isTestGameName(g.name));
  if (leftover.length > 0) {
    throw new Error(
      `A test game from an earlier run is still there: ${leftover.map((g) => g.name).join(', ')}. Delete it first (ask Claude).`,
    );
  }
  const users = await api.call<StaffMember[]>('GET', '/users');

  const stop = (signal: string) => {
    console.log(`\n${signal}: cleaning up before stopping...`);
    cleaning ??= cleanup(before);
    void cleaning.then(() => {
      report();
      process.exit(1);
    });
  };
  process.on('SIGINT', () => stop('Stopped'));

  try {
    gameName = `${TEST_GAME_PREFIX}${NAME || `${stamp()} ${MODE}`}`;
    const teamCount = MODE === 'game' ? GAME_TEAMS : LOAD_TEAMS;
    const created = await api.call<{ game: AdminGame; logins: TeamLogin[] }>('POST', '/games', {
      name: gameName,
      clientName: 'Load test',
      teamCount,
    });
    api.gameId = created.game.id;
    console.log(`Made "${gameName}" with ${teamCount} teams.`);
    const saved = await api.call<AdminGame>('PUT', `/games/${created.game.id}/settings`, {
      settings: testSettings(created.game.settings),
    });
    if (MODE === 'load') await runLoad(saved, created.logins, users);
    else await runGame(saved, created.logins);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.errors.push(`Stopped early: ${message}`);
    console.error(`Stopped early: ${message}`);
  }
  cleaning ??= cleanup(before);
  await cleaning;
  const passed = report();
  process.exit(passed ? 0 : 1);
}

void main();
