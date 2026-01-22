-- CreateTable
CREATE TABLE "AppColumnDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "config" JSONB,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "AppColumnDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppColumnValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "rowIdentity" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "AppColumnValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppColumnDefinition_organizationId_idx" ON "AppColumnDefinition"("organizationId");

-- CreateIndex
CREATE INDEX "AppColumnDefinition_lineageId_idx" ON "AppColumnDefinition"("lineageId");

-- CreateIndex
CREATE UNIQUE INDEX "AppColumnDefinition_lineageId_key_key" ON "AppColumnDefinition"("lineageId", "key");

-- CreateIndex
CREATE INDEX "AppColumnValue_organizationId_idx" ON "AppColumnValue"("organizationId");

-- CreateIndex
CREATE INDEX "AppColumnValue_columnId_idx" ON "AppColumnValue"("columnId");

-- CreateIndex
CREATE UNIQUE INDEX "AppColumnValue_columnId_rowIdentity_key" ON "AppColumnValue"("columnId", "rowIdentity");

-- AddForeignKey
ALTER TABLE "AppColumnDefinition" ADD CONSTRAINT "AppColumnDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppColumnDefinition" ADD CONSTRAINT "AppColumnDefinition_lineageId_fkey" FOREIGN KEY ("lineageId") REFERENCES "TaskLineage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppColumnDefinition" ADD CONSTRAINT "AppColumnDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppColumnValue" ADD CONSTRAINT "AppColumnValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppColumnValue" ADD CONSTRAINT "AppColumnValue_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "AppColumnDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppColumnValue" ADD CONSTRAINT "AppColumnValue_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
