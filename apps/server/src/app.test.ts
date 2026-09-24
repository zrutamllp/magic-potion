import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@magic-potion/shared';
import { createApp } from './app';

const origins = ['http://localhost:5173'];

describe('GET /healthz', () => {
  it('reports ok with no database configured', async () => {
    const res = await request(createApp({ clientOrigins: origins })).get('/healthz');
    expect(res.status).toBe(200);
    const body = HealthResponseSchema.parse(res.body);
    expect(body.db).toBe('not_configured');
  });

  it('reports the database as ok when it answers', async () => {
    const app = createApp({ clientOrigins: origins, checkDb: async () => 1 });
    const res = await request(app).get('/healthz');
    expect(res.body.db).toBe('ok');
  });

  it('reports the database as down when the check fails', async () => {
    const app = createApp({
      clientOrigins: origins,
      checkDb: async () => {
        throw new Error('no connection');
      },
    });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('down');
  });

  it('allows the configured frontend origin', async () => {
    const res = await request(createApp({ clientOrigins: origins }))
      .get('/healthz')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not allow other origins', async () => {
    const res = await request(createApp({ clientOrigins: origins }))
      .get('/healthz')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
