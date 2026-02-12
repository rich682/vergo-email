-- CreateTable
CREATE TABLE "ReportDefinitionViewer" (
    "id" TEXT NOT NULL,
    "reportDefinitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,

    CONSTRAINT "ReportDefinitionViewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportDefinitionViewer_userId_idx" ON "ReportDefinitionViewer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDefinitionViewer_reportDefinitionId_userId_key" ON "ReportDefinitionViewer"("reportDefinitionId", "userId");

-- AddForeignKey
ALTER TABLE "ReportDefinitionViewer" ADD CONSTRAINT "ReportDefinitionViewer_reportDefinitionId_fkey" FOREIGN KEY ("reportDefinitionId") REFERENCES "ReportDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDefinitionViewer" ADD CONSTRAINT "ReportDefinitionViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
