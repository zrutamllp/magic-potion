import {
  DEFAULT_SETTINGS,
  TaskKeySchema,
  parseTaskContent,
  type GameSettings,
  type TaskKey,
} from '@magic-potion/shared';
import { SAMPLE_INBOX_ITEMS, sampleContentFor } from '../../prisma/sampleContent';
import type { PrismaClient } from '../generated/prisma/client';

// Creates a lobby game in the database with the sample content pack.
// With a team count (simulation and integration tests) its teams cannot log in. The admin panel
// passes real team logins instead.

export interface NewTeamRow {
  code: string;
  name: string;
  passwordHash: string;
}

export async function createSampleGame(
  prisma: PrismaClient,
  // uniqueTasks: load only these unique tasks, so every team draws them (screenshots).
  opts: {
    name: string;
    teams: number | NewTeamRow[];
    settings?: GameSettings;
    uniqueTasks?: TaskKey[];
  },
): Promise<string> {
  const settings = opts.settings ?? DEFAULT_SETTINGS;
  const definitions = await prisma.taskDefinition.findMany();
  const definitionId = new Map(definitions.map((d) => [d.key, d.id]));
  const content = sampleContentFor(opts.uniqueTasks).map((c) => {
    const key = TaskKeySchema.parse(c.key);
    const taskDefinitionId = definitionId.get(key);
    if (!taskDefinitionId) throw new Error(`Task definitions are missing. Run npm run db:seed.`);
    return { ...c, ...parseTaskContent(key, c), taskDefinitionId };
  });

  const teams =
    typeof opts.teams === 'number'
      ? Array.from({ length: opts.teams }, (_, i) => ({
          code: `SIM${String(i + 1).padStart(2, '0')}`,
          name: `Team ${i + 1}`,
          // Not a bcrypt hash, so nobody can log in as a simulated team.
          passwordHash: 'simulation-no-login',
        }))
      : opts.teams;

  // All or nothing, so a failed create never leaves half a game behind.
  return prisma.$transaction(async (tx) => {
    const game = await tx.game.create({
      data: { name: opts.name, settings: { create: { data: settings } } },
    });
    await tx.team.createMany({ data: teams.map((t) => ({ ...t, gameId: game.id })) });
    await tx.taskContent.createMany({
      data: content.map((c) => ({
        gameId: game.id,
        taskDefinitionId: c.taskDefinitionId,
        variant: c.variant,
        publicData: c.publicData,
        secretData: c.secretData,
      })),
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
    return game.id;
  });
}
