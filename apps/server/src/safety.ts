// Keeps the production database safe (Phase 7A). The production database carries a marker row
// (SystemFlag "environment" = "production", set with `npm run db:mark-production`). Because
// the marker lives inside the database, a wrong .env file cannot hide it:
// - the seed, the screenshot and test scripts and the database tests refuse to change it;
// - a server that is not running as production refuses to start on it;
// - a production server refuses to start on any other database.

export const ENVIRONMENT_FLAG = 'environment';
export const PRODUCTION = 'production';

// The one table this needs, so tests can pass a fake.
export interface FlagReader {
  systemFlag: {
    findUnique(args: { where: { key: string } }): Promise<{ value: string } | null>;
  };
}

export async function isProductionDatabase(db: FlagReader): Promise<boolean> {
  const flag = await db.systemFlag.findUnique({ where: { key: ENVIRONMENT_FLAG } });
  return flag?.value === PRODUCTION;
}

export class ProductionDatabaseError extends Error {}

// For anything that creates, resets or deletes test or demo data.
export async function assertNotProduction(db: FlagReader, action: string): Promise<void> {
  if (await isProductionDatabase(db)) {
    throw new ProductionDatabaseError(
      `This is the production database. ${action} is not allowed here. Point DATABASE_URL at a development or test branch.`,
    );
  }
}

// Why the server must not start with this database, or null when all is well.
export function databaseRoleProblem(isProduction: boolean, nodeEnv: string): string | null {
  if (isProduction && nodeEnv !== 'production') {
    return 'DATABASE_URL points at the production database, but NODE_ENV is not "production". A local or test server must never use the live database.';
  }
  if (!isProduction && nodeEnv === 'production') {
    return 'NODE_ENV is "production", but DATABASE_URL points at a database that is not marked as production. Run `npm run db:mark-production -- --yes` on the production branch first.';
  }
  return null;
}
