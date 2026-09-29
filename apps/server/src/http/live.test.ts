import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AuditRowView } from '@magic-potion/shared';
import { MemoryAdminStore } from '../admin/memoryStore';
import { AdminService } from '../admin/service';
import { createApp } from '../app';
import { FakeClock } from '../engine/clock';
import { memoryEngine } from '../engine/memoryGame';
import { MemoryLiveStore } from '../live/memoryStore';
import { buildPlayerState } from '../realtime/views';
import { ADMIN, COFAC, authFixture } from '../testSupport';
import { createApiRouter } from './api';

// Live control routes (Phase 6C). The co-facilitator in the fixture is assigned team-1 only.

const T0 = Date.UTC(2026, 8, 29, 9, 0, 0);
const BASE = '/api/staff/games/game-1/live';

async function setup(opts: { start?: boolean } = {}) {
  const fx = authFixture();
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams: 3, clock });
  if (opts.start !== false) await engine.startGame(ADMIN.id);
  const adminStore = new MemoryAdminStore(fx.store);
  adminStore.games.push({
    id: 'game-1',
    name: 'Memory game',
    phase: engine.state.phase,
    startedAt: opts.start === false ? null : new Date(T0),
    endedAt: null,
    archivedAt: null,
    contentPackId: null,
    dilemmaItemId: null,
    settings: engine.state.settings,
  });
  const admin = new AdminService({
    store: adminStore,
    auth: fx.auth,
    bcryptRounds: { staff: 4, team: 4 },
  });
  const staffName = (id: string) => fx.store.staff.find((s) => s.id === id)?.name ?? id;
  const live = new MemoryLiveStore(() => persistence.log, {
    staff: staffName,
    team: (id) => engine.state.teams[id]?.name ?? id,
  });
  const audits: string[] = [];
  const api = createApiRouter({
    auth: fx.auth,
    engine: async (gameId) => {
      if (gameId !== 'game-1') throw new Error('no such game');
      return engine;
    },
    admin,
    live,
    onAudit: (id) => audits.push(id),
    devTools: false,
  });
  const app = createApp({ clientOrigins: [], api });
  const tokens = new Map<string, string>();
  async function call(method: 'get' | 'post', path: string, body?: object, who = ADMIN) {
    let token = tokens.get(who.id);
    if (!token) {
      const res = await request(app)
        .post('/api/staff/login')
        .send({ email: who.email, password: who.password });
      token = res.body.token as string;
      tokens.set(who.id, token);
    }
    const req = request(app)[method](`${BASE}${path}`).set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  }
  return { ...fx, engine, persistence, clock, adminStore, call, audits };
}

const funds = (g: Awaited<ReturnType<typeof setup>>, id: string) =>
  g.engine.state.teams[id]?.taskFunds;

