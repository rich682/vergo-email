-- Add lastName column to Entity table
ALTER TABLE "Entity" ADD COLUMN "lastName" TEXT;

-- Migrate lastName data from ContactState to Entity
-- This moves any lastName stored as a tag back to the proper Entity field
UPDATE "Entity" e
SET "lastName" = cs."stateValue"
FROM "ContactState" cs
JOIN "Tag" t ON cs."tagId" = t."id"
WHERE cs."entityId" = e."id"
  AND t."name" = 'lastname'
  AND cs."stateValue" IS NOT NULL
  AND cs."stateValue" != '';

-- Delete the lastName tag and its ContactState entries
-- First delete ContactState entries
DELETE FROM "ContactState" cs
USING "Tag" t
WHERE cs."tagId" = t."id"
  AND t."name" = 'lastname';

-- Then delete the Tag itself
DELETE FROM "Tag" WHERE "name" = 'lastname';
