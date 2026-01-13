-- CreateTable: Tag model for managing personalization tags
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- Add new columns to ContactState
ALTER TABLE "ContactState" ADD COLUMN "tagId" TEXT;
ALTER TABLE "ContactState" ADD COLUMN "stateValue" TEXT;

-- Create index on Tag
CREATE INDEX "Tag_organizationId_idx" ON "Tag"("organizationId");

-- Create unique constraint on Tag (org + name)
CREATE UNIQUE INDEX "Tag_organizationId_name_key" ON "Tag"("organizationId", "name");

-- Create indexes on ContactState for new tagId column
CREATE INDEX "ContactState_organizationId_tagId_idx" ON "ContactState"("organizationId", "tagId");
CREATE INDEX "ContactState_tagId_idx" ON "ContactState"("tagId");

-- AddForeignKey: Tag -> Organization
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing ContactState data:
-- 1. Create Tag entries for each unique stateKey per organization
INSERT INTO "Tag" ("id", "name", "displayName", "organizationId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid()::text,
    cs."stateKey",
    cs."stateKey",
    cs."organizationId",
    NOW(),
    NOW()
FROM "ContactState" cs
GROUP BY cs."organizationId", cs."stateKey"
ON CONFLICT ("organizationId", "name") DO NOTHING;

-- 2. Update ContactState to reference the Tag
UPDATE "ContactState" cs
SET "tagId" = t."id"
FROM "Tag" t
WHERE cs."organizationId" = t."organizationId" 
  AND cs."stateKey" = t."name";

-- 3. Make tagId NOT NULL after migration (only if all rows have been updated)
-- Note: This will fail if there are ContactState rows without matching Tags
-- In that case, you may need to clean up orphaned data first
ALTER TABLE "ContactState" ALTER COLUMN "tagId" SET NOT NULL;

-- AddForeignKey: ContactState -> Tag
ALTER TABLE "ContactState" ADD CONSTRAINT "ContactState_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old unique constraint and create new one with tagId
ALTER TABLE "ContactState" DROP CONSTRAINT IF EXISTS "ContactState_organizationId_entityId_stateKey_key";
CREATE UNIQUE INDEX "ContactState_organizationId_entityId_tagId_key" ON "ContactState"("organizationId", "entityId", "tagId");
