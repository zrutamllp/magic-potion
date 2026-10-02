import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  parseTaskContent,
  type AdminGame,
  type GameContentInfo,
  type PackDetail,
  type PackSummary,
} from '@magic-potion/shared';
import {
  SAMPLE_PACK_DESCRIPTION,
  SAMPLE_PACK_NAME,
  samplePackItems,
  samplePackOptions,
} from '../../prisma/samplePack';
import { MemoryAdminStore } from '../admin/memoryStore';
import { AdminService } from '../admin/service';
import sharp from 'sharp';
import { createApp } from '../app';
import type { FileStore } from '../uploads/blob';
import { FakeClock } from '../engine/clock';
import { memoryEngine } from '../engine/memoryGame';
import { MemoryPackStore } from '../packs/memoryStore';
import { PackService, ensureSamplePack } from '../packs/service';
import { ADMIN, COFAC, authFixture } from '../testSupport';
import { createApiRouter } from './api';

const T0 = Date.UTC(2026, 8, 29, 9, 0, 0);

async function setup() {
  const fx = authFixture();
  const adminStore = new MemoryAdminStore(fx.store);
  const packStore = new MemoryPackStore(adminStore);
  const reloaded: string[] = [];
  const packs = new PackService({
    store: packStore,
    audit: (e) => adminStore.audit(e),
    onLobbyChange: (id) => reloaded.push(id),
  });
  const admin = new AdminService({
    store: adminStore,
    auth: fx.auth,
    onLobbyChange: (id) => reloaded.push(id),
    afterCreate: (id) => packs.assignDefault(id),
    bcryptRounds: { staff: 4, team: 4 },
  });
  const sampleId = await ensureSamplePack(packStore, {
    name: SAMPLE_PACK_NAME,
    description: SAMPLE_PACK_DESCRIPTION,
    options: samplePackOptions(),
    items: samplePackItems(),
  });
  const { engine } = memoryEngine({ teams: 3, clock: new FakeClock(T0) });
  const saved: string[] = [];
  const files: FileStore = {
    save: async (folder, _data, _type, ext) => {
      saved.push(folder);
      return `https://blob.example.com/${folder}/random-${saved.length}.${ext}`;
    },
    remove: async () => {},
  };
  const api = createApiRouter({
    auth: fx.auth,
    engine: async () => engine,
    admin,
    packs,
    files,
    devTools: false,
  });
  const app = createApp({ clientOrigins: [], api });
  const token = await login(app, ADMIN);
  const call = async (
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    body?: object,
    as = token,
  ) => {
    const req = request(app)[method](`/api/staff${path}`).set('Authorization', `Bearer ${as}`);
    return body ? req.send(body) : req;
  };
  return { fx, adminStore, packStore, reloaded, app, call, sampleId, token, saved };
}

