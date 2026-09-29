import JSZip from 'jszip';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TASK_KEYS, type DebriefView } from '@magic-potion/shared';
import { createApp } from '../app';
import { FakeClock } from '../engine/clock';
import { finishAllTasks } from '../engine/devTools';
import { memoryEngine } from '../engine/memoryGame';
import type { GameContent } from '../engine/state';
import { createApiRouter } from '../http/api';
import { MemoryLiveStore } from '../live/memoryStore';
import { ADMIN, COFAC, authFixture } from '../testSupport';
import { BOM, csvCell, toCsv } from './csv';
import { buildDebrief } from './debrief';
import { exportFileName, fileSlug as slug } from '@magic-potion/shared';
import { timeFormatter } from './exports';

const T0 = Date.UTC(2026, 8, 29, 9, 0, 0);
const MIN = 60_000;
const [A, B, C] = ['team-1', 'team-2', 'team-3'];
const KEEP = ['vault', 'find_code', 'ethical_dilemma', 'riddle', 'hangman'];

// A played game: chat, transfers, Ethical Dilemma answers, then the Reveal.
async function playedGame(opts: { reveal?: boolean } = {}) {
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams: 3, clock });
  // Every team draws the Ethical Dilemma: only these unique tasks have content.
  const content = engine.gameContent as GameContent;
  for (const key of TASK_KEYS) if (!KEEP.includes(key)) delete content.byKey[key];
  await engine.startGame(ADMIN.id);
  clock.set(T0 + 2 * MIN);
  await engine.sendChat(B, '=HYPERLINK("x") hello');
  clock.set(T0 + 5 * MIN);
  await engine.sendChat(A, 'Hi, "all"');
  await engine.sendChat(B, 'again');
  await engine.sendFunds(A, B, 500);
  await engine.sendFunds(A, B, 250);
  await engine.sendFunds(B, C, 300);
  clock.set(T0 + 7 * MIN);
  await engine.tick();
  await engine.sendFunds(C, A, 100); // still in transit: not counted
  await finishAllTasks(engine, A);
  await finishAllTasks(engine, C);
  if (opts.reveal !== false) {
    for (let i = 0; i < 3; i++) await engine.endPhase(ADMIN.id);
  }
  return { engine, persistence, clock };
}

describe('debrief', () => {
  it('lists each team’s first message, and teams that never wrote last', async () => {
    const { engine } = await playedGame();
    const d = buildDebrief(engine);
    expect(d.firstMessages).toEqual([
      { teamName: 'Team 2', at: T0 + 2 * MIN, round: 1, minutesAfterStart: 2 },
      { teamName: 'Team 1', at: T0 + 5 * MIN, round: 1, minutesAfterStart: 5 },
      { teamName: 'Team 3', at: null, round: null, minutesAfterStart: null },
    ]);
  });

  it('adds up arrived transfers per pair, and per team given and received', async () => {
    const { engine } = await playedGame();
    const d = buildDebrief(engine);
    expect(d.funds).toEqual([
      { fromTeamName: 'Team 1', toTeamName: 'Team 2', amount: 750, transfers: 2 },
      { fromTeamName: 'Team 2', toTeamName: 'Team 3', amount: 300, transfers: 1 },
    ]);
    expect(d.teamFunds).toEqual([
      { teamName: 'Team 1', given: 750, received: 0 },
      { teamName: 'Team 2', given: 300, received: 750 },
      { teamName: 'Team 3', given: 0, received: 300 },
    ]);
  });

  it('groups Ethical Dilemma answers by option, listing every option', async () => {
    const { engine } = await playedGame();
    const d = buildDebrief(engine);
    expect(d.dilemma).toHaveLength(4);
    const answered = d.dilemma.flatMap((o) => o.answers.map((a) => a.teamName)).sort();
    expect(answered).toEqual(['Team 1', 'Team 3']);
    for (const o of d.dilemma)
      for (const a of o.answers) expect(a.reason.length).toBeGreaterThan(0);
  });

  it('shows halftime and final potion', async () => {
    const { engine } = await playedGame();
    const { potion } = buildDebrief(engine);
    for (const p of [potion.halftime, potion.final]) {
      expect(p).toMatchObject({ completedTeams: 2, totalTeams: 3 });
      expect(p?.percent).toBeCloseTo(66.67, 1);
    }
  });
});

