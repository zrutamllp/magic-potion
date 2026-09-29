-- Phase 6B: content packs, archive. Additive only: new tables and nullable columns;
-- no existing row is changed or deleted.
-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "contentPackId" TEXT,
ADD COLUMN     "dilemmaItemId" TEXT;

-- CreateTable
CREATE TABLE "ContentPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "taskOptions" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPackItem" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "publicData" JSONB NOT NULL,
    "secretData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPackItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPackItem_packId_taskKey_position_idx" ON "ContentPackItem"("packId", "taskKey", "position");

-- CreateIndex
CREATE INDEX "Game_contentPackId_idx" ON "Game"("contentPackId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_contentPackId_fkey" FOREIGN KEY ("contentPackId") REFERENCES "ContentPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPackItem" ADD CONSTRAINT "ContentPackItem_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ContentPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

