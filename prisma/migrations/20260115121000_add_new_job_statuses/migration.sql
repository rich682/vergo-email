-- Add new job status enum values
-- These are action-oriented statuses: NOT_STARTED, IN_PROGRESS, COMPLETE, BLOCKED
-- The old values (ACTIVE, WAITING, COMPLETED, ARCHIVED) are kept for backwards compatibility

ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'NOT_STARTED';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'COMPLETE';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
