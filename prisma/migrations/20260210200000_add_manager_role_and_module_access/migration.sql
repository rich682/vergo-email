-- AlterEnum: Add MANAGER to UserRole
ALTER TYPE "UserRole" ADD VALUE 'MANAGER';

-- AlterTable: Add moduleAccess JSON field to User
ALTER TABLE "User" ADD COLUMN "moduleAccess" JSONB;
