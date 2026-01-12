-- AlterTable
ALTER TABLE "EmailDraft" ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sendAttemptId" TEXT;
