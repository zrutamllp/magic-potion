// Errors that mean "the database could not be reached in time", not "something is broken"
// (Phase 7C): Prisma could not start a transaction (P2028) or get a connection (P2024), or the
// connection pool timed out. They are answered with 503 and a retry, never with 500.

const BUSY_CODES = new Set(['P2028', 'P2024']);
const BUSY_TEXT = [
  'unable to start a transaction',
  'timeout exceeded when trying to connect',
  'timed out fetching a new connection',
];

export function isBusyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && BUSY_CODES.has(code)) return true;
  const text = typeof message === 'string' ? message.toLowerCase() : '';
  return BUSY_TEXT.some((t) => text.includes(t));
}
