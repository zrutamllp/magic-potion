import sharp from 'sharp';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { FakeClock } from '../engine/clock';
import { memoryEngine } from '../engine/memoryGame';
import { MemoryLiveStore } from '../live/memoryStore';
import { buildPlayerState, buildStaffState } from '../realtime/views';
import { ADMIN, COFAC, authFixture, teamPassword } from '../testSupport';
import type { FileStore } from '../uploads/blob';
import { createApiRouter } from './api';

// The team photo (GAME_RULES section 7): uploaded by the team, accepted at once, staff can
// reject it, and the team may upload again.

const T0 = Date.UTC(2026, 8, 29, 9, 0, 0);
const MIN = 60_000;
const PHOTO = 'inbox-1';

async function picture(width = 400, height = 300) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Artist: 'Secret Person' } } })
    .toBuffer();
}

async function setup(opts: { files?: boolean; releasePhoto?: boolean } = {}) {
  const fx = authFixture();
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams: 3, clock });
  await engine.startGame(ADMIN.id);
  if (opts.releasePhoto !== false) {
    clock.set(T0 + 10 * MIN);
    await engine.tick();
  }
  const saved: { folder: string; bytes: Buffer; url: string }[] = [];
  const removed: string[] = [];
  // Stands in for Vercel Blob: tests never use the real store or its token.
  const files: FileStore = {
    save: async (folder, data) => {
      const url = `https://blob.example.com/${folder}/random-${saved.length + 1}.webp`;
      saved.push({ folder, bytes: data, url });
      return url;
    },
    remove: async (urls) => {
      removed.push(...urls);
    },
  };
  const api = createApiRouter({
    auth: fx.auth,
    engine: async () => engine,
    files: opts.files === false ? undefined : files,
    live: new MemoryLiveStore(() => persistence.log, { staff: (id) => id, team: (id) => id }),
    devTools: false,
  });
  const app = createApp({ clientOrigins: [], api });
  const login = await request(app)
    .post('/api/team/login')
    .send({ code: 'TEAM1', password: teamPassword(1) });
  const teamToken = login.body.token as string;
  const upload = async (body: Buffer, token = teamToken, item = PHOTO) =>
    request(app)
      .post(`/api/team/inbox/${item}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/jpeg')
      .send(body);
  const staffToken = async (who = ADMIN) =>
    (await request(app).post('/api/staff/login').send({ email: who.email, password: who.password }))
      .body.token as string;
  return { ...fx, app, engine, clock, saved, removed, upload, staffToken };
}

describe('team photo upload', () => {
  it('stores the photo under a random name with no metadata and accepts it at once', async () => {
    const g = await setup();
    const res = await g.upload(await picture());
    expect(res.status).toBe(200);
    expect(g.saved).toHaveLength(1);
    expect(g.saved[0]?.folder).toBe('team-photos');
    const meta = await sharp(g.saved[0]!.bytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(g.engine.state.teams['team-1']?.inbox[PHOTO]).toMatchObject({
      photoStatus: 'ACCEPTED',
      photoUrl: g.saved[0]?.url,
    });
  });

  it('never sends the photo address to players, only to staff', async () => {
    const g = await setup();
    await g.upload(await picture());
    const url = g.saved[0]!.url;
    for (const id of ['team-1', 'team-2']) {
      expect(JSON.stringify(buildPlayerState(g.engine, id, T0))).not.toContain(url);
    }
    const staff = g.store.staff.find((x) => x.id === ADMIN.id)!;
    const state = buildStaffState(g.engine, staff, null, () => true, false, T0);
    expect(state.teams.find((t) => t.id === 'team-1')?.photo).toEqual({
      itemId: PHOTO,
      status: 'ACCEPTED',
      url,
    });
  });

  it('needs a team login', async () => {
    const g = await setup();
    const res = await g.upload(await picture(), 'not-a-token');
    expect(res.status).toBe(401);
    expect(g.saved).toHaveLength(0);
  });

  it('refuses a file that is not a picture, and stores nothing', async () => {
    const g = await setup();
    const res = await g.upload(Buffer.from('<svg onload="alert(1)"></svg>'));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Upload a PNG, JPG, WebP or GIF picture.');
    expect(g.saved).toHaveLength(0);
  });

  it('refuses a picture over 5 MB', async () => {
    const g = await setup();
    const res = await g.upload(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
  });

  it('stores nothing before the task opens or while the game is paused', async () => {
    const early = await setup({ releasePhoto: false });
    expect((await early.upload(await picture())).body).toMatchObject({
      code: 'INBOX_NOT_RELEASED',
    });
    expect(early.saved).toHaveLength(0);

    const g = await setup();
    await g.engine.freeze(ADMIN.id);
    expect((await g.upload(await picture())).body).toMatchObject({ code: 'GAME_FROZEN' });
    expect(g.saved).toHaveLength(0);
  });

  it('refuses a second photo once one is accepted', async () => {
    const g = await setup();
    await g.upload(await picture());
    expect((await g.upload(await picture())).body).toMatchObject({
      code: 'INBOX_ALREADY_DONE',
    });
    expect(g.saved).toHaveLength(1);
  });

  it('says so when uploads are not set up', async () => {
    const g = await setup({ files: false });
    expect((await g.upload(await picture())).status).toBe(503);
  });
});

describe('rejecting a team photo', () => {
  it('lets staff reject it; the team may then upload again', async () => {
    const g = await setup();
    await g.upload(await picture());
    const token = await g.staffToken();
    const res = await request(g.app)
      .post('/api/staff/games/game-1/live/teams/team-1/photo/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Not the whole team' });
    expect(res.body).toMatchObject({ ok: true });
    expect(g.engine.state.teams['team-1']?.inbox[PHOTO]?.photoStatus).toBe('REJECTED');
    expect((await g.upload(await picture())).status).toBe(200);
    expect(g.engine.state.teams['team-1']?.inbox[PHOTO]?.photoStatus).toBe('ACCEPTED');
  });

  it('needs a reason, and a co-facilitator may reject only for their teams', async () => {
    const g = await setup();
    await g.upload(await picture());
    const token = await g.staffToken(COFAC);
    const reject = (team: string, body: object) =>
      request(g.app)
        .post(`/api/staff/games/game-1/live/teams/${team}/photo/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    expect((await reject('team-1', { reason: '' })).status).toBe(400);
    expect((await reject('team-2', { reason: 'x' })).status).toBe(403);
    expect((await reject('team-1', { reason: 'Blurry' })).body).toMatchObject({ ok: true });
  });
});
