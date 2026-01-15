-- Add auth token fields to User model for verification, password reset, and invites
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "verificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);

-- Add unique index on verificationToken
CREATE UNIQUE INDEX "User_verificationToken_key" ON "User"("verificationToken");

-- Add index for faster token lookups
CREATE INDEX "User_verificationToken_idx" ON "User"("verificationToken");

-- Set existing users as verified (they already have accounts)
UPDATE "User" SET "emailVerified" = true WHERE "passwordHash" != '';
