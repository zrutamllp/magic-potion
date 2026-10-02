import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { MemoryAdminStore } from '../admin/memoryStore';
import { AdminService } from '../admin/service';
import { createApp } from '../app';
import { FakeClock } from '../engine/clock';
import { memoryEngine } from '../engine/memoryGame';
import { MemoryLiveStore } from '../live/memoryStore';
import { ADMIN, authFixture } from '../testSupport';
import { createApiRouter } from './api';

// Staff changes are safe to repeat (Phase 7C): the same Idempotency-Key gets the same answer
// and changes nothing, so "End phase" pressed again never ends the next phase too.

const T0 = Date.UTC(2026, 9, 2, 9, 0, 0);
const GAME = '/api/staff/games/game-1';

async function setup(opts: { busyOnce?: boolean } = {}) {
  const fx = authFixture();
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams: 3, clock });
  await engine.startGame(ADMIN.id);
  const adminStore = new MemoryAdminStore(fx.store);
  const admin = new AdminService({
    store: adminStore,
    auth: fx.auth,
    bcryptRounds: { staff: 4, team: 4 },
  });
  const live = new MemoryLiveStore(() => persistence.log, {
    staff: (id) => id,
    team: (id) => engine.state.teams[id]?.name ?? id,
  });
  let busy = opts.busyOnce === true;
  const api = createApiRouter({
    auth: fx.auth,
    engine: async () => {
      if (busy) {
        busy = false;
        throw Object.assign(new Error('Unable to start a transaction'), { code: 'P2028' });
      }
      return engine;
    },
    admin,
    live,
    devTools: false,
  });
  const app = createApp({ clientOrigins: [], api });
  const login = await request(app)
    .post('/api/staff/login')
    .send({ email: ADMIN.email, password: ADMIN.password });
  const token = login.body.token as string;
  const post = (path: string, body: object = {}, key?: string) => {
    const req = request(app).post(path).set('Authorization', `Bearer ${token}`);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  return { engine, post };
}

describe('staff changes with an Idempotency-Key', () => {
  it('ends one phase when End phase is pressed twice with the same key', async () => {
    const g = await setup();
    const first = await g.post(`${GAME}/end-phase`, {}, 'end-phase-0001');
    const again = await g.post(`${GAME}/end-phase`, {}, 'end-phase-0001');
    expect(first.status).toBe(200);
    expect(again.status).toBe(first.status);
    expect(again.body).toEqual(first.body);
    expect(g.engine.state.phase).toBe('PAUSE');
  });

  it('ends two phases for two different presses', async () => {
    const g = await setup();
    await g.post(`${GAME}/end-phase`, {}, 'end-phase-0001');
    await g.post(`${GAME}/end-phase`, {}, 'end-phase-0002');
    expect(g.engine.state.phase).toBe('ROUND2');
  });

  it('adds the time once when Extend is repeated', async () => {
    const g = await setup();
    const before = g.engine.state.phaseEndsAt!;
    await g.post(`${GAME}/extend`, { seconds: 120 }, 'extend-0001');
    await g.post(`${GAME}/extend`, { seconds: 120 }, 'extend-0001');
    expect(g.engine.state.phaseEndsAt).toBe(before + 120_000);
  });

  it('adjusts money once when the same adjustment comes twice', async () => {
    const g = await setup();
    const body = { amount: 1_000, reason: 'Bonus' };
    await g.post(`${GAME}/live/teams/team-2/adjust`, body, 'adjust-0001');
    await g.post(`${GAME}/live/teams/team-2/adjust`, body, 'adjust-0001');
    expect(g.engine.state.teams['team-2']?.taskFunds).toBe(11_000);
  });

  it('never replays a "busy" answer: the repeat runs for real', async () => {
    const g = await setup({ busyOnce: true });
    const first = await g.post(`${GAME}/end-phase`, {}, 'end-phase-0003');
    expect(first.status).toBe(503);
    const again = await g.post(`${GAME}/end-phase`, {}, 'end-phase-0003');
    expect(again.status).toBe(200);
    expect(g.engine.state.phase).toBe('PAUSE');
  });

  it('works as before without a key', async () => {
    const g = await setup();
    await g.post(`${GAME}/end-phase`);
    await g.post(`${GAME}/end-phase`);
    expect(g.engine.state.phase).toBe('ROUND2');
  });
});
