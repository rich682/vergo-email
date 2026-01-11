-- AlterTable
ALTER TABLE "EmailDraft" ADD COLUMN IF NOT EXISTS "subjectTemplate" TEXT,
ADD COLUMN IF NOT EXISTS "bodyTemplate" TEXT,
ADD COLUMN IF NOT EXISTS "htmlBodyTemplate" TEXT,
ADD COLUMN IF NOT EXISTS "availableTags" JSONB,
ADD COLUMN IF NOT EXISTS "personalizationMode" TEXT,
ADD COLUMN IF NOT EXISTS "blockOnMissingValues" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PersonalizationData" (
    "id" TEXT NOT NULL,
    "emailDraftId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "contactId" TEXT,
    "dataJson" JSONB NOT NULL,
    "renderSubject" TEXT,
    "renderBody" TEXT,
    "renderHtmlBody" TEXT,
    "renderStatus" TEXT,
    "renderErrors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizationData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PersonalizationData_emailDraftId_recipientEmail_key" ON "PersonalizationData"("emailDraftId", "recipientEmail");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PersonalizationData_emailDraftId_idx" ON "PersonalizationData"("emailDraftId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PersonalizationData_recipientEmail_idx" ON "PersonalizationData"("recipientEmail");

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'PersonalizationData_emailDraftId_fkey'
    ) THEN
        ALTER TABLE "PersonalizationData" ADD CONSTRAINT "PersonalizationData_emailDraftId_fkey" 
        FOREIGN KEY ("emailDraftId") REFERENCES "EmailDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Note: contactId is a string field, not a foreign key relation to Entity

