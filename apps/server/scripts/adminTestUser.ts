// A throwaway main admin for the admin panel screenshots (e2e/admin-6a.spec.ts), so the real
// admin's password is never used or typed by a test.
//
//   node --env-file-if-exists=.env --import tsx scripts/adminTestUser.ts create
//     prints JSON: { email, password }
//   node --env-file-if-exists=.env --import tsx scripts/adminTestUser.ts delete <email> [blobUrl...]
//     deletes that admin, the games, content packs and co-facilitators it made, their audit lines,
//     the team photos uploaded in those games, and the uploaded pictures given as blob URLs
//
// Local use only. Existing games, packs and staff are never touched.
import { randomBytes } from 'node:crypto';
import { del } from '@vercel/blob';
import bcrypt from 'bcryptjs';
import { createPrisma } from '../src/db';
import { loadEnv } from '../src/env';
import { assertNotProduction } from '../src/safety';

const env = loadEnv();
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is needed in apps/server/.env');
const prisma = createPrisma(env.DATABASE_URL);
const [command, ...args] = process.argv.slice(2);

try {
  await assertNotProduction(prisma, 'Making or deleting test admins');
  if (command === 'create') {
    const tag = randomBytes(4).toString('hex');
    const email = `e2e-admin-${tag}@example.com`;
    const password = randomBytes(12).toString('hex');
    await prisma.staffUser.create({
      data: {
        name: 'Test Admin',
        email,
        passwordHash: await bcrypt.hash(password, 4),
        role: 'MAIN_ADMIN',
      },
    });
    console.log(JSON.stringify({ email, password }));
  } else if (command === 'delete') {
    const [email, ...blobUrls] = args;
    if (!email?.startsWith('e2e-admin-'))
      throw new Error('Only e2e-admin-... users can be deleted.');
    const admin = await prisma.staffUser.findUnique({ where: { email } });
    if (admin) {
      const made = await prisma.auditLog.findMany({
        where: {
          staffUserId: admin.id,
          action: { in: ['CREATE_GAME', 'CREATE_STAFF', 'CREATE_PACK', 'COPY_PACK'] },
        },
        select: { action: true, gameId: true, after: true },
      });
      const gameIds = made.filter((m) => m.action === 'CREATE_GAME').map((m) => m.gameId!);
      const staffIds = made
        .filter((m) => m.action === 'CREATE_STAFF')
        .map((m) => (m.after as { id: string }).id);
      const packIds = made
        .filter((m) => m.action === 'CREATE_PACK' || m.action === 'COPY_PACK')
        .map((m) => (m.after as { id: string }).id);
      const staff = [admin.id, ...staffIds];
      // Team photos uploaded in those games go too (they are files in Blob, not rows).
      const photos = await prisma.inboxResponse.findMany({
        where: { inboxItem: { gameId: { in: gameIds } }, photoUrl: { not: null } },
        select: { photoUrl: true },
      });
      for (const p of photos) if (p.photoUrl) blobUrls.push(p.photoUrl);
      await prisma.$transaction([
        prisma.game.deleteMany({ where: { id: { in: gameIds } } }),
        // Only packs this admin made, never the Sample pack.
        prisma.contentPack.deleteMany({ where: { id: { in: packIds }, builtIn: false } }),
        prisma.auditLog.deleteMany({ where: { staffUserId: { in: staff } } }),
        prisma.staffUser.deleteMany({ where: { id: { in: staff } } }),
      ]);
      console.log(
        JSON.stringify({ games: gameIds.length, packs: packIds.length, staff: staff.length }),
      );
    }
    if (blobUrls.length > 0 && env.BLOB_READ_WRITE_TOKEN) {
      await del(blobUrls, { token: env.BLOB_READ_WRITE_TOKEN });
    }
  } else {
    throw new Error('Use "create" or "delete <email> [blobUrl...]"');
  }
} finally {
  await prisma.$disconnect();
}
