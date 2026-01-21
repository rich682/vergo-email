-- Add V1 fields to Reconciliation model for PDF/image support and enhanced AI output

-- Document MIME types for mixed format handling
ALTER TABLE "Reconciliation" ADD COLUMN "document1MimeType" TEXT;
ALTER TABLE "Reconciliation" ADD COLUMN "document2MimeType" TEXT;

-- Accounting context
ALTER TABLE "Reconciliation" ADD COLUMN "anchorRole" TEXT;
ALTER TABLE "Reconciliation" ADD COLUMN "boardPeriodName" TEXT;

-- V1 Enhanced AI output
ALTER TABLE "Reconciliation" ADD COLUMN "confidenceScore" INTEGER;
ALTER TABLE "Reconciliation" ADD COLUMN "keyFindings" JSONB;
ALTER TABLE "Reconciliation" ADD COLUMN "suggestedNextSteps" JSONB;

-- Recurring template reference
ALTER TABLE "Reconciliation" ADD COLUMN "templateId" TEXT;

-- Create ReconciliationTemplate table for recurring reconciliations
CREATE TABLE "ReconciliationTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "anchorRole" TEXT NOT NULL,
    "supportingRoles" JSONB NOT NULL,
    "defaultIntent" TEXT,
    "priorExplanation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationTemplate_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on organization + name
CREATE UNIQUE INDEX "ReconciliationTemplate_organizationId_name_key" ON "ReconciliationTemplate"("organizationId", "name");

-- Create index on organizationId
CREATE INDEX "ReconciliationTemplate_organizationId_idx" ON "ReconciliationTemplate"("organizationId");

-- Create index on templateId in Reconciliation
CREATE INDEX "Reconciliation_templateId_idx" ON "Reconciliation"("templateId");

-- Add foreign key from Reconciliation to ReconciliationTemplate
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReconciliationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add foreign key from ReconciliationTemplate to Organization
ALTER TABLE "ReconciliationTemplate" ADD CONSTRAINT "ReconciliationTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
