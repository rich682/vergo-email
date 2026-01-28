-- Add cadence and dateColumnKey to ReportDefinition
-- These fields are required for period-aware reports

-- Add cadence column (required: daily/monthly/quarterly/annual)
ALTER TABLE "ReportDefinition" ADD COLUMN "cadence" TEXT NOT NULL DEFAULT 'monthly';

-- Add dateColumnKey column (required: which database column contains date data)
ALTER TABLE "ReportDefinition" ADD COLUMN "dateColumnKey" TEXT NOT NULL DEFAULT '';

-- Remove defaults after migration (they should be explicitly set on creation)
-- Note: We keep the defaults for any existing rows that may have been created
