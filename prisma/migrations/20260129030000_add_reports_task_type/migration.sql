-- Add REPORTS to TaskType enum
ALTER TYPE "TaskType" ADD VALUE 'REPORTS';

-- Add report configuration columns to TaskInstance (Job)
ALTER TABLE "Job" ADD COLUMN "reportDefinitionId" TEXT;
ALTER TABLE "Job" ADD COLUMN "reportSliceId" TEXT;

-- Add foreign key constraints for report configuration
ALTER TABLE "Job" ADD CONSTRAINT "Job_reportDefinitionId_fkey" FOREIGN KEY ("reportDefinitionId") REFERENCES "ReportDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_reportSliceId_fkey" FOREIGN KEY ("reportSliceId") REFERENCES "ReportSlice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportDefinitionId" TEXT NOT NULL,
    "reportSliceId" TEXT,
    "taskInstanceId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,

    CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedReport_organizationId_periodKey_idx" ON "GeneratedReport"("organizationId", "periodKey");

-- CreateIndex
CREATE INDEX "GeneratedReport_reportDefinitionId_idx" ON "GeneratedReport"("reportDefinitionId");

-- CreateIndex
CREATE INDEX "GeneratedReport_boardId_idx" ON "GeneratedReport"("boardId");

-- CreateIndex
CREATE INDEX "GeneratedReport_taskInstanceId_idx" ON "GeneratedReport"("taskInstanceId");

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_reportDefinitionId_fkey" FOREIGN KEY ("reportDefinitionId") REFERENCES "ReportDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_reportSliceId_fkey" FOREIGN KEY ("reportSliceId") REFERENCES "ReportSlice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_taskInstanceId_fkey" FOREIGN KEY ("taskInstanceId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
