-- AlterTable: Convert identifierKey (String) to identifierKeys (Json array)
-- This migration converts the single identifier column to support composite keys

-- Step 1: Add new column
ALTER TABLE "Database" ADD COLUMN "identifierKeys" JSONB;

-- Step 2: Migrate existing data - convert single string to array
UPDATE "Database" SET "identifierKeys" = jsonb_build_array("identifierKey");

-- Step 3: Make the new column required
ALTER TABLE "Database" ALTER COLUMN "identifierKeys" SET NOT NULL;

-- Step 4: Drop the old column
ALTER TABLE "Database" DROP COLUMN "identifierKey";
