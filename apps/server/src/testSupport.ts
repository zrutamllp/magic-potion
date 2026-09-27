import bcrypt from 'bcryptjs';
import { MemoryAuthStore } from './auth/memoryStore';
import { AuthService } from './auth/service';
import { Tokens } from './auth/tokens';

// Logins that match the in-memory game from engine/memoryGame.ts ("game-1", "team-1"...).
// For tests only.

export const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';
export const ADMIN = { id: 'admin-1', email: 'admin@example.com', password: 'admin-pass' };
export const COFAC = { id: 'cofac-1', email: 'cofac@example.com', password: 'cofac-pass' };

export const teamPassword = (i: number) => `pass-${i}`;

export function authFixture(teams = 3) {
  const store = new MemoryAuthStore();
  const hash = (p: string) => bcrypt.hashSync(p, 4);
  store.games.push({ id: 'game-1', name: 'Memory game', phase: 'LOBBY' });
  for (let i = 1; i <= teams; i++) {
    store.teams.push({
      id: `team-${i}`,
      gameId: 'game-1',
      code: `TEAM${i}`,
      name: `Team ${i}`,
      passwordHash: hash(teamPassword(i)),
    });
  }
  store.staff.push(
    {
      id: ADMIN.id,
      name: 'Main admin',
      email: ADMIN.email,
      role: 'MAIN_ADMIN',
      active: true,
      passwordHash: hash(ADMIN.password),
    },
    {
      id: COFAC.id,
      name: 'Co-facilitator',
      email: COFAC.email,
      role: 'CO_FACILITATOR',
      active: true,
      passwordHash: hash(COFAC.password),
    },
  );
  store.assignments.push({ staffUserId: COFAC.id, gameId: 'game-1', teamId: 'team-1' });
  const tokens = new Tokens(TEST_SECRET);
  const auth = new AuthService(store, tokens);
  return { store, tokens, auth };
}