async function login(app: Parameters<typeof request>[0], who: { email: string; password: string }) {
  const res = await request(app).post('/api/staff/login').send(who);
  return res.body.token as string;
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function newGame(g: Setup, name = 'Offsite') {
  const res = await g.call('post', '/games', { name, teamCount: 3 });
  expect(res.status).toBe(200);
  return res.body.game as AdminGame;
}

async function copySample(g: Setup, name = 'Acme pack') {
  const res = await g.call('post', `/packs/${g.sampleId}/copy`, { name });
  expect(res.status).toBe(200);
  return res.body as PackDetail;
}

const riddle = (n: number) => ({
  taskKey: 'riddle',
  publicData: { riddle: `New riddle ${n}?` },
  secretData: { answers: [`answer ${n}`], clue: `Clue ${n}` },
});

describe('content packs', () => {
  it('lists the ready Sample pack, which cannot be edited', async () => {
    const g = await setup();
    const list = (await g.call('get', '/packs')).body as PackSummary[];
    expect(list).toEqual([
      expect.objectContaining({ name: 'Sample pack', builtIn: true, ready: true, gameCount: 0 }),
    ]);
    const edit = await g.call('post', `/packs/${g.sampleId}/items`, riddle(1));
    expect(edit.status).toBe(403);
    expect(edit.body.message).toBe('The Sample pack cannot be changed. Copy it and edit the copy.');
  });

  it('copies a pack with every entry', async () => {
    const g = await setup();
    const copy = await copySample(g);
    expect(copy).toMatchObject({ name: 'Acme pack', builtIn: false });
    expect(copy.items).toHaveLength(samplePackItems().length);
    expect(copy.readiness.ready).toBe(true);
    expect(g.adminStore.audits.at(-1)).toMatchObject({ action: 'COPY_PACK', gameId: null });
  });

  it('refuses an entry with problems and says which fields', async () => {
    const g = await setup();
    const pack = await copySample(g);
    const res = await g.call('post', `/packs/${pack.id}/items`, {
      taskKey: 'ethical_dilemma',
      publicData: { scenario: '', options: ['A', 'B'] },
      secretData: {},
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'ITEM_INVALID',
      message: 'Some fields need fixing. They are marked in red.',
      errors: [
        { path: 'public.scenario', message: 'Write the scenario.' },
        { path: 'public.options', message: 'A dilemma needs 4 options.' },
      ],
    });
  });

  it('adds, edits, orders and deletes entries', async () => {
    const g = await setup();
    const pack = await copySample(g);
    const added = (await g.call('post', `/packs/${pack.id}/items`, riddle(1))).body as PackDetail;
    const riddles = added.items.filter((i) => i.taskKey === 'riddle');
    expect(riddles).toHaveLength(13);
    const mine = riddles.at(-1)!;
    const edited = await g.call('put', `/packs/${pack.id}/items/${mine.id}`, {
      publicData: { riddle: '  Edited?  ' },
      secretData: { answers: ['x'], clue: 'c' },
    });
    expect((edited.body as PackDetail).items.find((i) => i.id === mine.id)?.publicData).toEqual({
      riddle: 'Edited?',
    });
    const order = [mine.id, ...riddles.slice(0, -1).map((r) => r.id)];
    const ordered = (
      await g.call('put', `/packs/${pack.id}/order`, { taskKey: 'riddle', itemIds: order })
    ).body as PackDetail;
    expect(ordered.items.filter((i) => i.taskKey === 'riddle')[0]?.id).toBe(mine.id);
    const deleted = (await g.call('delete', `/packs/${pack.id}/items/${mine.id}`))
      .body as PackDetail;
    expect(deleted.items.filter((i) => i.taskKey === 'riddle')).toHaveLength(12);
  });

  it('adds or replaces many entries at once, all or nothing', async () => {
    const g = await setup();
    const pack = await copySample(g);
    const bad = await g.call('post', `/packs/${pack.id}/items/bulk`, {
      taskKey: 'riddle',
      mode: 'replace',
      items: [riddle(1), { publicData: { riddle: 'x' }, secretData: { answers: [], clue: 'c' } }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toEqual([
      { path: '1.secret.answers', message: 'Add at least one accepted answer.' },
    ]);
    const good = await g.call('post', `/packs/${pack.id}/items/bulk`, {
      taskKey: 'riddle',
      mode: 'replace',
      items: [riddle(1), riddle(2), riddle(3), riddle(4)],
    });
    expect((good.body as PackDetail).items.filter((i) => i.taskKey === 'riddle')).toHaveLength(4);
  });

  it('is for the main admin only', async () => {
    const g = await setup();
    const cofac = await login(g.app, COFAC);
    expect((await g.call('get', '/packs', undefined, cofac)).status).toBe(403);
  });
});

describe('a game and its pack', () => {
  it('starts every new game with the Sample pack', async () => {
    const g = await setup();
    const game = await newGame(g);
    const content = (await g.call('get', `/games/${game.id}/content`)).body as GameContentInfo;
    expect(content).toMatchObject({ packId: g.sampleId, packName: 'Sample pack', locked: false });
    expect(content.dilemmas).toHaveLength(5);
    const rows = g.packStore.gameContent.get(game.id)!;
    const riddleRow = rows.find((r) => r.key === 'riddle')!;
    expect(parseTaskContent('riddle', riddleRow).publicData.riddles).toHaveLength(12);
  });

  it('gives every team the chosen dilemma', async () => {
    const g = await setup();
    const game = await newGame(g);
    const pack = await copySample(g);
    const dilemma = pack.items.filter((i) => i.taskKey === 'ethical_dilemma')[2]!;
    const res = await g.call('put', `/games/${game.id}/content`, {
      packId: pack.id,
      dilemmaItemId: dilemma.id,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ packId: pack.id, dilemmaItemId: dilemma.id });
    const row = g.packStore.gameContent.get(game.id)!.find((r) => r.key === 'ethical_dilemma')!;
    expect(row.publicData).toEqual(dilemma.publicData);
    expect(g.adminStore.audits.at(-1)).toMatchObject({
      action: 'SET_GAME_CONTENT',
      gameId: game.id,
    });
  });

  it('follows the pack in the Lobby, and keeps its copy once started', async () => {
    const g = await setup();
    const lobby = await newGame(g, 'Lobby game');
    const played = await newGame(g, 'Played game');
    const pack = await copySample(g);
    for (const game of [lobby, played]) {
      await g.call('put', `/games/${game.id}/content`, { packId: pack.id, dilemmaItemId: null });
    }
    g.adminStore.games.find((x) => x.id === played.id)!.startedAt = new Date(T0);
    const playedBefore = g.packStore.gameContent.get(played.id);
    g.reloaded.length = 0;

    await g.call('post', `/packs/${pack.id}/items`, riddle(99));

    const lobbyRiddles = g.packStore.gameContent.get(lobby.id)!.find((r) => r.key === 'riddle')!;
    expect(JSON.stringify(lobbyRiddles.publicData)).toContain('New riddle 99?');
    expect(g.packStore.gameContent.get(played.id)).toBe(playedBefore);
    expect(g.reloaded).toEqual([lobby.id]);

    const locked = await g.call('put', `/games/${played.id}/content`, {
      packId: g.sampleId,
      dilemmaItemId: null,
    });
    expect(locked.status).toBe(409);
    expect(locked.body.message).toBe('The game has started, so its content is locked.');
  });

  it('refuses a pack that is not ready', async () => {
    const g = await setup();
    const game = await newGame(g);
    const empty = (await g.call('post', '/packs', { name: 'Empty' })).body as PackDetail;
    expect(empty.readiness.problems).toContain('The Vault needs content.');
    const res = await g.call('put', `/games/${game.id}/content`, {
      packId: empty.id,
      dilemmaItemId: null,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This pack is not ready to play yet.');
  });

  it('does not delete a pack that games use', async () => {
    const g = await setup();
    const game = await newGame(g);
    const pack = await copySample(g);
    await g.call('put', `/games/${game.id}/content`, { packId: pack.id, dilemmaItemId: null });
    expect((await g.call('delete', `/packs/${pack.id}`)).status).toBe(409);
    const unused = await copySample(g, 'Unused');
    expect((await g.call('delete', `/packs/${unused.id}`)).status).toBe(200);
  });
});

describe('inbox bonus tasks', () => {
  it('edits the photo task and questions in the Lobby only', async () => {
    const g = await setup();
    const game = await newGame(g);
    const inbox = (await g.call('get', `/games/${game.id}/inbox`)).body as {
      items: { id: string; kind: string; answers: string[] }[];
    };
    expect(inbox.items.map((i) => i.kind)).toEqual(['PHOTO', 'QUESTION', 'QUESTION']);
    const question = inbox.items[1]!;
    const noAnswers = await g.call('put', `/games/${game.id}/inbox`, {
      items: [{ id: question.id, title: 'Capital', body: 'Capital of India?', answers: [] }],
    });
    expect(noAnswers.status).toBe(400);
    const saved = await g.call('put', `/games/${game.id}/inbox`, {
      items: [
        {
          id: question.id,
          title: 'Capital',
          body: 'Capital of India?',
          answers: ['New Delhi', 'Delhi'],
        },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.items[1]).toMatchObject({
      title: 'Capital',
      answers: ['New Delhi', 'Delhi'],
    });
    expect(g.adminStore.audits.at(-1)).toMatchObject({ action: 'UPDATE_INBOX_ITEM' });

    g.adminStore.games.find((x) => x.id === game.id)!.startedAt = new Date(T0);
    const locked = await g.call('put', `/games/${game.id}/inbox`, {
      items: [{ id: question.id, title: 'X', body: 'Y', answers: ['z'] }],
    });
    expect(locked.status).toBe(409);
  });
});

describe('archive and delete', () => {
  it('archives only a finished game, and keeps it', async () => {
    const g = await setup();
    const game = await newGame(g);
    const early = await g.call('post', `/games/${game.id}/archive`);
    expect(early.status).toBe(400);
    expect(early.body.message).toBe('Only a finished game can be archived.');
    const stored = g.adminStore.games.find((x) => x.id === game.id)!;
    Object.assign(stored, { startedAt: new Date(T0), phase: 'REVEAL' });
    expect((await g.call('post', `/games/${game.id}/archive`)).status).toBe(200);
    expect(stored.archivedAt).not.toBeNull();
    expect((await g.call('post', `/games/${game.id}/unarchive`)).status).toBe(200);
    expect(stored.archivedAt).toBeNull();
  });

  it('never deletes a game that is still being played', async () => {
    const g = await setup();
    const game = await newGame(g, 'Played');
    Object.assign(
      g.adminStore.games.find((x) => x.id === game.id)!,
      {
        startedAt: new Date(T0),
        phase: 'ROUND1',
      },
    );
    const res = await g.call('delete', `/games/${game.id}`, { confirmName: 'Played' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'End the game first. A game being played or paused cannot be deleted.',
    );
    expect(g.adminStore.games.some((x) => x.id === game.id)).toBe(true);
  });

  it('deletes an unplayed game only when its name is typed exactly', async () => {
    const g = await setup();
    const game = await newGame(g, 'Dry run');
    const wrong = await g.call('delete', `/games/${game.id}`, { confirmName: 'dry run' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toBe('Type the game name exactly as shown to delete it.');
    const res = await g.call('delete', `/games/${game.id}`, { confirmName: 'Dry run' });
    expect(res.status).toBe(200);
    expect(g.adminStore.games.some((x) => x.id === game.id)).toBe(false);
    expect(g.adminStore.audits.at(-1)).toMatchObject({
      action: 'DELETE_GAME',
      gameId: null,
      before: expect.objectContaining({ name: 'Dry run' }),
    });
  });
});

describe('task pictures', () => {
  it('saves task pictures under tasks/, and refuses an unknown use', async () => {
    const g = await setup();
    const png = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    const up = (use: string) =>
      request(g.app)
        .post(`/api/staff/uploads/image?use=${use}`)
        .set('Authorization', `Bearer ${g.token}`)
        .set('Content-Type', 'image/png')
        .send(png);
    const spot = await up('spot');
    expect(spot.status).toBe(200);
    expect(spot.body).toEqual({
      url: 'https://blob.example.com/tasks/random-1.webp',
      width: 1600,
      height: 800,
    });
    expect((await up('face')).body).toMatchObject({ width: 800, height: 400 });
    expect((await up('selfie')).status).toBe(400);
  });
});

describe('spreadsheet import', () => {
  it('checks an uploaded CSV and saves nothing until confirmed', async () => {
    const g = await setup();
    const pack = await copySample(g);
    const csv = [
      'Riddle,Accepted answers,Clue (the hint)',
      'What runs?,water; a river,Wet',
      'No answer?,,Clue',
    ].join('\n');
    const res = await request(g.app)
      .post(`/api/staff/packs/${pack.id}/import?task=riddle`)
      .set('Authorization', `Bearer ${g.token}`)
      .set('Content-Type', 'text/csv')
      .send(Buffer.from(csv));
    expect(res.status).toBe(200);
    expect(res.body.rows.map((r: { errors: string[] }) => r.errors)).toEqual([
      [],
      ['Accepted answers: Add at least one accepted answer.'],
    ]);
    expect(res.body.items).toHaveLength(1);
    const after = (await g.call('get', `/packs/${pack.id}`)).body as PackDetail;
    expect(after.items.filter((i) => i.taskKey === 'riddle')).toHaveLength(12);
  });

  it('runs every import as before, also with an Idempotency-Key (never replayed)', async () => {
    const g = await setup();
    const pack = await copySample(g);
    const csv = ['Riddle,Accepted answers,Clue (the hint)', 'What runs?,water,Wet'].join('\n');
    const upload = () =>
      request(g.app)
        .post(`/api/staff/packs/${pack.id}/import?task=riddle`)
        .set('Authorization', `Bearer ${g.token}`)
        .set('Idempotency-Key', 'import-0001')
        .set('Content-Type', 'text/csv')
        .send(Buffer.from(csv));
    for (const res of [await upload(), await upload()]) {
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    }
    // Confirming the import twice with the same key adds twice, exactly as without a key.
    const confirm = () =>
      request(g.app)
        .post(`/api/staff/packs/${pack.id}/items/bulk`)
        .set('Authorization', `Bearer ${g.token}`)
        .set('Idempotency-Key', 'import-0002')
        .send({ taskKey: 'riddle', mode: 'add', items: [riddle(99)] });
    await confirm();
    const after = (await confirm()).body as PackDetail;
    expect(after.items.filter((i) => i.taskKey === 'riddle')).toHaveLength(14);
  });

  it('downloads the templates', async () => {
    const g = await setup();
    const csv = await g.call('get', '/packs-import-template?task=hangman&format=csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Category,Phrase');
    const xlsx = await g.call('get', '/packs-import-template?task=riddle');
    expect(xlsx.headers['content-disposition']).toContain('magic-potion-riddle-template.xlsx');
  });
});

describe('preview routes', () => {
  it('plays draft content and answers like the game, with no answers sent', async () => {
    const g = await setup();
    const items = [{ publicData: { category: 'Film' }, secretData: { phrase: 'Jaws' } }];
    const created = await g.call('post', '/preview', { taskKey: 'hangman', items });
    expect(created.status).toBe(200);
    const id = created.body.id as string;
    const started = await g.call('post', `/preview/${id}/start`);
    expect(started.body.ack).toEqual({ ok: true, value: { status: 'started' } });
    expect(started.body.preview.task.running.view).toMatchObject({
      masked: '____',
      content: { category: 'Film' },
    });
    const guess = await g.call('post', `/preview/${id}/submit`, { submission: { letter: 'j' } });
    expect(guess.body.ack).toEqual({ ok: true, value: { status: 'correct' } });
    expect(JSON.stringify(guess.body)).not.toContain('Jaws');
    const bad = await g.call('post', '/preview', {
      taskKey: 'hangman',
      items: [{ publicData: { category: 'Film' }, secretData: { phrase: 'R2-D2' } }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].message).toBe('Use letters, spaces, hyphens and apostrophes only.');
  });
});
