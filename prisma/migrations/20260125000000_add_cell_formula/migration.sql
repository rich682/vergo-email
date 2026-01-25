-- CreateTable
CREATE TABLE "CellFormula" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "cellRef" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "CellFormula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CellFormula_organizationId_idx" ON "CellFormula"("organizationId");

-- CreateIndex
CREATE INDEX "CellFormula_lineageId_idx" ON "CellFormula"("lineageId");

-- CreateIndex
CREATE INDEX "CellFormula_snapshotId_idx" ON "CellFormula"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "CellFormula_lineageId_snapshotId_cellRef_key" ON "CellFormula"("lineageId", "snapshotId", "cellRef");

-- AddForeignKey
ALTER TABLE "CellFormula" ADD CONSTRAINT "CellFormula_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CellFormula" ADD CONSTRAINT "CellFormula_lineageId_fkey" FOREIGN KEY ("lineageId") REFERENCES "TaskLineage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CellFormula" ADD CONSTRAINT "CellFormula_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
