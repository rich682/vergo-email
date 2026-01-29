-- CreateTable
CREATE TABLE "ReportSlice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportDefinitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filterBindings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "ReportSlice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportSlice_organizationId_reportDefinitionId_idx" ON "ReportSlice"("organizationId", "reportDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSlice_reportDefinitionId_name_key" ON "ReportSlice"("reportDefinitionId", "name");

-- AddForeignKey
ALTER TABLE "ReportSlice" ADD CONSTRAINT "ReportSlice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSlice" ADD CONSTRAINT "ReportSlice_reportDefinitionId_fkey" FOREIGN KEY ("reportDefinitionId") REFERENCES "ReportDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSlice" ADD CONSTRAINT "ReportSlice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
