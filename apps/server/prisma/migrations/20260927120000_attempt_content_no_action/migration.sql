-- DropForeignKey
ALTER TABLE "TaskAttempt" DROP CONSTRAINT "TaskAttempt_taskContentId_fkey";

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_taskContentId_fkey" FOREIGN KEY ("taskContentId") REFERENCES "TaskContent"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