describe('CSV', () => {
  it('quotes commas, quotes and line breaks, and starts with the Excel byte order mark', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(toCsv(['A', 'B'], [[1, 'x']])).toBe(`${BOM}A,B\r\n1,x\r\n`);
  });

  it('stops typed text from running as a spreadsheet formula', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('@x')).toBe("'@x");
    // Real negative numbers stay numbers.
    expect(csvCell(-1500)).toBe('-1500');
  });

  it('names files after the game, and writes times in the given time zone', () => {
    expect(slug('Acme Offsite: Day 1!')).toBe('acme-offsite-day-1');
    expect(exportFileName('Acme', 'scores')).toBe('acme-scores.csv');
    expect(exportFileName('Acme', 'all')).toBe('acme-all.zip');
    expect(timeFormatter('Asia/Kolkata')(T0)).toBe('2026-09-29 14:30:00');
    expect(timeFormatter('Not/AZone')(T0)).toBe('2026-09-29 09:00:00');
  });
});

describe('debrief and export routes', () => {
  async function setup(opts: { reveal?: boolean } = {}) {
    const fx = authFixture();
    const g = await playedGame(opts);
    const live = new MemoryLiveStore(() => g.persistence.log, {
      staff: (id) => fx.store.staff.find((s) => s.id === id)?.name ?? id,
      team: (id) => g.engine.state.teams[id]?.name ?? id,
    });
    const api = createApiRouter({
      auth: fx.auth,
      engine: async () => g.engine,
      live,
      devTools: false,
    });
    const app = createApp({ clientOrigins: [], api });
    const token = async (who = ADMIN) =>
      (
        await request(app)
          .post('/api/staff/login')
          .send({ email: who.email, password: who.password })
      ).body.token as string;
    const get = async (path: string, who = ADMIN) =>
      request(app)
        .get(`/api/staff/games/game-1${path}`)
        .set('Authorization', `Bearer ${await token(who)}`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
    return { ...g, app, get };
  }

  it('gives the debrief to the main admin only, from the Reveal', async () => {
    const g = await setup();
    const res = await g.get('/debrief');
    expect(res.status).toBe(200);
    const d = JSON.parse((res.body as Buffer).toString()) as DebriefView;
    expect(d.firstMessages[0]?.teamName).toBe('Team 2');
    expect((await g.get('/debrief', COFAC)).status).toBe(403);
    const early = await setup({ reveal: false });
    expect((await early.get('/debrief')).status).toBe(409);
  });

  it('downloads each CSV with its file name', async () => {
    const g = await setup();
    const res = await g.get('/exports/chat.csv?tz=UTC');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe('attachment; filename="memory-game-chat.csv"');
    const text = (res.body as Buffer).toString('utf8');
    expect(text.startsWith(BOM)).toBe(true);
    expect(text).toContain(`2026-09-29 09:02:00,1,Team 2,"'=HYPERLINK(""x"") hello"`);
    expect(text).toContain('Team 1,"Hi, ""all"""');
    const scores = (await g.get('/exports/scores.csv')).body.toString('utf8');
    expect(scores.split('\r\n')[0]).toContain('Rank,Team,Tasks done');
    const audit = (await g.get('/exports/audit-log.csv')).body.toString('utf8');
    expect(audit.split('\r\n')[1]).toContain('START_GAME');
    expect((await g.get('/exports/nope.csv')).status).toBe(404);
    expect((await g.get('/exports/chat.csv', COFAC)).status).toBe(403);
  });

  it('puts all six files in one zip', async () => {
    const g = await setup();
    const res = await g.get('/exports/all.zip');
    expect(res.headers['content-type']).toBe('application/zip');
    const zip = await JSZip.loadAsync(res.body as Buffer);
    expect(Object.keys(zip.files).sort()).toEqual([
      'memory-game-audit-log.csv',
      'memory-game-chat.csv',
      'memory-game-dilemma-answers.csv',
      'memory-game-first-messages.csv',
      'memory-game-scores.csv',
      'memory-game-transfers.csv',
    ]);
    const dilemma = await zip.file('memory-game-dilemma-answers.csv')?.async('string');
    expect(dilemma?.split('\r\n').filter(Boolean)).toHaveLength(3);
  });
});
