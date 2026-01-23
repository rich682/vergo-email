-- CreateTable
CREATE TABLE "AppRowDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "rowType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "formula" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "AppRowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppRowValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "columnKey" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "AppRowValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppRowDefinition_organizationId_idx" ON "AppRowDefinition"("organizationId");

-- CreateIndex
CREATE INDEX "AppRowDefinition_lineageId_idx" ON "AppRowDefinition"("lineageId");

-- CreateIndex
CREATE UNIQUE INDEX "AppRowValue_rowId_columnKey_key" ON "AppRowValue"("rowId", "columnKey");

-- CreateIndex
CREATE INDEX "AppRowValue_organizationId_idx" ON "AppRowValue"("organizationId");

-- CreateIndex
CREATE INDEX "AppRowValue_rowId_idx" ON "AppRowValue"("rowId");

-- AddForeignKey
ALTER TABLE "AppRowDefinition" ADD CONSTRAINT "AppRowDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRowDefinition" ADD CONSTRAINT "AppRowDefinition_lineageId_fkey" FOREIGN KEY ("lineageId") REFERENCES "TaskLineage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRowDefinition" ADD CONSTRAINT "AppRowDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRowValue" ADD CONSTRAINT "AppRowValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRowValue" ADD CONSTRAINT "AppRowValue_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "AppRowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRowValue" ADD CONSTRAINT "AppRowValue_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
