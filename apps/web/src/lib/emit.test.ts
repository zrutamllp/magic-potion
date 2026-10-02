// @vitest-environment node
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emitWithAck } from './emit';

// Regression test for the Phase 3 bug where "Send" and "Send funds" did nothing: emit was
// called without its socket, threw inside the promise, and nothing reached the server.
// Uses a real Socket.IO server and client so that kind of mistake cannot hide.

let server: Server;
let client: Socket;
const received: { event: string; payload: unknown }[] = [];

beforeEach(async () => {
  received.length = 0;
  const http = createServer();
  server = new Server(http);
  server.on('connection', (socket) => {
    socket.on('chat:send', (payload: unknown, ack: (a: unknown) => void) => {
      received.push({ event: 'chat:send', payload });
      ack({ ok: true, value: { messagesLeft: 4 } });
    });
    socket.on('funds:send', (payload: unknown, ack: (a: unknown) => void) => {
      received.push({ event: 'funds:send', payload });
      ack({ ok: false, code: 'NOT_ENOUGH_FUNDS', message: 'You do not have enough Task Funds.' });
    });
    // Never answers, to test the timeout.
    socket.on('task:start', () => undefined);
    // Drops the connection the first time, before answering (the answer is lost).
    socket.on('task:submit', (payload: unknown, ack: (a: unknown) => void) => {
      received.push({ event: 'task:submit', payload });
      if (received.filter((r) => r.event === 'task:submit').length === 1) socket.conn.close();
      else ack({ ok: true, value: { status: 'wrong' } });
    });
  });
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as AddressInfo).port;
  client = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
  await new Promise<void>((r) => client.on('connect', () => r()));
});

afterEach(async () => {
  client.disconnect();
  await server.close();
});

describe('emitWithAck', () => {
  it('delivers a chat message to the server and returns its answer', async () => {
    const ack = await emitWithAck(client, 'chat:send', { body: 'hello' });
    expect(received).toEqual([
      { event: 'chat:send', payload: { body: 'hello', actionId: expect.any(String) } },
    ]);
    expect(ack).toEqual({ ok: true, value: { messagesLeft: 4 } });
  });

  it('delivers a fund transfer and passes on a refusal message', async () => {
    const ack = await emitWithAck(client, 'funds:send', { toTeamId: 'team-2', amount: 500 });
    expect(received).toEqual([
      {
        event: 'funds:send',
        payload: { toTeamId: 'team-2', amount: 500, actionId: expect.any(String) },
      },
    ]);
    expect(ack).toMatchObject({ ok: false, message: 'You do not have enough Task Funds.' });
  });

  it('answers with a message when the server does not reply in time, after one more try', async () => {
    const ack = await emitWithAck(client, 'task:start', { taskId: 't' }, 200);
    expect(ack).toEqual({ ok: false, message: 'The server did not answer. Please try again.' });
  });

  it('sends the same action again with the same ID after the connection drops', async () => {
    const ack = await emitWithAck(client, 'task:submit', { taskId: 't', submission: 'x' }, 2_000);
    expect(ack).toEqual({ ok: true, value: { status: 'wrong' } });
    const sent = received.filter((r) => r.event === 'task:submit');
    expect(sent).toHaveLength(2);
    const [a, b] = sent.map((r) => (r.payload as { actionId: string }).actionId);
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(b).toBe(a);
  });

  it('gives every new press its own ID', async () => {
    await emitWithAck(client, 'chat:send', { body: 'one' });
    await emitWithAck(client, 'chat:send', { body: 'two' });
    const ids = received.map((r) => (r.payload as { actionId: string }).actionId);
    expect(new Set(ids).size).toBe(2);
  });

  it('does not queue an action while offline', async () => {
    client.disconnect();
    const ack = await emitWithAck(client, 'chat:send', { body: 'later' });
    expect(ack).toMatchObject({
      ok: false,
      message: 'Not connected. Wait a moment and try again.',
    });
    expect(received).toEqual([]);
  });
});
