/**
 * Reconciliation Feature Constants
 * Defines limits and constraints for file uploads and processing
 */

export const RECONCILIATION_LIMITS = {
  // File size limits
  MAX_FILE_SIZE_MB: 10,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB

  // Row/column limits (for structured files only)
  MAX_ROWS_PER_SHEET: 50000,
  MAX_COLUMNS: 100,

  // Allowed file types - V1 now supports PDF and images
  ALLOWED_EXTENSIONS: [".xlsx", ".xls", ".csv", ".pdf", ".png", ".jpg", ".jpeg"],
  ALLOWED_MIME_TYPES: [
    // Excel/CSV (structured)
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv",
    // PDF (unstructured - signal extraction)
    "application/pdf",
    // Images (unstructured - vision model analysis)
    "image/png",
    "image/jpeg",
    "image/jpg"
  ],
  
  // File type categories for processing logic
  STRUCTURED_MIME_TYPES: [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv"
  ],
  PDF_MIME_TYPES: [
    "application/pdf"
  ],
  IMAGE_MIME_TYPES: [
    "image/png",
    "image/jpeg",
    "image/jpg"
  ]
}

// Human-readable constraint messages
export const RECONCILIATION_MESSAGES = {
  FILE_TOO_LARGE: `File size exceeds the maximum limit of ${RECONCILIATION_LIMITS.MAX_FILE_SIZE_MB}MB`,
  TOO_MANY_ROWS: `File exceeds the maximum limit of ${RECONCILIATION_LIMITS.MAX_ROWS_PER_SHEET.toLocaleString()} rows per sheet`,
  TOO_MANY_COLUMNS: `File exceeds the maximum limit of ${RECONCILIATION_LIMITS.MAX_COLUMNS} columns`,
  INVALID_FILE_TYPE: `Invalid file type. Allowed types: ${RECONCILIATION_LIMITS.ALLOWED_EXTENSIONS.join(", ")}`,
  MULTIPLE_SHEETS: "Excel file contains multiple sheets. Please upload a file with only one sheet for reconciliation."
}

// Document role options for anchor selection
export const ANCHOR_ROLE_OPTIONS = [
  { value: "general_ledger", label: "General Ledger" },
  { value: "trial_balance", label: "Trial Balance" },
  { value: "control_account", label: "Control Account" },
  { value: "ap_balance", label: "AP Balance" },
  { value: "ar_balance", label: "AR Balance" },
  { value: "bank_register", label: "Bank Register" },
  { value: "custom", label: "Other (specify)" }
]

// Supporting document role suggestions
export const SUPPORTING_ROLE_SUGGESTIONS = [
  "Bank Statement",
  "Credit Card Statement",
  "Payroll Register",
  "Invoice Summary",
  "Vendor Statement",
  "Tax Return",
  "Audit Confirmation",
  "Other"
]

// Helper functions
export function isStructuredFile(mimeType: string): boolean {
  return RECONCILIATION_LIMITS.STRUCTURED_MIME_TYPES.some(t => 
    mimeType.toLowerCase().includes(t.toLowerCase().split("/")[1])
  )
}

export function isPdfFile(mimeType: string): boolean {
  return mimeType.toLowerCase().includes("pdf")
}

export function isImageFile(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/")
}

export function getFileCategory(mimeType: string): "structured" | "pdf" | "image" | "unknown" {
  if (isStructuredFile(mimeType)) return "structured"
  if (isPdfFile(mimeType)) return "pdf"
  if (isImageFile(mimeType)) return "image"
  return "unknown"
}
