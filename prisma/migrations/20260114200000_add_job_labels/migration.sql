-- CreateTable
CREATE TABLE "JobLabel" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "metadataSchema" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobContactLabel" (
    "id" TEXT NOT NULL,
    "jobLabelId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobContactLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobLabel_jobId_idx" ON "JobLabel"("jobId");

-- CreateIndex
CREATE INDEX "JobLabel_organizationId_idx" ON "JobLabel"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "JobLabel_jobId_name_key" ON "JobLabel"("jobId", "name");

-- CreateIndex
CREATE INDEX "JobContactLabel_jobLabelId_idx" ON "JobContactLabel"("jobLabelId");

-- CreateIndex
CREATE INDEX "JobContactLabel_entityId_idx" ON "JobContactLabel"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "JobContactLabel_jobLabelId_entityId_key" ON "JobContactLabel"("jobLabelId", "entityId");

-- AddForeignKey
ALTER TABLE "JobLabel" ADD CONSTRAINT "JobLabel_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContactLabel" ADD CONSTRAINT "JobContactLabel_jobLabelId_fkey" FOREIGN KEY ("jobLabelId") REFERENCES "JobLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContactLabel" ADD CONSTRAINT "JobContactLabel_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
