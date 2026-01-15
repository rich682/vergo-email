-- Add features JSON field to Organization for account-level feature flags
ALTER TABLE "Organization" ADD COLUMN "features" JSONB;
