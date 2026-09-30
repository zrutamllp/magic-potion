import { describe, expect, it } from 'vitest';
import {
  ProductionDatabaseError,
  assertNotProduction,
  databaseRoleProblem,
  isProductionDatabase,
  type FlagReader,
} from './safety';
import { testDatabaseUrl } from './testDatabase';

function db(value: string | null): FlagReader {
  return {
    systemFlag: {
      findUnique: async () => (value === null ? null : { value }),
    },
  };
}

describe('the production database marker', () => {
  it('is read from the database', async () => {
    expect(await isProductionDatabase(db('production'))).toBe(true);
    expect(await isProductionDatabase(db(null))).toBe(false);
    expect(await isProductionDatabase(db('staging'))).toBe(false);
  });

  it('stops test and demo data on the production database', async () => {
    await expect(assertNotProduction(db('production'), 'Resetting the demo game')).rejects.toThrow(
      ProductionDatabaseError,
    );
    await expect(assertNotProduction(db('production'), 'Resetting the demo game')).rejects.toThrow(
      'This is the production database. Resetting the demo game is not allowed here.',
    );
    await expect(assertNotProduction(db(null), 'Resetting the demo game')).resolves.toBeUndefined();
  });

  it('keeps the live database and every other server apart', () => {
    expect(databaseRoleProblem(true, 'production')).toBeNull();
    expect(databaseRoleProblem(false, 'development')).toBeNull();
    expect(databaseRoleProblem(false, 'test')).toBeNull();
    expect(databaseRoleProblem(true, 'development')).toMatch(/must never use the live database/);
    expect(databaseRoleProblem(true, 'test')).toMatch(/must never use the live database/);
    expect(databaseRoleProblem(false, 'production')).toMatch(/not marked as production/);
  });
});

describe('the test database', () => {
  const url = (host: string) => `postgresql://u:p@${host}/neondb?sslmode=require`;

  it('is used only when set', () => {
    expect(testDatabaseUrl({})).toBeUndefined();
    expect(testDatabaseUrl({ TEST_DATABASE_URL: url('tests.neon.tech') })).toBe(
      url('tests.neon.tech'),
    );
  });

  it('must be a different branch from the app database', () => {
    expect(() =>
      testDatabaseUrl({
        TEST_DATABASE_URL: url('main.neon.tech'),
        MAIN_DATABASE_HOST: 'main.neon.tech',
      }),
    ).toThrow('same Neon branch');
    expect(
      testDatabaseUrl({
        TEST_DATABASE_URL: url('tests.neon.tech'),
        MAIN_DATABASE_HOST: 'main.neon.tech',
      }),
    ).toBe(url('tests.neon.tech'));
  });
});
