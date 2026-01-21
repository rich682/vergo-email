-- Add supportingDocuments field for anchored reconciliation model
-- This enables 1 anchor + N supporting documents (beyond the existing document2)
-- Backwards compatible: document1 = anchor, document2 = first supporting, this field = additional supporting docs

ALTER TABLE "Reconciliation" ADD COLUMN "supportingDocuments" JSONB;

-- Note: For existing reconciliations:
-- - document1 is treated as the ANCHOR (source of truth)
-- - document2 is treated as the FIRST supporting document
-- - supportingDocuments will be NULL (single supporting doc scenario)
