-- Add reportFilterBindings to TaskInstance for dynamic report filtering
-- This allows users to filter reports by combining property values without pre-creating slices
ALTER TABLE "TaskInstance" ADD COLUMN "reportFilterBindings" JSONB;
