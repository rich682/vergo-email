-- AlterTable: Add reminder configuration fields to Task
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "remindersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "remindersStartDelayHours" INTEGER,
ADD COLUMN IF NOT EXISTS "remindersFrequencyHours" INTEGER,
ADD COLUMN IF NOT EXISTS "remindersMaxCount" INTEGER,
ADD COLUMN IF NOT EXISTS "remindersApproved" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: ReminderState
CREATE TABLE IF NOT EXISTS "ReminderState" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reminderNumber" INTEGER NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "stoppedReason" TEXT,
    "scheduledEventId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReminderState_taskId_entityId_key" ON "ReminderState"("taskId", "entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReminderState_taskId_idx" ON "ReminderState"("taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReminderState_entityId_idx" ON "ReminderState"("entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReminderState_organizationId_nextSendAt_idx" ON "ReminderState"("organizationId", "nextSendAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReminderState_scheduledEventId_key" ON "ReminderState"("scheduledEventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReminderState_scheduledEventId_idx" ON "ReminderState"("scheduledEventId");

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'ReminderState_taskId_fkey'
    ) THEN
        ALTER TABLE "ReminderState" ADD CONSTRAINT "ReminderState_taskId_fkey" 
        FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'ReminderState_entityId_fkey'
    ) THEN
        ALTER TABLE "ReminderState" ADD CONSTRAINT "ReminderState_entityId_fkey" 
        FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
