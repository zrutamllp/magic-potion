import type { Socket } from 'socket.io-client';
import type { Ack } from '@magic-potion/shared';

// Sends one action and waits for the server's answer.
//
// emit must be called as a method on the socket (socket.timeout(ms).emit(...)): it reads
// `this`, so pulling it out into a variable first breaks it.
//
// Safe to repeat (Phase 7C): every action carries a random action ID. If the answer is lost
// (the connection drops, or no answer comes in time), the same action is sent once more with
// the same ID, after the reconnect if needed. The server answers a repeat with its first answer
// and applies the action only once, so the player never has to press again and money is never
// sent twice.

type ActionSocket = Pick<Socket, 'connected' | 'timeout' | 'on' | 'off'>;

const NO_ANSWER: Ack = { ok: false, message: 'The server did not answer. Please try again.' };

export function newActionId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// One try: the answer, or null when it was lost (no answer in time, or the connection dropped).
function sendOnce(socket: ActionSocket, event: string, body: unknown, timeoutMs: number) {
  return new Promise<Ack | null>((resolve) => {
    let done = false;
    const finish = (ack: Ack | null) => {
      if (done) return;
      done = true;
      socket.off('disconnect', dropped);
      resolve(ack);
    };
    const dropped = () => finish(null);
    socket.on('disconnect', dropped);
    try {
      socket
        .timeout(timeoutMs)
        .emit(event, body, (err: Error | null, ack: Ack) => finish(err ? null : ack));
    } catch {
      finish({ ok: false, message: 'Something went wrong. Please try again.' });
    }
  });
}

// Waits for the connection to come back, up to `withinMs`.
function connected(socket: ActionSocket, withinMs: number): Promise<boolean> {
  if (socket.connected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off('connect', back);
      resolve(false);
    }, withinMs);
    const back = () => {
      clearTimeout(timer);
      socket.off('connect', back);
      resolve(true);
    };
    socket.on('connect', back);
  });
}

export async function emitWithAck(
  socket: ActionSocket,
  event: string,
  payload: unknown,
  timeoutMs = 10_000,
  reconnectWithinMs = 15_000,
): Promise<Ack> {
  // Never queue an action while offline: it could happen much later without anyone seeing.
  if (!socket.connected) {
    return { ok: false, message: 'Not connected. Wait a moment and try again.' };
  }
  const body =
    payload && typeof payload === 'object' ? { ...payload, actionId: newActionId() } : payload;
  const first = await sendOnce(socket, event, body, timeoutMs);
  if (first) return first;
  // The answer was lost. Send the same action (same ID) once more, after the reconnect.
  if (!(await connected(socket, reconnectWithinMs))) return NO_ANSWER;
  return (await sendOnce(socket, event, body, timeoutMs)) ?? NO_ANSWER;
}
