-- Add filterColumnKeys to ReportDefinition for user-defined filterable columns
-- This replaces auto-detection with explicit column selection
ALTER TABLE "ReportDefinition" ADD COLUMN "filterColumnKeys" JSONB DEFAULT '[]';
