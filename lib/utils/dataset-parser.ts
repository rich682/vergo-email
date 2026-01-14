/**
 * Dataset Parser Utility
 * 
 * Parses CSV/XLSX data into structured dataset format for Data Personalization requests.
 * Handles:
 * - Email column auto-detection
 * - Column type inference (text, number, date, boolean, currency)
 * - Key normalization (snake_case)
 * - Email validation
 * - Duplicate detection
 */

// ============================================
// Types
// ============================================

export interface DatasetColumn {
  key: string      // snake_case normalized key
  label: string    // Original header label
  type: "text" | "number" | "date" | "boolean" | "currency"
}

export interface DatasetRow {
  email: string
  values: Record<string, string>
  valid: boolean
  validationErrors?: string[]
}

export interface DatasetValidation {
  totalRows: number
  validEmails: number
  invalidEmails: string[]
  duplicates: string[]
}

export interface DatasetParseResult {
  columns: DatasetColumn[]
  rows: DatasetRow[]
  emailColumn: string
  emailColumnKey: string
  validation: DatasetValidation
}

export interface DatasetParseError {
  message: string
  code: "NO_EMAIL_COLUMN" | "EMPTY_DATASET" | "TOO_MANY_ROWS" | "TOO_MANY_COLUMNS" | "NO_HEADERS"
}

// ============================================
// Constants
// ============================================

const MAX_ROWS = 5000
const MAX_COLUMNS = 100

// Email patterns for column detection
const EMAIL_HEADER_PATTERNS = [
  "email",
  "e-mail",
  "email_address",
  "emailaddress",
  "recipient_email",
  "recipientemail",
  "contact_email",
  "contactemail",
  "mail"
]

// Basic email regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Date patterns for type inference
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,                    // 2024-01-15
  /^\d{2}\/\d{2}\/\d{4}$/,                  // 01/15/2024
  /^\d{2}-\d{2}-\d{4}$/,                    // 01-15-2024
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,            // 1/15/24 or 1/15/2024
  /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/,    // January 15, 2024
]

// Currency patterns
const CURRENCY_REGEX = /^[$£€¥]?\s*-?\d{1,3}(,\d{3})*(\.\d{2})?$|^-?\d+(\.\d{2})?$/

// Boolean values
const BOOLEAN_VALUES = new Set([
  "true", "false", "yes", "no", "1", "0", "x", "y", "n"
])

// ============================================
// Key Normalization
// ============================================

/**
 * Normalize a column label to a snake_case key
 */
export function normalizeColumnKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "") // Remove special chars except space, underscore, hyphen
    .replace(/[\s-]+/g, "_")       // Replace spaces and hyphens with underscore
    .replace(/_+/g, "_")           // Collapse multiple underscores
    .replace(/^_|_$/g, "")         // Trim leading/trailing underscores
    || "column"                     // Fallback if empty
}

/**
 * Generate unique keys for columns, handling duplicates
 */
function generateUniqueKeys(labels: string[]): Map<string, string> {
  const keyMap = new Map<string, string>()
  const usedKeys = new Set<string>()
  
  for (const label of labels) {
    let baseKey = normalizeColumnKey(label)
    let key = baseKey
    let counter = 1
    
    while (usedKeys.has(key)) {
      key = `${baseKey}_${counter}`
      counter++
    }
    
    usedKeys.add(key)
    keyMap.set(label, key)
  }
  
  return keyMap
}

// ============================================
// Email Detection
// ============================================

/**
 * Check if a value looks like an email address
 */
export function isValidEmail(value: string): boolean {
  if (!value || typeof value !== "string") return false
  return EMAIL_REGEX.test(value.trim().toLowerCase())
}

/**
 * Detect which column contains email addresses
 * Priority: 1) Header name match, 2) Content analysis
 */
