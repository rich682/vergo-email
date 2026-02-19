-- AlterTable
ALTER TABLE "AnalysisConversation" ADD COLUMN "taskInstanceId" TEXT;

-- AddForeignKey
ALTER TABLE "AnalysisConversation" ADD CONSTRAINT "AnalysisConversation_taskInstanceId_fkey" FOREIGN KEY ("taskInstanceId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AnalysisConversation_taskInstanceId_idx" ON "AnalysisConversation"("taskInstanceId");
