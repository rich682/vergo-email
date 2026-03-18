-- Add review hub tracking fields to ActivityEvent
ALTER TABLE "ActivityEvent" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "ActivityEvent" ADD COLUMN "reviewedById" TEXT;

-- Index for review hub: unreviewed status-change events per org
CREATE INDEX "ActivityEvent_organizationId_eventType_reviewedAt_createdAt_idx" ON "ActivityEvent"("organizationId", "eventType", "reviewedAt", "createdAt");
