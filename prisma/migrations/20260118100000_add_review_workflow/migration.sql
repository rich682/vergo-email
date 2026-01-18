-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('UNREVIEWED', 'NEEDS_FOLLOW_UP', 'REVIEWED');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewNotes" TEXT;

-- CreateTable
CREATE TABLE "ReviewAuditLog" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewAuditLog_messageId_idx" ON "ReviewAuditLog"("messageId");

-- CreateIndex
CREATE INDEX "ReviewAuditLog_userId_idx" ON "ReviewAuditLog"("userId");

-- CreateIndex
CREATE INDEX "ReviewAuditLog_createdAt_idx" ON "ReviewAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Message_reviewStatus_idx" ON "Message"("reviewStatus");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAuditLog" ADD CONSTRAINT "ReviewAuditLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAuditLog" ADD CONSTRAINT "ReviewAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
