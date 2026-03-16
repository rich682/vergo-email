-- AlterTable: Add universal link fields to FormDefinition
ALTER TABLE "FormDefinition" ADD COLUMN "universalLinkEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FormDefinition" ADD COLUMN "universalAccessToken" TEXT;

-- AlterTable: Add formDefinitionId to TaskInstance for task-form linkage
ALTER TABLE "TaskInstance" ADD COLUMN "formDefinitionId" TEXT;

-- CreateIndex: Unique index on universalAccessToken
CREATE UNIQUE INDEX "FormDefinition_universalAccessToken_key" ON "FormDefinition"("universalAccessToken");

-- CreateIndex: Index on universalAccessToken for fast lookups
CREATE INDEX "FormDefinition_universalAccessToken_idx" ON "FormDefinition"("universalAccessToken");

-- CreateIndex: Index on formDefinitionId for task-form lookups
CREATE INDEX "TaskInstance_formDefinitionId_idx" ON "TaskInstance"("formDefinitionId");

-- AddForeignKey
ALTER TABLE "TaskInstance" ADD CONSTRAINT "TaskInstance_formDefinitionId_fkey" FOREIGN KEY ("formDefinitionId") REFERENCES "FormDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
