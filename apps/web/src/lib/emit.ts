import type { Socket } from 'socket.io-client';
import type { Ack } from '@magic-potion/shared';

// Sends one action and waits for the server's answer.
//
// emit must be called as a method on the socket (socket.timeout(ms).emit(...)): it reads
// `this`, so pulling it out into a variable first breaks it.
export function emitWithAck(
  socket: Pick<Socket, 'connected' | 'timeout'>,
  event: string,
  payload: unknown,
  timeoutMs = 10_000,
): Promise<Ack> {
  // Never queue an action while offline: it could happen much later without anyone seeing.
  if (!socket.connected) {
    return Promise.resolve({ ok: false, message: 'Not connected. Wait a moment and try again.' });
  }
  return new Promise<Ack>((resolve) => {
    try {
      socket
        .timeout(timeoutMs)
        .emit(event, payload, (err: Error | null, ack: Ack) =>
          resolve(
            err ? { ok: false, message: 'The server did not answer. Please try again.' } : ack,
          ),
        );
    } catch {
      resolve({ ok: false, message: 'Something went wrong. Please try again.' });
    }
  });
}
