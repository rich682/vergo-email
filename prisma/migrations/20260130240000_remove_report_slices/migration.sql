-- Remove ReportSlice feature (replaced by direct filters workflow)

-- First drop foreign key constraints
ALTER TABLE "TaskInstance" DROP CONSTRAINT IF EXISTS "TaskInstance_reportSliceId_fkey";
ALTER TABLE "GeneratedReport" DROP CONSTRAINT IF EXISTS "GeneratedReport_reportSliceId_fkey";

-- Remove columns referencing ReportSlice
ALTER TABLE "TaskInstance" DROP COLUMN IF EXISTS "reportSliceId";
ALTER TABLE "GeneratedReport" DROP COLUMN IF EXISTS "reportSliceId";

-- Drop the ReportSlice table
DROP TABLE IF EXISTS "ReportSlice";
