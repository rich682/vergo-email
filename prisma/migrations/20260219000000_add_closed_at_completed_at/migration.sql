-- AlterTable: Add closedAt to Board for close-speed analytics
ALTER TABLE "Board" ADD COLUMN "closedAt" TIMESTAMP(3);

-- AlterTable: Add completedAt to Job (TaskInstance) for target vs actual analytics
ALTER TABLE "Job" ADD COLUMN "completedAt" TIMESTAMP(3);
