import {
  DEFAULT_SETTINGS,
  TaskKeySchema,
  parseTaskContent,
  type GameSettings,
} from '@magic-potion/shared';
import { SAMPLE_INBOX_ITEMS, SAMPLE_TASK_CONTENT } from '../../prisma/sampleContent';
import type { PrismaClient } from '../generated/prisma/client';

// Creates a lobby game in the database with the sample content pack.
// For the simulation and integration tests. Its teams cannot log in.

export async function createSampleGame(
  prisma: PrismaClient,
  opts: { name: string; teams: number; settings?: GameSettings },
): Promise<string> {
  const settings = opts.settings ?? DEFAULT_SETTINGS;
  const definitions = await prisma.taskDefinition.findMany();
  const definitionId = new Map(definitions.map((d) => [d.key, d.id]));
  const content = SAMPLE_TASK_CONTENT.map((c) => {
    const key = TaskKeySchema.parse(c.key);
    const taskDefinitionId = definitionId.get(key);
    if (!taskDefinitionId) throw new Error(`Task definitions are missing. Run npm run db:seed.`);
    return { ...c, ...parseTaskContent(key, c), taskDefinitionId };
  });

  const game = await prisma.game.create({
    data: { name: opts.name, settings: { create: { data: settings } } },
  });
  await prisma.team.createMany({
    data: Array.from({ length: opts.teams }, (_, i) => ({
      gameId: game.id,
      code: `SIM${String(i + 1).padStart(2, '0')}`,
      name: `Team ${i + 1}`,
      // Not a bcrypt hash, so nobody can log in as a simulated team.
      passwordHash: 'simulation-no-login',
    })),
  });
  await prisma.taskContent.createMany({
    data: content.map((c) => ({
      gameId: game.id,
      taskDefinitionId: c.taskDefinitionId,
      variant: c.variant,
      publicData: c.publicData,
      secretData: c.secretData,
    })),
  });
  await prisma.inboxItem.createMany({
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
  return game.id;
}