export function detectEmailColumn(
  headers: string[],
  sampleRows: string[][]
): string | null {
  // First, check header names
  for (const header of headers) {
    const normalizedHeader = normalizeColumnKey(header)
    if (EMAIL_HEADER_PATTERNS.includes(normalizedHeader)) {
      return header
    }
  }
  
  // If no header match, analyze content
  const emailScores = new Map<string, number>()
  
  for (let colIndex = 0; colIndex < headers.length; colIndex++) {
    const header = headers[colIndex]
    let emailCount = 0
    let totalNonEmpty = 0
    
    for (const row of sampleRows.slice(0, 20)) {
      const value = row[colIndex]
      if (value && value.trim()) {
        totalNonEmpty++
        if (isValidEmail(value)) {
          emailCount++
        }
      }
    }
    
    // If >80% of non-empty values are emails, consider it an email column
    if (totalNonEmpty > 0 && emailCount / totalNonEmpty > 0.8) {
      emailScores.set(header, emailCount / totalNonEmpty)
    }
  }
  
  // Return the column with highest email score
  if (emailScores.size > 0) {
    let bestHeader: string | null = null
    let bestScore = 0
    
    for (const [header, score] of emailScores) {
      if (score > bestScore) {
        bestScore = score
        bestHeader = header
      }
    }
    
    return bestHeader
  }
  
  return null
}

// ============================================
// Type Inference
// ============================================

/**
 * Check if a value matches date patterns
 */
function isDateValue(value: string): boolean {
  if (!value || value.trim() === "") return false
  const trimmed = value.trim()
  return DATE_PATTERNS.some(pattern => pattern.test(trimmed))
}

/**
 * Check if a value looks like currency
 * Must have currency symbol OR decimal places to be considered currency
 */
function isCurrencyValue(value: string): boolean {
  if (!value || value.trim() === "") return false
  const trimmed = value.trim()
  // Must have currency symbol OR have exactly 2 decimal places to be currency
  const hasCurrencySymbol = /^[$£€¥]/.test(trimmed)
  const hasDecimalPlaces = /\.\d{2}$/.test(trimmed)
  if (!hasCurrencySymbol && !hasDecimalPlaces) return false
  return CURRENCY_REGEX.test(trimmed)
}

/**
 * Check if a value is numeric (not currency)
 */
function isNumericValue(value: string): boolean {
  if (!value || value.trim() === "") return false
  const trimmed = value.trim()
  // Exclude currency symbols
  if (/^[$£€¥]/.test(trimmed)) return false
  return !isNaN(parseFloat(trimmed)) && isFinite(Number(trimmed))
}

/**
 * Check if a value is boolean-like
 */
function isBooleanValue(value: string): boolean {
  if (!value || value.trim() === "") return false
  return BOOLEAN_VALUES.has(value.trim().toLowerCase())
}

/**
 * Infer column type from sample values
 */
export function inferColumnType(values: string[]): DatasetColumn["type"] {
  const nonEmptyValues = values.filter(v => v && v.trim() !== "")
  
  if (nonEmptyValues.length === 0) {
    return "text"
  }
  
  // Count matches for each type
  let dateCount = 0
  let currencyCount = 0
  let numberCount = 0
  let booleanCount = 0
  
  for (const value of nonEmptyValues) {
    if (isDateValue(value)) dateCount++
    else if (isCurrencyValue(value)) currencyCount++
    else if (isNumericValue(value)) numberCount++
    else if (isBooleanValue(value)) booleanCount++
  }
  
  const threshold = nonEmptyValues.length * 0.7 // 70% threshold
  
  // Priority: date > currency > number > boolean > text
  if (dateCount >= threshold) return "date"
  if (currencyCount >= threshold) return "currency"
  if (numberCount >= threshold) return "number"
  if (booleanCount >= threshold) return "boolean"
  
  return "text"
}

// ============================================
// Main Parser
// ============================================

/**
 * Parse raw spreadsheet rows into structured dataset
 * 
 * @param rawRows - 2D array of strings (first row is headers)
 * @param emailColumnOverride - Optional: force a specific column as email
 * @returns Parsed dataset or error
 */
