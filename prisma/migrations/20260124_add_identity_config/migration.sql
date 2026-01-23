-- Add identity configuration field to DatasetTemplate
-- This supports both row-based and column-based identity orientations

-- Step 1: Add the identity column (nullable initially)
ALTER TABLE "DatasetTemplate" ADD COLUMN "identity" JSONB;

-- Step 2: Backfill existing data from identityKey to identity
UPDATE "DatasetTemplate"
SET "identity" = jsonb_build_object(
  'orientation', 'row',
  'rowKey', "identityKey"
)
WHERE "identity" IS NULL AND "identityKey" IS NOT NULL;

-- Note: identityKey column is kept for backwards compatibility
-- It will be removed in a future migration after all code is updated
