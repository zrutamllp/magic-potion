// Every database connection is encrypted and checks the server's certificate (Phase 7A):
// sslmode=verify-full. Neon's connection strings say "require"; pg treats "prefer", "require"
// and "verify-ca" as "verify-full" and prints a warning, so ask for "verify-full" directly. A
// string with no sslmode gets it too. Only "disable" (and a local database on this computer)
// is left alone; the production start check refuses "disable".
// No imports, so the Prisma migration config can use it as well.
export function withVerifyFullSsl(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return databaseUrl;
  }
  const mode = url.searchParams.get('sslmode');
  if (mode === 'verify-full' || mode === 'disable') return databaseUrl;
  if (mode === null && isLocalHost(url.hostname)) return databaseUrl;
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}
