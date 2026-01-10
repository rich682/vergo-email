/**
 * CSV Parser and Normalization Utilities
 * 
 * PRD: Personalized Requests with Data Tags
 * 
 * This module provides CSV parsing, header normalization, and validation for personalized requests.
 * Key features:
 * - Case-insensitive email column detection (email, recipient_email, recipientEmail)
 * - Header normalization (trim, lowercase, collapse spaces, underscore/hyphen equivalence)
 * - Duplicate detection (emails and normalized headers)
 * - Row/column limits (5,000 rows, 100 columns)
 * - Tag name extraction from CSV columns
 * 
 * The parser ensures deterministic behavior: same CSV always produces same normalized tags.
 */

export interface CSVParseResult {
  rows: Array<Record<string, string>>
  emailColumn: string
  tagColumns: string[] // Original column names that become tags
  normalizedTagMap: Record<string, string> // normalized -> original
  validation: {
    rowCount: number
    columnCount: number
    duplicateEmails: string[]
    missingValues: Record<string, number> // column -> count of missing values
  }
}

export interface CSVParseError {
  message: string
  code: 'NO_EMAIL_COLUMN' | 'DUPLICATE_EMAILS' | 'HEADER_COLLISION' | 'TOO_MANY_ROWS' | 'TOO_MANY_COLUMNS' | 'INVALID_CSV'
}

/**
 * Normalize a string for tag matching: trim, lowercase, collapse spaces, normalize underscore/hyphen
 * Used for consistent tag matching across CSV parsing and template rendering.
 */
export function normalizeTagName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') // Collapse multiple spaces to one
    .replace(/[_-]/g, '_') // Normalize underscore and hyphen to underscore
    .replace(/\s/g, '_') // Replace spaces with underscores
}

/**
 * Detect email column from headers (case-insensitive)
 */
function detectEmailColumn(headers: string[]): string | null {
  const emailPatterns = ['email', 'recipient_email', 'recipientemail']
  const normalizedHeaders = headers.map(h => normalizeTagName(h))
  
  for (const pattern of emailPatterns) {
    const index = normalizedHeaders.indexOf(normalizeTagName(pattern))
    if (index >= 0) {
      return headers[index] // Return original header name
    }
  }
  return null
}

/**
 * Parse CSV string and return structured data with validation
 */
export function parseCSV(csvContent: string, maxRows = 5000, maxColumns = 100): CSVParseResult | CSVParseError {
  try {
    const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length === 0) {
      return { message: 'CSV is empty', code: 'INVALID_CSV' }
    }

    // Parse headers
    const headers = parseCSVLine(lines[0])
    if (headers.length === 0) {
      return { message: 'CSV has no headers', code: 'INVALID_CSV' }
    }

    if (headers.length > maxColumns) {
      return { message: `CSV has ${headers.length} columns, maximum is ${maxColumns}`, code: 'TOO_MANY_COLUMNS' }
    }

    // Detect email column
    const emailColumn = detectEmailColumn(headers)
    if (!emailColumn) {
      return { message: 'CSV must have an email column (email, recipient_email, or recipientEmail)', code: 'NO_EMAIL_COLUMN' }
    }

    // Check for header collisions after normalization
    const normalizedHeaderMap = new Map<string, string>()
    for (const header of headers) {
      const normalized = normalizeTagName(header)
      if (normalizedHeaderMap.has(normalized) && normalizedHeaderMap.get(normalized) !== header) {
        return { 
          message: `Header collision: "${header}" and "${normalizedHeaderMap.get(normalized)}" normalize to the same tag name`, 
          code: 'HEADER_COLLISION' 
        }
      }
      normalizedHeaderMap.set(normalized, header)
    }

    // Parse data rows
    const rows: Array<Record<string, string>> = []
    const emailSet = new Set<string>()
    const duplicateEmails: string[] = []

    for (let i = 1; i < lines.length; i++) {
      if (i > maxRows) {
        return { message: `CSV has more than ${maxRows} rows`, code: 'TOO_MANY_ROWS' }
      }

      const values = parseCSVLine(lines[i])
      if (values.length !== headers.length) {
        // Skip malformed rows but continue processing
        continue
      }

      const row: Record<string, string> = {}
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j]?.trim() || ''
      }

      const email = row[emailColumn]?.toLowerCase().trim()
      if (email) {
        if (emailSet.has(email)) {
          duplicateEmails.push(email)
        } else {
          emailSet.add(email)
        }
      }

      rows.push(row)
    }

    if (duplicateEmails.length > 0) {
      return { message: `Duplicate emails found: ${duplicateEmails.slice(0, 5).join(', ')}${duplicateEmails.length > 5 ? '...' : ''}`, code: 'DUPLICATE_EMAILS' }
    }

    // Get tag columns (all except email)
    const tagColumns = headers.filter(h => h !== emailColumn)
    
    // Build normalized tag map (normalized -> original)
    const normalizedTagMap: Record<string, string> = {}
    for (const tag of tagColumns) {
      const normalized = normalizeTagName(tag)
      normalizedTagMap[normalized] = tag
    }

    // Count missing values per column
    const missingValues: Record<string, number> = {}
    for (const column of headers) {
      if (column === emailColumn) continue
      let missing = 0
      for (const row of rows) {
        if (!row[column] || row[column].trim().length === 0) {
          missing++
        }
      }
      if (missing > 0) {
        missingValues[column] = missing
      }
    }

    return {
      rows,
      emailColumn,
      tagColumns,
      normalizedTagMap,
      validation: {
        rowCount: rows.length,
        columnCount: headers.length,
        duplicateEmails: [],
        missingValues
      }
    }
  } catch (error: any) {
    return { message: `Failed to parse CSV: ${error.message}`, code: 'INVALID_CSV' }
  }
}

/**
 * Simple CSV line parser (handles quoted fields)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  // Add last field
  result.push(current)
  return result
}

