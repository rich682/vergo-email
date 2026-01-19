-- CreateTable
CREATE TABLE "AIRecommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "campaignType" "CampaignType",
    "recommendedAction" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "summaryBullets" JSONB,
    "findings" JSONB,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "promptVersion" TEXT NOT NULL DEFAULT 'v1',
    "humanAction" TEXT,
    "agreedWithAI" BOOLEAN,
    "humanActedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIRecommendation_organizationId_createdAt_idx" ON "AIRecommendation"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIRecommendation_messageId_idx" ON "AIRecommendation"("messageId");

-- CreateIndex
CREATE INDEX "AIRecommendation_organizationId_campaignType_agreedWithAI_idx" ON "AIRecommendation"("organizationId", "campaignType", "agreedWithAI");

-- AddForeignKey
ALTER TABLE "AIRecommendation" ADD CONSTRAINT "AIRecommendation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRecommendation" ADD CONSTRAINT "AIRecommendation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
