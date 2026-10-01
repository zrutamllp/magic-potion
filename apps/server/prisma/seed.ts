import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { TASK_DEFINITIONS, TaskKeySchema, parseTaskContent } from '@magic-potion/shared';
import { createPrisma } from '../src/db';
import { assertNotProduction, isProductionDatabase } from '../src/safety';
import { loadEnv } from '../src/env';
import { demoSettings, describeTiming } from './demoSettings';
import { SAMPLE_INBOX_ITEMS, parseTasksArg, sampleContentFor } from './sampleContent';

// Safe to run more than once: existing rows are left alone. On the production database it only
// adds the first admin and the task definitions, and refuses --reset-demo.
// Pass --reset-demo to delete and recreate the demo game (prints new team passwords).
// Add --short for quick hand testing: 5-minute rounds and a 1-minute pause.
// Add --tasks riddle,hangman,ethical_dilemma to load only those unique tasks, so every team
// draws them (hand testing one batch of task screens).

const DEMO_GAME_NAME = 'Demo Game';
const DEMO_TEAM_COUNT = 4;
const BCRYPT_ROUNDS = 12;

const env = loadEnv();
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required to seed.');
if (!env.ADMIN_SEED_EMAIL || !env.ADMIN_SEED_PASSWORD) {
  throw new Error('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD are required to seed.');
}
const resetDemo = process.argv.includes('--reset-demo');
const short = process.argv.includes('--short');
const uniqueTasks = parseTasksArg(process.argv);
const settings = demoSettings(short);
const prisma = createPrisma(env.DATABASE_URL);

async function seedAdmin(email: string, password: string) {
  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Main admin ${email} already exists.`);
    return;
  }
  await prisma.staffUser.create({
    data: {
      name: 'Main admin',
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: 'MAIN_ADMIN',
    },
  });
  console.log(`Created main admin ${email}.`);
}

async function seedTaskDefinitions() {
  for (const def of TASK_DEFINITIONS) {
    await prisma.taskDefinition.upsert({
      where: { key: def.key },
      update: { name: def.name, type: def.type, sortOrder: def.sortOrder },
      create: def,
    });
  }
  console.log(`Task definitions: ${TASK_DEFINITIONS.length}.`);
}

async function seedDemoGame() {
  const existing = await prisma.game.findFirst({ where: { name: DEMO_GAME_NAME } });
  if (existing && !resetDemo) {
    console.log(
      `${DEMO_GAME_NAME} already exists. Use --reset-demo${short ? ' --short' : ''} to recreate it.`,
    );
    return;
  }
  if (existing) {
    await prisma.game.delete({ where: { id: existing.id } });
    console.log(`Deleted old ${DEMO_GAME_NAME}.`);
  }

  // Validate the whole pack before writing anything.
  const content = sampleContentFor(uniqueTasks).map((c) => ({
    ...c,
    ...parseTaskContent(TaskKeySchema.parse(c.key), c),
  }));
  const definitions = await prisma.taskDefinition.findMany();
  const definitionId = new Map(definitions.map((d) => [d.key, d.id]));

  const logins = await Promise.all(
    Array.from({ length: DEMO_TEAM_COUNT }, async (_, i) => {
      const password = randomBytes(4).toString('hex');
      return {
        code: `TEAM${i + 1}`,
        name: `Team ${i + 1}`,
        password,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      };
    }),
  );

  await prisma.$transaction(async (tx) => {
    const game = await tx.game.create({
      data: { name: DEMO_GAME_NAME, settings: { create: { data: settings } } },
    });
    await tx.team.createMany({
      data: logins.map(({ code, name, passwordHash }) => ({
        gameId: game.id,
        code,
        name,
        passwordHash,
      })),
    });
    await tx.taskContent.createMany({
      data: content.map((c) => {
        const taskDefinitionId = definitionId.get(c.key);
        if (!taskDefinitionId) throw new Error(`Missing task definition ${c.key}`);
        return {
          gameId: game.id,
          taskDefinitionId,
          variant: c.variant,
          publicData: c.publicData,
          secretData: c.secretData,
        };
      }),
    });
    await tx.inboxItem.createMany({
      data: SAMPLE_INBOX_ITEMS.map((item) => ({
        gameId: game.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        secretAnswer: item.secretAnswer ?? undefined,
        releaseAtPlaySeconds: settings.inbox.releaseAtPlaySeconds[item.releaseSlot] ?? null,
        reward: settings.inbox.reward,
      })),
    });
  });

  console.log(
    `Created ${DEMO_GAME_NAME} with ${DEMO_TEAM_COUNT} teams (${describeTiming(settings)}).`,
  );
  if (uniqueTasks.length > 0) console.log(`Unique tasks: ${uniqueTasks.join(', ')} only.`);
  console.log('Team logins (shown only now):');
  for (const l of logins) console.log(`  ${l.code}  ${l.password}`);
}

try {
  // The production database only ever gets the first admin and the task definitions: never a
  // demo game, and never a reset (Phase 7A).
  if (resetDemo) await assertNotProduction(prisma, 'Resetting the demo game');
  const production = await isProductionDatabase(prisma);
  await seedAdmin(env.ADMIN_SEED_EMAIL, env.ADMIN_SEED_PASSWORD);
  await seedTaskDefinitions();
  if (production) console.log('Production database: no demo game is created here.');
  else await seedDemoGame();
} finally {
  await prisma.$disconnect();
}
