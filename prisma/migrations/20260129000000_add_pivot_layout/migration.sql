-- Add pivot layout support to ReportDefinition
-- Layout can be "standard" (current behavior) or "pivot" (matrix/transposed view)

-- Add layout column with default "standard"
ALTER TABLE "ReportDefinition" ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'standard';

-- Add pivotColumnKey for pivot layout (nullable - only used when layout='pivot')
ALTER TABLE "ReportDefinition" ADD COLUMN "pivotColumnKey" TEXT;

-- Add metricRows for pivot layout (JSON array of metric row definitions)
ALTER TABLE "ReportDefinition" ADD COLUMN "metricRows" JSONB NOT NULL DEFAULT '[]';
