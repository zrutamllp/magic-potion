import { GameSettingsSchema } from '@magic-potion/shared';
import type { PrismaClient } from '../generated/prisma/client';
import type { PhotoCleanupStore, PhotoGame } from './photoCleanup';

const ms = (d: Date | null) => (d ? d.getTime() : null);
const pending = { photoUrl: { not: null }, photoDeletedAt: null } as const;

export class PrismaPhotoCleanupStore implements PhotoCleanupStore {
  constructor(private readonly prisma: PrismaClient) {}

  async gamesWithPhotos(): Promise<PhotoGame[]> {
    const games = await this.prisma.game.findMany({
      where: { startedAt: { not: null }, inboxItems: { some: { responses: { some: pending } } } },
      select: {
        id: true,
        phase: true,
        startedAt: true,
        phaseStartedAt: true,
        endedAt: true,
        settings: { select: { data: true } },
      },
    });
    return games.map((g) => ({
      id: g.id,
      phase: g.phase,
      startedAt: ms(g.startedAt),
      phaseStartedAt: ms(g.phaseStartedAt),
      endedAt: ms(g.endedAt),
      retentionDays: GameSettingsSchema.parse(g.settings?.data).inbox.photoRetentionDays,
    }));
  }

  async photoUrls(gameId: string): Promise<string[]> {
    const rows = await this.prisma.inboxResponse.findMany({
      where: { ...pending, inboxItem: { gameId } },
      select: { photoUrl: true },
    });
    return rows.flatMap((r) => (r.photoUrl ? [r.photoUrl] : []));
  }

  async markDeleted(gameId: string, urls: string[], at: number): Promise<void> {
    await this.prisma.inboxResponse.updateMany({
      where: { inboxItem: { gameId }, photoUrl: { in: urls } },
      data: { photoUrl: null, photoDeletedAt: new Date(at) },
    });
  }
}
