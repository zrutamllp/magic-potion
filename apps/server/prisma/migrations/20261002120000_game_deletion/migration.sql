-- CreateTable
CREATE TABLE "GameDeletion" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedBy" TEXT NOT NULL,
    "counts" JSONB NOT NULL,

    CONSTRAINT "GameDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameDeletion_deletedAt_idx" ON "GameDeletion"("deletedAt");
