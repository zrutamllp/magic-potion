-- CreateEnum
CREATE TYPE "GamePhase" AS ENUM ('LOBBY', 'ROUND1', 'PAUSE', 'ROUND2', 'REVEAL');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('COMMON', 'UNIQUE');

-- CreateEnum
CREATE TYPE "TeamTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "AttemptResult" AS ENUM ('SOLVED', 'FAILED_TIMEOUT', 'GAVE_UP', 'STOPPED_AT_END');

-- CreateEnum
CREATE TYPE "FragmentKind" AS ENUM ('VAULT', 'FIND_CODE');

-- CreateEnum
CREATE TYPE "Wallet" AS ENUM ('TASK', 'SUPPORT');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('START', 'TRANSFER_OUT', 'TRANSFER_IN', 'FAIL_PENALTY', 'HINT', 'STAFF_ADJUST', 'UNDO');

-- CreateEnum
CREATE TYPE "FundRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InboxKind" AS ENUM ('PHOTO', 'QUESTION', 'ALERT');

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PotionSnapshotKind" AS ENUM ('HALFTIME', 'FINAL');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('MAIN_ADMIN', 'CO_FACILITATOR');

-- CreateEnum
CREATE TYPE "AdjustmentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phase" "GamePhase" NOT NULL DEFAULT 'LOBBY',
    "phaseStartedAt" TIMESTAMP(3),
    "phaseEndsAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "extensionSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSettings" (
    "gameId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "scoringLockedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSettings_pkey" PRIMARY KEY ("gameId")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "TeamStatus" NOT NULL DEFAULT 'ACTIVE',
    "removedAt" TIMESTAMP(3),
    "chainPosition" INTEGER,
    "taskFunds" INTEGER NOT NULL DEFAULT 0,
    "supportFunds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamSession" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "TeamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TaskDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskContent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "taskDefinitionId" TEXT NOT NULL,
    "variant" INTEGER NOT NULL,
    "publicData" JSONB NOT NULL,
    "secretData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamTask" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "taskDefinitionId" TEXT NOT NULL,
    "status" "TeamTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttempt" (
    "id" TEXT NOT NULL,
    "teamTaskId" TEXT NOT NULL,
    "taskContentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "frozenRemainingMs" INTEGER,
    "frozenLockMs" INTEGER,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "progress" JSONB NOT NULL DEFAULT '{}',
    "result" "AttemptResult",
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TaskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fragment" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "kind" "FragmentKind" NOT NULL,
    "holderTeamId" TEXT NOT NULL,
    "neededByTeamId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releasedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fragment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundTransaction" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "wallet" "Wallet" NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "transferId" TEXT,
    "taskAttemptId" TEXT,
    "auditLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "fromTeamId" TEXT NOT NULL,
    "toTeamId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivesAt" TIMESTAMP(3) NOT NULL,
    "frozenRemainingMs" INTEGER,
    "arrivedAt" TIMESTAMP(3),
    "fundRequestId" TEXT,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundRequest" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "requesterTeamId" TEXT NOT NULL,
    "payerTeamId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "FundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "FundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundAdjustmentRequest" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdjustmentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundAdjustmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "kind" "InboxKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publicData" JSONB NOT NULL DEFAULT '{}',
    "secretAnswer" JSONB,
    "releaseAtPlaySeconds" INTEGER,
    "releasedAt" TIMESTAMP(3),
    "reward" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxResponse" (
    "id" TEXT NOT NULL,
    "inboxItemId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAnswer" TEXT,
    "correct" BOOLEAN NOT NULL DEFAULT false,
    "photoUrl" TEXT,
    "photoStatus" "PhotoStatus",
    "reviewedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PotionSnapshot" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "kind" "PotionSnapshotKind" NOT NULL,
    "completedTeams" INTEGER NOT NULL,
    "totalTeams" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PotionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "gameId" TEXT,
    "staffUserId" TEXT NOT NULL,
    "teamId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoOfId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE INDEX "StaffAssignment_staffUserId_gameId_idx" ON "StaffAssignment"("staffUserId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAssignment_gameId_teamId_staffUserId_key" ON "StaffAssignment"("gameId", "teamId", "staffUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_gameId_code_key" ON "Team"("gameId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Team_gameId_chainPosition_key" ON "Team"("gameId", "chainPosition");

-- CreateIndex
CREATE UNIQUE INDEX "TeamSession_tokenId_key" ON "TeamSession"("tokenId");

-- CreateIndex
CREATE INDEX "TeamSession_teamId_endedAt_idx" ON "TeamSession"("teamId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDefinition_key_key" ON "TaskDefinition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TaskContent_gameId_taskDefinitionId_variant_key" ON "TaskContent"("gameId", "taskDefinitionId", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "TeamTask_teamId_taskDefinitionId_key" ON "TeamTask"("teamId", "taskDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttempt_teamTaskId_number_key" ON "TaskAttempt"("teamTaskId", "number");

-- CreateIndex
CREATE INDEX "Fragment_holderTeamId_idx" ON "Fragment"("holderTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "Fragment_gameId_kind_neededByTeamId_key" ON "Fragment"("gameId", "kind", "neededByTeamId");

-- CreateIndex
CREATE INDEX "FundTransaction_teamId_wallet_createdAt_idx" ON "FundTransaction"("teamId", "wallet", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_fundRequestId_key" ON "Transfer"("fundRequestId");

-- CreateIndex
CREATE INDEX "Transfer_gameId_arrivedAt_idx" ON "Transfer"("gameId", "arrivedAt");

-- CreateIndex
CREATE INDEX "Transfer_fromTeamId_idx" ON "Transfer"("fromTeamId");

-- CreateIndex
CREATE INDEX "Transfer_toTeamId_idx" ON "Transfer"("toTeamId");

-- CreateIndex
CREATE INDEX "FundRequest_gameId_createdAt_idx" ON "FundRequest"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "FundRequest_payerTeamId_status_idx" ON "FundRequest"("payerTeamId", "status");

-- CreateIndex
CREATE INDEX "FundAdjustmentRequest_gameId_status_idx" ON "FundAdjustmentRequest"("gameId", "status");

-- CreateIndex
CREATE INDEX "ChatMessage_gameId_createdAt_idx" ON "ChatMessage"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_teamId_round_idx" ON "ChatMessage"("teamId", "round");

-- CreateIndex
CREATE INDEX "InboxItem_gameId_releasedAt_idx" ON "InboxItem"("gameId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxResponse_inboxItemId_teamId_key" ON "InboxResponse"("inboxItemId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "PotionSnapshot_gameId_kind_key" ON "PotionSnapshot"("gameId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_undoOfId_key" ON "AuditLog"("undoOfId");

-- CreateIndex
CREATE INDEX "AuditLog_gameId_createdAt_idx" ON "AuditLog"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_teamId_idx" ON "AuditLog"("teamId");

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSettings" ADD CONSTRAINT "GameSettings_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSession" ADD CONSTRAINT "TeamSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskContent" ADD CONSTRAINT "TaskContent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskContent" ADD CONSTRAINT "TaskContent_taskDefinitionId_fkey" FOREIGN KEY ("taskDefinitionId") REFERENCES "TaskDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamTask" ADD CONSTRAINT "TeamTask_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamTask" ADD CONSTRAINT "TeamTask_taskDefinitionId_fkey" FOREIGN KEY ("taskDefinitionId") REFERENCES "TaskDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_teamTaskId_fkey" FOREIGN KEY ("teamTaskId") REFERENCES "TeamTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_taskContentId_fkey" FOREIGN KEY ("taskContentId") REFERENCES "TaskContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fragment" ADD CONSTRAINT "Fragment_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fragment" ADD CONSTRAINT "Fragment_holderTeamId_fkey" FOREIGN KEY ("holderTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fragment" ADD CONSTRAINT "Fragment_neededByTeamId_fkey" FOREIGN KEY ("neededByTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fragment" ADD CONSTRAINT "Fragment_releasedByStaffId_fkey" FOREIGN KEY ("releasedByStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_taskAttemptId_fkey" FOREIGN KEY ("taskAttemptId") REFERENCES "TaskAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AuditLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fundRequestId_fkey" FOREIGN KEY ("fundRequestId") REFERENCES "FundRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundRequest" ADD CONSTRAINT "FundRequest_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundRequest" ADD CONSTRAINT "FundRequest_requesterTeamId_fkey" FOREIGN KEY ("requesterTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundRequest" ADD CONSTRAINT "FundRequest_payerTeamId_fkey" FOREIGN KEY ("payerTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundAdjustmentRequest" ADD CONSTRAINT "FundAdjustmentRequest_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundAdjustmentRequest" ADD CONSTRAINT "FundAdjustmentRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundAdjustmentRequest" ADD CONSTRAINT "FundAdjustmentRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundAdjustmentRequest" ADD CONSTRAINT "FundAdjustmentRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxResponse" ADD CONSTRAINT "InboxResponse_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxResponse" ADD CONSTRAINT "InboxResponse_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxResponse" ADD CONSTRAINT "InboxResponse_reviewedByStaffId_fkey" FOREIGN KEY ("reviewedByStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotionSnapshot" ADD CONSTRAINT "PotionSnapshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_undoOfId_fkey" FOREIGN KEY ("undoOfId") REFERENCES "AuditLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Checks Prisma cannot express (docs/GAME_RULES.md sections 5 and 9).
ALTER TABLE "Team" ADD CONSTRAINT "Team_supportFunds_nonnegative" CHECK ("supportFunds" >= 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_not_self" CHECK ("fromTeamId" <> "toTeamId");
ALTER TABLE "FundRequest" ADD CONSTRAINT "FundRequest_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "FundRequest" ADD CONSTRAINT "FundRequest_not_self" CHECK ("requesterTeamId" <> "payerTeamId");
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_amount_nonzero" CHECK ("amount" <> 0);
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_support_nonnegative" CHECK ("wallet" <> 'SUPPORT' OR "balanceAfter" >= 0);
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_round_valid" CHECK ("round" IN (1, 2));
-- At most one open session per team.
CREATE UNIQUE INDEX "TeamSession_one_open_per_team" ON "TeamSession" ("teamId") WHERE "endedAt" IS NULL;
