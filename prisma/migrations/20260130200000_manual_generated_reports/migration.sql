-- AlterTable: Make taskInstanceId and boardId optional, add source field
ALTER TABLE "GeneratedReport" ALTER COLUMN "taskInstanceId" DROP NOT NULL;
ALTER TABLE "GeneratedReport" ALTER COLUMN "boardId" DROP NOT NULL;
ALTER TABLE "GeneratedReport" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'task';
