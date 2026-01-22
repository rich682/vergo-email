-- CreateTable
CREATE TABLE "DatasetTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schema" JSONB NOT NULL,
    "identityKey" TEXT NOT NULL,
    "stakeholderMapping" JSONB,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatasetTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "periodLabel" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "rows" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "stakeholderResults" JSONB,
    "diffSummary" JSONB,
    "priorSnapshotId" TEXT,
    "sourceFilename" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DatasetTemplate_organizationId_idx" ON "DatasetTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "DatasetTemplate_createdById_idx" ON "DatasetTemplate"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetTemplate_organizationId_name_key" ON "DatasetTemplate"("organizationId", "name");

-- CreateIndex
CREATE INDEX "DatasetSnapshot_organizationId_idx" ON "DatasetSnapshot"("organizationId");

-- CreateIndex
CREATE INDEX "DatasetSnapshot_templateId_idx" ON "DatasetSnapshot"("templateId");

-- CreateIndex
CREATE INDEX "DatasetSnapshot_templateId_isLatest_idx" ON "DatasetSnapshot"("templateId", "isLatest");

-- CreateIndex
CREATE INDEX "DatasetSnapshot_templateId_periodStart_idx" ON "DatasetSnapshot"("templateId", "periodStart");

-- AddForeignKey
ALTER TABLE "DatasetTemplate" ADD CONSTRAINT "DatasetTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetTemplate" ADD CONSTRAINT "DatasetTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetSnapshot" ADD CONSTRAINT "DatasetSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetSnapshot" ADD CONSTRAINT "DatasetSnapshot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DatasetTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetSnapshot" ADD CONSTRAINT "DatasetSnapshot_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetSnapshot" ADD CONSTRAINT "DatasetSnapshot_priorSnapshotId_fkey" FOREIGN KEY ("priorSnapshotId") REFERENCES "DatasetSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
