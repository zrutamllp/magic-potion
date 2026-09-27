import jwt from 'jsonwebtoken';
import { z } from 'zod';

// Login tokens. A team token names its TeamSession (tokenId), so ending the session ends the
// token even before it expires. A staff token names only the account: the role and the active
// flag are read fresh from the database on every use.

const TeamClaimsSchema = z.object({
  kind: z.literal('team'),
  teamId: z.string(),
  gameId: z.string(),
  tokenId: z.string(),
});
const StaffClaimsSchema = z.object({ kind: z.literal('staff'), staffUserId: z.string() });
const ClaimsSchema = z.discriminatedUnion('kind', [TeamClaimsSchema, StaffClaimsSchema]);

export type TeamClaims = z.infer<typeof TeamClaimsSchema>;
export type StaffClaims = z.infer<typeof StaffClaimsSchema>;
export type Claims = z.infer<typeof ClaimsSchema>;

const TEAM_TOKEN_HOURS = 24;
const STAFF_TOKEN_HOURS = 12;

export class Tokens {
  constructor(private readonly secret: string) {}

  signTeam(claims: Omit<TeamClaims, 'kind'>): string {
    return jwt.sign({ kind: 'team', ...claims }, this.secret, {
      algorithm: 'HS256',
      expiresIn: `${TEAM_TOKEN_HOURS}h`,
    });
  }

  signStaff(claims: Omit<StaffClaims, 'kind'>): string {
    return jwt.sign({ kind: 'staff', ...claims }, this.secret, {
      algorithm: 'HS256',
      expiresIn: `${STAFF_TOKEN_HOURS}h`,
    });
  }

  // Null for a missing, expired, tampered or malformed token.
  verify(token: unknown): Claims | null {
    if (typeof token !== 'string' || token === '') return null;
    try {
      const decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
      const parsed = ClaimsSchema.safeParse(decoded);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
