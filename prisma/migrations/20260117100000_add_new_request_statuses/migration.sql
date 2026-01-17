-- Add new TaskStatus enum values: NO_REPLY and COMPLETE
-- These are added to support the simplified status model

ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'NO_REPLY';
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'COMPLETE';

-- Note: REPLIED already exists in the enum, so we don't need to add it

-- Update existing tasks:
-- IN_PROGRESS -> NO_REPLY (for requests awaiting response)
-- FULFILLED -> COMPLETE (will be handled by the app, not changing existing data)
-- The app code will map legacy statuses to new display values