describe('fund adjustments', () => {
  it('lets the main admin change any team by any amount', async () => {
    const g = await setup();
    const res = await g.call('post', '/teams/team-2/adjust', { amount: 5_000, reason: 'Bonus' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, value: { outcome: 'applied' } });
    expect(funds(g, 'team-2')).toBe(15_000);
  });

  it('lets a co-facilitator change an assigned team by up to 2,000 at once', async () => {
    const g = await setup();
    const res = await g.call(
      'post',
      '/teams/team-1/adjust',
      { amount: -2_000, reason: 'x' },
      COFAC,
    );
    expect(res.body).toEqual({ ok: true, value: { outcome: 'applied' } });
    expect(funds(g, 'team-1')).toBe(8_000);
  });

  it('turns a larger co-facilitator change into a request for the admin', async () => {
    const g = await setup();
    const res = await g.call('post', '/teams/team-1/adjust', { amount: 3_000, reason: 'x' }, COFAC);
    expect(res.body).toEqual({ ok: true, value: { outcome: 'requested' } });
    expect(funds(g, 'team-1')).toBe(10_000);
    const [request_] = Object.values(g.engine.state.adjustments);
    expect(request_).toMatchObject({ status: 'PENDING', requestedById: COFAC.id, amount: 3_000 });

    // Only the admin decides.
    const cofacTry = await g.call('post', `/adjustments/${request_?.id}`, { approve: true }, COFAC);
    expect(cofacTry.status).toBe(403);
    const approved = await g.call('post', `/adjustments/${request_?.id}`, { approve: true });
    expect(approved.body).toMatchObject({ ok: true });
    expect(funds(g, 'team-1')).toBe(13_000);
  });

  it('uses the limit from the game settings', async () => {
    const g = await setup();
    g.engine.state.settings.staff.coFacilitatorAdjustLimit = 500;
    const res = await g.call('post', '/teams/team-1/adjust', { amount: 600, reason: 'x' }, COFAC);
    expect(res.body.value).toEqual({ outcome: 'requested' });
  });

  it('refuses a co-facilitator on a team they are not assigned', async () => {
    const g = await setup();
    const res = await g.call('post', '/teams/team-2/adjust', { amount: 100, reason: 'x' }, COFAC);
    expect(res.status).toBe(403);
    expect(funds(g, 'team-2')).toBe(10_000);
  });

  it('needs a reason and a whole amount that is not zero', async () => {
    const g = await setup();
    const noReason = await g.call('post', '/teams/team-1/adjust', { amount: 100, reason: '' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.message).toBe('Type a reason.');
    const zero = await g.call('post', '/teams/team-1/adjust', { amount: 0, reason: 'x' });
    expect(zero.status).toBe(400);
  });

  it('shows the team only the amount, never the staff name or the reason', async () => {
    const g = await setup();
    await g.call(
      'post',
      '/teams/team-1/adjust',
      { amount: 1_000, reason: 'Very private note' },
      COFAC,
    );
    const json = JSON.stringify(buildPlayerState(g.engine, 'team-1', T0));
    expect(json).not.toContain('Very private note');
    expect(json).not.toContain(COFAC.id);
    expect(json).not.toContain('Co-facilitator');
    const line = buildPlayerState(g.engine, 'team-1', T0).transactions[0];
    expect(line).toMatchObject({ kind: 'STAFF_ADJUST', taskFunds: 1_000 });
  });
});

describe('team actions', () => {
  it('renames a team live, for the admin or its co-facilitator', async () => {
    const g = await setup();
    expect((await g.call('post', '/teams/team-1/rename', { name: 'Owls' }, COFAC)).status).toBe(
      200,
    );
    expect(g.engine.state.teams['team-1']?.name).toBe('Owls');
    expect((await g.call('post', '/teams/team-2/rename', { name: 'X' }, COFAC)).status).toBe(403);
  });

  it('resets a login: a new password shown once, the old session ended, audited', async () => {
    const g = await setup();
    const res = await g.call('post', '/teams/team-1/reset-login', {}, COFAC);
    expect(res.status).toBe(200);
    expect(res.body.value).toMatchObject({ teamId: 'team-1', code: 'TEAM1' });
    expect(res.body.value.password).toMatch(/\S{6,}/);
    expect(g.adminStore.audits.at(-1)).toMatchObject({
      action: 'RESET_TEAM_PASSWORD',
      teamId: 'team-1',
      staffUserId: COFAC.id,
    });
    expect(g.audits).toEqual(['game-1']);
    expect((await g.call('post', '/teams/team-2/reset-login', {}, COFAC)).status).toBe(403);
  });

  it('releases a fragment for the team that needs it', async () => {
    const g = await setup();
    const needs = (teamId: string) =>
      Object.values(g.engine.state.fragments).find((f) => f.neededByTeamId === teamId);
    const other = await g.call(
      'post',
      '/release-fragment',
      { fragmentId: needs('team-2')?.id },
      COFAC,
    );
    expect(other.status).toBe(403);
    const own = await g.call(
      'post',
      '/release-fragment',
      { fragmentId: needs('team-1')?.id },
      COFAC,
    );
    expect(own.body).toMatchObject({ ok: true });
  });

  it('keeps unlock, stop, remove and messages for the main admin', async () => {
    const g = await setup();
    const task = Object.values(g.engine.state.teams['team-1']?.tasks ?? {})[0];
    for (const [path, body] of [
      ['/teams/team-1/clear-lockout', { taskId: task?.id }],
      ['/teams/team-1/stop-task', { taskId: task?.id }],
      ['/teams/team-1/remove', { reason: 'Left' }],
      ['/message', { title: 'Hi', body: 'Hello' }],
    ] as const) {
      expect((await g.call('post', path, body, COFAC)).status).toBe(403);
    }
    await g.engine.startTask('team-1', task?.id ?? '');
    const stop = await g.call('post', '/teams/team-1/stop-task', { taskId: task?.id });
    expect(stop.body).toMatchObject({ ok: true });
    const msg = await g.call('post', '/message', { title: 'Hi', body: 'Hello' });
    expect(msg.body).toMatchObject({ ok: true });
    const removed = await g.call('post', '/teams/team-3/remove', { reason: 'Left early' });
    expect(removed.body).toMatchObject({ ok: true });
    expect(g.engine.state.teams['team-3']?.status).toBe('REMOVED');
  });
});

describe('audit log and undo', () => {
  it('shows the admin every row; a co-facilitator only rows for their teams', async () => {
    const g = await setup();
    await g.call('post', '/teams/team-1/adjust', { amount: 100, reason: 'a' }, COFAC);
    await g.call('post', '/teams/team-2/adjust', { amount: 200, reason: 'b' });
    const all = (await g.call('get', '/audit')).body as AuditRowView[];
    expect(all.map((r) => r.action)).toEqual(['ADJUST_FUNDS', 'ADJUST_FUNDS', 'START_GAME']);
    expect(all[1]).toMatchObject({
      staffName: 'Co-facilitator',
      teamName: 'Team 1',
      canUndo: true,
    });
    const mine = (await g.call('get', '/audit', undefined, COFAC)).body as AuditRowView[];
    expect(mine.map((r) => r.teamName)).toEqual(['Team 1']);
  });

  it('lets a co-facilitator undo only their own changes; the admin undoes any', async () => {
    const g = await setup();
    await g.call('post', '/teams/team-1/adjust', { amount: 1_000, reason: 'admin' });
    await g.call('post', '/teams/team-1/adjust', { amount: 500, reason: 'mine' }, COFAC);
    const rows = (await g.call('get', '/audit', undefined, COFAC)).body as AuditRowView[];
    const mine = rows.find((r) => r.reason === 'mine');
    const admins = rows.find((r) => r.reason === 'admin');
    expect(admins?.canUndo).toBe(false);
    expect((await g.call('post', `/audit/${admins?.id}/undo`, {}, COFAC)).status).toBe(403);
    expect((await g.call('post', `/audit/${mine?.id}/undo`, {}, COFAC)).body).toMatchObject({
      ok: true,
    });
    expect(funds(g, 'team-1')).toBe(11_000);
    expect((await g.call('post', `/audit/${admins?.id}/undo`, {})).body).toMatchObject({
      ok: true,
    });
    expect(funds(g, 'team-1')).toBe(10_000);
    // Undone rows cannot be undone again.
    const again = await g.call('post', `/audit/${mine?.id}/undo`, {}, COFAC);
    expect(again.body).toMatchObject({ ok: false, code: 'ALREADY_UNDONE' });
    const after = (await g.call('get', '/audit')).body as AuditRowView[];
    expect(after.filter((r) => r.action === 'UNDO')).toHaveLength(2);
  });

  it('cannot undo phase changes', async () => {
    const g = await setup();
    const rows = (await g.call('get', '/audit')).body as AuditRowView[];
    const start = rows.find((r) => r.action === 'START_GAME');
    expect(start?.canUndo).toBe(false);
    const res = await g.call('post', `/audit/${start?.id}/undo`, {});
    expect(res.body).toMatchObject({ ok: false, code: 'NOTHING_TO_UNDO' });
  });
});
