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
    expect(received).toEqual([{ event: 'chat:send', payload: { body: 'hello' } }]);
    expect(ack).toEqual({ ok: true, value: { messagesLeft: 4 } });
  });

  it('delivers a fund transfer and passes on a refusal message', async () => {
    const ack = await emitWithAck(client, 'funds:send', { toTeamId: 'team-2', amount: 500 });
    expect(received).toEqual([
      { event: 'funds:send', payload: { toTeamId: 'team-2', amount: 500 } },
    ]);
    expect(ack).toMatchObject({ ok: false, message: 'You do not have enough Task Funds.' });
  });

  it('answers with a message when the server does not reply in time', async () => {
    const ack = await emitWithAck(client, 'task:start', { taskId: 't' }, 200);
    expect(ack).toEqual({ ok: false, message: 'The server did not answer. Please try again.' });
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
