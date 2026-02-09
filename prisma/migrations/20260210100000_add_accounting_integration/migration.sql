-- CreateTable
CREATE TABLE "AccountingIntegration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountToken" TEXT NOT NULL,
    "integrationName" TEXT,
    "integrationSlug" TEXT,
    "endUserEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "syncConfig" JSONB NOT NULL DEFAULT '{}',
    "syncState" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'idle',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingIntegration_organizationId_key" ON "AccountingIntegration"("organizationId");

-- CreateIndex
CREATE INDEX "AccountingIntegration_organizationId_idx" ON "AccountingIntegration"("organizationId");

-- CreateIndex
CREATE INDEX "AccountingIntegration_isActive_idx" ON "AccountingIntegration"("isActive");

-- AddForeignKey
ALTER TABLE "AccountingIntegration" ADD CONSTRAINT "AccountingIntegration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add mergeRemoteId to Entity
ALTER TABLE "Entity" ADD COLUMN "mergeRemoteId" TEXT;

-- CreateIndex
CREATE INDEX "Entity_organizationId_mergeRemoteId_idx" ON "Entity"("organizationId", "mergeRemoteId");

-- AlterTable: Add sourceType and isReadOnly to Database
ALTER TABLE "Database" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "Database" ADD COLUMN "isReadOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Database_organizationId_sourceType_idx" ON "Database"("organizationId", "sourceType");
