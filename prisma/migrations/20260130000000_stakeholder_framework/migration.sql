-- Add isInternal field to Entity for internal/external classification
ALTER TABLE "Entity" ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: Set isInternal = true for EMPLOYEE and MANAGEMENT contact types
UPDATE "Entity" SET "isInternal" = true WHERE "contactType" IN ('EMPLOYEE', 'MANAGEMENT');

-- Add index for efficient filtering by organization and internal status
CREATE INDEX "Entity_organizationId_isInternal_idx" ON "Entity"("organizationId", "isInternal");

-- Add stakeholderScope to TaskInstance (Job table) for task type categorization
ALTER TABLE "Job" ADD COLUMN "stakeholderScope" TEXT;
