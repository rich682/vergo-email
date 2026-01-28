-- CreateTable: Database model for structured data storage
-- This is the core model for the Databases feature

CREATE TABLE "Database" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "identifierKey" TEXT NOT NULL,
    "rows" JSONB NOT NULL DEFAULT '[]',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "lastImportedAt" TIMESTAMP(3),
    "lastImportedById" TEXT,

    CONSTRAINT "Database_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Database_organizationId_idx" ON "Database"("organizationId");

-- CreateIndex
CREATE INDEX "Database_organizationId_name_idx" ON "Database"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "Database" ADD CONSTRAINT "Database_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Database" ADD CONSTRAINT "Database_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Database" ADD CONSTRAINT "Database_lastImportedById_fkey" FOREIGN KEY ("lastImportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
