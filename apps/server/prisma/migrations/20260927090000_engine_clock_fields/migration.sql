-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "playMsBeforePhase" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "finishPlaySecondsRemaining" INTEGER,
ADD COLUMN     "finishedAt" TIMESTAMP(3);
