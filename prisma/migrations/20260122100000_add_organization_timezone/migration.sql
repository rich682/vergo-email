-- Add timezone field to Organization for timezone-aware date formatting
ALTER TABLE "Organization" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
