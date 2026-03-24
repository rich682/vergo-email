-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('FREE_TRIAL', 'TRIAL_ENDED', 'PAYING_CUSTOMER');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'FREE_TRIAL';
ALTER TABLE "Organization" ADD COLUMN "trialStartedAt" TIMESTAMP(3);

-- Backfill: set trialStartedAt to createdAt for all existing orgs
UPDATE "Organization" SET "trialStartedAt" = "createdAt";
