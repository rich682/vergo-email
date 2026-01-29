-- Add compareMode to ReportDefinition for variance analysis
-- Possible values: "none" (default), "mom" (month-over-month), "yoy" (year-over-year)

ALTER TABLE "ReportDefinition" ADD COLUMN "compareMode" TEXT NOT NULL DEFAULT 'none';
