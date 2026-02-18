-- AlterTable: Add Parquet cache fields to Database for analysis queries
ALTER TABLE "Database" ADD COLUMN "parquetBlobKey" TEXT;
ALTER TABLE "Database" ADD COLUMN "parquetBlobUrl" TEXT;
ALTER TABLE "Database" ADD COLUMN "parquetRowCount" INTEGER;
ALTER TABLE "Database" ADD COLUMN "parquetGeneratedAt" TIMESTAMP(3);
ALTER TABLE "Database" ADD COLUMN "parquetStatus" TEXT;
ALTER TABLE "Database" ADD COLUMN "parquetError" TEXT;
ALTER TABLE "Database" ADD COLUMN "analysisSchemaSnapshot" JSONB;
ALTER TABLE "Database" ADD COLUMN "analysisSummaryStats" JSONB;
ALTER TABLE "Database" ADD COLUMN "analysisTableName" TEXT;

-- AlterTable: Rename datasetIds to databaseIds on AnalysisConversation
ALTER TABLE "AnalysisConversation" RENAME COLUMN "datasetIds" TO "databaseIds";
