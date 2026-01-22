-- Period-aware scheduling and draft request fields for recurring request drafts
-- All fields are nullable/optional for backward compatibility

-- Period-aware scheduling fields
ALTER TABLE "Task" ADD COLUMN "scheduleConfig" JSONB;
ALTER TABLE "Task" ADD COLUMN "scheduledSendAt" TIMESTAMP(3);

-- Draft request fields (copy-on-write pattern)
ALTER TABLE "Task" ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "draftSourceRequestId" TEXT;
ALTER TABLE "Task" ADD COLUMN "draftEditedSubject" TEXT;
ALTER TABLE "Task" ADD COLUMN "draftEditedBody" TEXT;
ALTER TABLE "Task" ADD COLUMN "draftEditedHtmlBody" TEXT;

-- Indices for efficient querying
CREATE INDEX "Task_organizationId_isDraft_idx" ON "Task"("organizationId", "isDraft");
CREATE INDEX "Task_draftSourceRequestId_idx" ON "Task"("draftSourceRequestId");
