-- CreateEnum TaskType (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskType') THEN
        CREATE TYPE "TaskType" AS ENUM ('GENERIC', 'RECONCILIATION', 'TABLE');
    END IF;
END $$;

-- CreateTable
CREATE TABLE "TaskLineage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "TaskType" NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskLineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecipe" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskLineage_organizationId_idx" ON "TaskLineage"("organizationId");

-- CreateIndex
CREATE INDEX "ImportRecipe_organizationId_idx" ON "ImportRecipe"("organizationId");

-- CreateIndex
CREATE INDEX "ImportRecipe_lineageId_idx" ON "ImportRecipe"("lineageId");

-- AddForeignKey
ALTER TABLE "TaskLineage" ADD CONSTRAINT "TaskLineage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecipe" ADD CONSTRAINT "ImportRecipe_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecipe" ADD CONSTRAINT "ImportRecipe_lineageId_fkey" FOREIGN KEY ("lineageId") REFERENCES "TaskLineage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add type column to Job table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Job' AND column_name = 'type'
    ) THEN
        ALTER TABLE "Job" ADD COLUMN "type" "TaskType" NOT NULL DEFAULT 'GENERIC';
    END IF;
END $$;

-- Add lineageId column to Job table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Job' AND column_name = 'lineageId'
    ) THEN
        ALTER TABLE "Job" ADD COLUMN "lineageId" TEXT;
    END IF;
END $$;

-- CreateIndex on Job.lineageId if not exists
CREATE INDEX IF NOT EXISTS "Job_lineageId_idx" ON "Job"("lineageId");

-- AddForeignKey for Job.lineageId (if column was just added)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'Job_lineageId_fkey'
    ) THEN
        ALTER TABLE "Job" ADD CONSTRAINT "Job_lineageId_fkey" 
        FOREIGN KEY ("lineageId") REFERENCES "TaskLineage"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
