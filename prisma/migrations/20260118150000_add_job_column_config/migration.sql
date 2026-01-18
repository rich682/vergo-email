-- Add notes and customFields to Job model
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "customFields" JSONB;

-- Create JobColumnConfig table for Monday.com-style configurable columns
CREATE TABLE IF NOT EXISTS "JobColumnConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "boardId" TEXT,
    "columns" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobColumnConfig_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint for org + board combo
CREATE UNIQUE INDEX IF NOT EXISTS "JobColumnConfig_organizationId_boardId_key" ON "JobColumnConfig"("organizationId", "boardId");

-- Create index for organization lookups
CREATE INDEX IF NOT EXISTS "JobColumnConfig_organizationId_idx" ON "JobColumnConfig"("organizationId");
