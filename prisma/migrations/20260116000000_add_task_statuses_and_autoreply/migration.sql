-- Add new TaskStatus values: IN_PROGRESS and ON_HOLD
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';

-- Add isAutoReply field to Message for filtering out OOO/bounce messages
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "isAutoReply" BOOLEAN NOT NULL DEFAULT false;

-- Add index for efficient auto-reply filtering
CREATE INDEX IF NOT EXISTS "Message_isAutoReply_idx" ON "Message"("isAutoReply");
