-- Checked at commit, so deleting a game can cascade to its task attempts before the check runs.
-- Prisma cannot express DEFERRABLE, so it lives here (like the CHECK constraints in the init migration).
ALTER TABLE "TaskAttempt" ALTER CONSTRAINT "TaskAttempt_taskContentId_fkey" DEFERRABLE INITIALLY DEFERRED;
