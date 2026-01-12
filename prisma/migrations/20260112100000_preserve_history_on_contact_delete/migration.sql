-- Make entityId optional on Task, Message, and ReminderState
-- This allows contacts to be deleted without losing request/message history

-- Task: make entityId optional and change cascade to SetNull
ALTER TABLE "Task" ALTER COLUMN "entityId" DROP NOT NULL;
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_entityId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_entityId_fkey" 
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Message: make entityId optional and change cascade to SetNull
ALTER TABLE "Message" ALTER COLUMN "entityId" DROP NOT NULL;
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_entityId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_entityId_fkey" 
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ReminderState: make entityId optional and change cascade to SetNull
ALTER TABLE "ReminderState" ALTER COLUMN "entityId" DROP NOT NULL;
ALTER TABLE "ReminderState" DROP CONSTRAINT IF EXISTS "ReminderState_entityId_fkey";
ALTER TABLE "ReminderState" ADD CONSTRAINT "ReminderState_entityId_fkey" 
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
