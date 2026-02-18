-- AlterTable: Add chart configuration to AnalysisMessage for visualization support
ALTER TABLE "AnalysisMessage" ADD COLUMN "chartConfig" JSONB;
