-- CreateEnum
CREATE TYPE "CollectedItemStatus" AS ENUM ('UNREVIEWED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CollectedItemSource" AS ENUM ('EMAIL_REPLY', 'MANUAL_UPLOAD');

-- CreateTable
CREATE TABLE "CollectedItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "taskId" TEXT,
    "messageId" TEXT,
    "filename" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "source" "CollectedItemSource" NOT NULL,
    "submittedBy" TEXT,
    "submittedByName" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "CollectedItemStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectedItem_organizationId_idx" ON "CollectedItem"("organizationId");

-- CreateIndex
CREATE INDEX "CollectedItem_jobId_idx" ON "CollectedItem"("jobId");

-- CreateIndex
CREATE INDEX "CollectedItem_taskId_idx" ON "CollectedItem"("taskId");

-- CreateIndex
CREATE INDEX "CollectedItem_messageId_idx" ON "CollectedItem"("messageId");

-- CreateIndex
CREATE INDEX "CollectedItem_status_idx" ON "CollectedItem"("status");

-- CreateIndex
CREATE INDEX "CollectedItem_jobId_status_idx" ON "CollectedItem"("jobId", "status");

-- CreateIndex
CREATE INDEX "CollectedItem_organizationId_jobId_idx" ON "CollectedItem"("organizationId", "jobId");

-- AddForeignKey
ALTER TABLE "CollectedItem" ADD CONSTRAINT "CollectedItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectedItem" ADD CONSTRAINT "CollectedItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectedItem" ADD CONSTRAINT "CollectedItem_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectedItem" ADD CONSTRAINT "CollectedItem_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
