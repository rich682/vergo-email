/**
 * Reconciliation Feature Constants
 * Defines limits and constraints for file uploads and processing
 */

export const RECONCILIATION_LIMITS = {
  // File size limits
  MAX_FILE_SIZE_MB: 10,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB

  // Row/column limits
  MAX_ROWS_PER_SHEET: 50000,
  MAX_COLUMNS: 100,

  // Allowed file types
  ALLOWED_EXTENSIONS: [".xlsx", ".xls", ".csv"],
  ALLOWED_MIME_TYPES: [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv"
  ]
}

// Human-readable constraint messages
export const RECONCILIATION_MESSAGES = {
  FILE_TOO_LARGE: `File size exceeds the maximum limit of ${RECONCILIATION_LIMITS.MAX_FILE_SIZE_MB}MB`,
  TOO_MANY_ROWS: `File exceeds the maximum limit of ${RECONCILIATION_LIMITS.MAX_ROWS_PER_SHEET.toLocaleString()} rows per sheet`,
  TOO_MANY_COLUMNS: `File exceeds the maximum limit of ${RECONCILIATION_LIMITS.MAX_COLUMNS} columns`,
  INVALID_FILE_TYPE: `Invalid file type. Allowed types: ${RECONCILIATION_LIMITS.ALLOWED_EXTENSIONS.join(", ")}`,
  MULTIPLE_SHEETS: "File contains multiple sheets. Please upload a file with only one sheet for reconciliation."
}
