-- Create enums
CREATE TYPE "ContactType" AS ENUM ('UNKNOWN', 'EMPLOYEE', 'VENDOR', 'CLIENT', 'CONTRACTOR', 'MANAGEMENT', 'CUSTOM');
CREATE TYPE "ContactStateSource" AS ENUM ('CSV_UPLOAD', 'MANUAL', 'FUTURE_AUTOMATION');

-- Alter Entity to add contactType fields
ALTER TABLE "Entity"
ADD COLUMN "contactType" "ContactType" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "contactTypeCustomLabel" TEXT;

-- Create ContactState table (one row per entity/stateKey snapshot)
CREATE TABLE "ContactState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "stateKey" TEXT NOT NULL,
    "metadata" JSONB,
    "source" "ContactStateSource" NOT NULL DEFAULT 'CSV_UPLOAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactState_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContactState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContactState_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Uniqueness: one row per entity/stateKey
CREATE UNIQUE INDEX "ContactState_organizationId_entityId_stateKey_key" ON "ContactState"("organizationId", "entityId", "stateKey");
CREATE INDEX "ContactState_organizationId_stateKey_idx" ON "ContactState"("organizationId", "stateKey");
CREATE INDEX "ContactState_entityId_idx" ON "ContactState"("entityId");

