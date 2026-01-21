-- Add structuredData column for TABLE task row data
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "structuredData" JSONB;

-- Add isSnapshot column for immutable historical records
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "isSnapshot" BOOLEAN NOT NULL DEFAULT false;
