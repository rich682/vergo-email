-- AlterTable: Add createdById to ReconciliationConfig
ALTER TABLE "ReconciliationConfig" ADD COLUMN "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "ReconciliationConfig" ADD CONSTRAINT "ReconciliationConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "FormDefinitionViewer" (
    "id" TEXT NOT NULL,
    "formDefinitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,

    CONSTRAINT "FormDefinitionViewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormDefinitionViewer_userId_idx" ON "FormDefinitionViewer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FormDefinitionViewer_formDefinitionId_userId_key" ON "FormDefinitionViewer"("formDefinitionId", "userId");

-- AddForeignKey
ALTER TABLE "FormDefinitionViewer" ADD CONSTRAINT "FormDefinitionViewer_formDefinitionId_fkey" FOREIGN KEY ("formDefinitionId") REFERENCES "FormDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDefinitionViewer" ADD CONSTRAINT "FormDefinitionViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ReconciliationConfigViewer" (
    "id" TEXT NOT NULL,
    "reconciliationConfigId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,

    CONSTRAINT "ReconciliationConfigViewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationConfigViewer_userId_idx" ON "ReconciliationConfigViewer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationConfigViewer_reconciliationConfigId_userId_key" ON "ReconciliationConfigViewer"("reconciliationConfigId", "userId");

-- AddForeignKey
ALTER TABLE "ReconciliationConfigViewer" ADD CONSTRAINT "ReconciliationConfigViewer_reconciliationConfigId_fkey" FOREIGN KEY ("reconciliationConfigId") REFERENCES "ReconciliationConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationConfigViewer" ADD CONSTRAINT "ReconciliationConfigViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DatabaseViewer" (
    "id" TEXT NOT NULL,
    "databaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,

    CONSTRAINT "DatabaseViewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DatabaseViewer_userId_idx" ON "DatabaseViewer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DatabaseViewer_databaseId_userId_key" ON "DatabaseViewer"("databaseId", "userId");

-- AddForeignKey
ALTER TABLE "DatabaseViewer" ADD CONSTRAINT "DatabaseViewer_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "Database"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseViewer" ADD CONSTRAINT "DatabaseViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
