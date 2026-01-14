-- DropForeignKey
ALTER TABLE "ContactState" DROP CONSTRAINT IF EXISTS "ContactState_entityId_fkey";

-- DropForeignKey
ALTER TABLE "ContactState" DROP CONSTRAINT IF EXISTS "ContactState_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ContactState" DROP CONSTRAINT IF EXISTS "ContactState_tagId_fkey";

-- DropForeignKey
ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_organizationId_fkey";

-- DropTable
DROP TABLE IF EXISTS "ContactState";

-- DropTable
DROP TABLE IF EXISTS "Tag";

-- DropEnum
DROP TYPE IF EXISTS "ContactStateSource";
