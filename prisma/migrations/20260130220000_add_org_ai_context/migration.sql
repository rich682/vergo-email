-- Add aiContext to Organization for AI-powered report insights
-- Stores organization-specific context: industry, entity type, key metrics, terminology
ALTER TABLE "Organization" ADD COLUMN "aiContext" JSONB;