export function parseDataset(
  rawRows: string[][],
  emailColumnOverride?: string
): DatasetParseResult | DatasetParseError {
  // Validate input
  if (!rawRows || rawRows.length === 0) {
    return { message: "Dataset is empty", code: "EMPTY_DATASET" }
  }
  
  // Extract headers (first row)
  const headers = rawRows[0].map(h => (h || "").toString().trim())
  
  if (headers.length === 0 || headers.every(h => !h)) {
    return { message: "No headers found in dataset", code: "NO_HEADERS" }
  }
  
  if (headers.length > MAX_COLUMNS) {
    return { 
      message: `Dataset has ${headers.length} columns, maximum is ${MAX_COLUMNS}`, 
      code: "TOO_MANY_COLUMNS" 
    }
  }
  
  // Get data rows (skip header)
  const dataRows = rawRows.slice(1).filter(row => 
    row.some(cell => cell && cell.toString().trim())
  )
  
  if (dataRows.length > MAX_ROWS) {
    return { 
      message: `Dataset has ${dataRows.length} rows, maximum is ${MAX_ROWS}`, 
      code: "TOO_MANY_ROWS" 
    }
  }
  
  // Detect or validate email column
  let emailColumn: string
  
  if (emailColumnOverride) {
    if (!headers.includes(emailColumnOverride)) {
      return { 
        message: `Specified email column "${emailColumnOverride}" not found in headers`, 
        code: "NO_EMAIL_COLUMN" 
      }
    }
    emailColumn = emailColumnOverride
  } else {
    const detected = detectEmailColumn(headers, dataRows)
    if (!detected) {
      return { 
        message: "Could not detect email column. Please specify which column contains email addresses.", 
        code: "NO_EMAIL_COLUMN" 
      }
    }
    emailColumn = detected
  }
  
  // Generate unique keys for columns
  const keyMap = generateUniqueKeys(headers)
  const emailColumnKey = keyMap.get(emailColumn)!
  
  // Infer column types
  const columns: DatasetColumn[] = []
  
  for (const header of headers) {
    if (header === emailColumn) continue // Skip email column in data columns
    
    const colIndex = headers.indexOf(header)
    const sampleValues = dataRows.slice(0, 50).map(row => 
      (row[colIndex] || "").toString()
    )
    
    columns.push({
      key: keyMap.get(header)!,
      label: header,
      type: inferColumnType(sampleValues)
    })
  }
  
  // Parse rows and validate emails
  const rows: DatasetRow[] = []
  const emailIndex = headers.indexOf(emailColumn)
  const seenEmails = new Map<string, number>() // email -> first occurrence index
  const invalidEmails: string[] = []
  const duplicates: string[] = []
  
  for (let i = 0; i < dataRows.length; i++) {
    const rawRow = dataRows[i]
    const rawEmail = (rawRow[emailIndex] || "").toString().trim().toLowerCase()
    
    // Build values object
    const values: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      if (j === emailIndex) continue
      const header = headers[j]
      const key = keyMap.get(header)!
      values[key] = (rawRow[j] || "").toString().trim()
    }
    
    // Validate email
    const validationErrors: string[] = []
    let valid = true
    
    if (!rawEmail) {
      validationErrors.push("Missing email address")
      valid = false
      invalidEmails.push(`Row ${i + 2}: empty`)
    } else if (!isValidEmail(rawEmail)) {
      validationErrors.push("Invalid email format")
      valid = false
      invalidEmails.push(rawEmail)
    } else if (seenEmails.has(rawEmail)) {
      // Duplicate - mark as invalid but track it
      duplicates.push(rawEmail)
      // Keep the later occurrence (will overwrite in final dedup)
    }
    
    seenEmails.set(rawEmail, i)
    
    rows.push({
      email: rawEmail,
      values,
      valid,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined
    })
  }
  
  // Deduplicate rows (keep last occurrence)
  const dedupedRows: DatasetRow[] = []
  const finalEmails = new Set<string>()
  
  // Process in reverse to keep last occurrence
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row.email && !finalEmails.has(row.email)) {
      finalEmails.add(row.email)
      dedupedRows.unshift(row)
    }
  }
  
  // Calculate validation summary
  const validEmails = dedupedRows.filter(r => r.valid).length
  
  return {
    columns,
    rows: dedupedRows,
    emailColumn,
    emailColumnKey,
    validation: {
      totalRows: dedupedRows.length,
      validEmails,
      invalidEmails: [...new Set(invalidEmails)],
      duplicates: [...new Set(duplicates)]
    }
  }
}

/**
 * Type guard to check if result is an error
 */
export function isDatasetParseError(
  result: DatasetParseResult | DatasetParseError
): result is DatasetParseError {
  return "code" in result && "message" in result
}
