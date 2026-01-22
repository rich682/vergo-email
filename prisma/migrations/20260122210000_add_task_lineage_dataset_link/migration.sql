-- AlterTable
ALTER TABLE "TaskLineage" ADD COLUMN "datasetTemplateId" TEXT;

-- CreateIndex
CREATE INDEX "TaskLineage_datasetTemplateId_idx" ON "TaskLineage"("datasetTemplateId");

-- AddForeignKey
ALTER TABLE "TaskLineage" ADD CONSTRAINT "TaskLineage_datasetTemplateId_fkey" FOREIGN KEY ("datasetTemplateId") REFERENCES "DatasetTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
