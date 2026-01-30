-- Remove ReportSlice feature (replaced by direct filters workflow)
-- Note: TaskInstance model is mapped to "Job" table in database

-- First drop foreign key constraints
ALTER TABLE "Job" DROP CONSTRAINT IF EXISTS "Job_reportSliceId_fkey";
ALTER TABLE "GeneratedReport" DROP CONSTRAINT IF EXISTS "GeneratedReport_reportSliceId_fkey";

-- Remove columns referencing ReportSlice
ALTER TABLE "Job" DROP COLUMN IF EXISTS "reportSliceId";
ALTER TABLE "GeneratedReport" DROP COLUMN IF EXISTS "reportSliceId";

-- Drop the ReportSlice table
DROP TABLE IF EXISTS "ReportSlice";
