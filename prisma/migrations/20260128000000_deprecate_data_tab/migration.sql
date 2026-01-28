-- Deprecate Data Tab and Formula Features
-- This migration removes all tables related to:
-- - Dataset Templates and Snapshots
-- - App Columns (custom columns for data grid)
-- - App Rows (custom rows for data grid)
-- - Cell Formulas

-- First, remove foreign key constraints from TaskLineage
ALTER TABLE "TaskLineage" DROP COLUMN IF EXISTS "datasetTemplateId";

-- Drop CellFormula table
DROP TABLE IF EXISTS "CellFormula";

-- Drop AppRowValue table (must drop before AppRowDefinition due to FK)
DROP TABLE IF EXISTS "AppRowValue";

-- Drop AppRowDefinition table
DROP TABLE IF EXISTS "AppRowDefinition";

-- Drop AppColumnValue table (must drop before AppColumnDefinition due to FK)
DROP TABLE IF EXISTS "AppColumnValue";

-- Drop AppColumnDefinition table
DROP TABLE IF EXISTS "AppColumnDefinition";

-- Drop DatasetSnapshot table (must drop before DatasetTemplate due to FK)
DROP TABLE IF EXISTS "DatasetSnapshot";

-- Drop DatasetTemplate table
DROP TABLE IF EXISTS "DatasetTemplate";
