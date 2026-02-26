/**
 * Excel Utilities
 * 
 * Shared utilities for Excel file generation, parsing, and export.
 * Uses the xlsx (SheetJS) library consistently across all operations.
 */

import * as XLSX from "xlsx"
import { DatabaseSchema, DatabaseSchemaColumn, DatabaseRow } from "@/lib/services/database.service"
import { parseNumericValue } from "@/lib/utils/safe-expression"

// ============================================
// Types
// ============================================

export interface ExcelParseResult {
  headers: string[]
  rows: Array<Record<string, string | number | boolean | null>>
  rawRows: string[][]
}

// ============================================
// Template Generation
// ============================================

/**
 * Generate an Excel template for a database schema
 * 
 * Creates a workbook with:
 * - Sheet 1 "Data": Headers only, based on schema columns
 * - Sheet 2 "Instructions": Documentation about the schema
 */
export function generateSchemaTemplate(
  schema: DatabaseSchema,
  identifierKey: string,
  databaseName: string
): Buffer {
  const wb = XLSX.utils.book_new()
  
  // Sort columns by order
  const sortedColumns = [...schema.columns].sort((a, b) => a.order - b.order)
  
  // Sheet 1: Data (headers only)
  const headers = sortedColumns.map(col => col.label)
  const ws = XLSX.utils.aoa_to_sheet([headers])
  
  // Set column widths
  ws["!cols"] = headers.map(header => ({
    wch: Math.max(header.length + 2, 15)
  }))
  
  XLSX.utils.book_append_sheet(wb, ws, "Data")
  
  // Sheet 2: Instructions
  const identifierColumn = sortedColumns.find(c => c.key === identifierKey)
  const requiredColumns = sortedColumns.filter(c => c.required)
  
  const instructions: (string | number)[][] = [
    [`${databaseName} - Import Template`],
    [""],
    ["Instructions:"],
    ["1. Fill in your data in the 'Data' sheet"],
    ["2. Each row must have a unique value in the identifier column"],
    ["3. Required fields cannot be empty"],
    ["4. Do not modify column headers"],
    [""],
    ["Identifier Column:", identifierColumn?.label || "N/A"],
    [""],
    ["Required Fields:", requiredColumns.map(c => c.label).join(", ") || "None"],
    [""],
    ["Column Reference:"],
    ["Label", "Type", "Required"],
    ...sortedColumns.map(col => [
      col.label,
      formatDataType(col.dataType),
      col.required ? "Yes" : "No"
    ])
  ]
  
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions)
  
  // Set column widths for instructions
  wsInstructions["!cols"] = [
    { wch: 30 },
    { wch: 15 },
    { wch: 10 }
  ]
  
  XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions")
  
  // Write to buffer
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  return buffer
}

// ============================================
// Data Export
// ============================================

/**
 * Export database rows to Excel
 */
export function exportToExcel(
  schema: DatabaseSchema,
  rows: DatabaseRow[],
  databaseName: string
): Buffer {
  const wb = XLSX.utils.book_new()
  
  // Sort columns by order
  const sortedColumns = [...schema.columns].sort((a, b) => a.order - b.order)
  
  // Build data array: headers + rows
  const headers = sortedColumns.map(col => col.label)
  const data: (string | number | boolean | null)[][] = [headers]
  
  for (const row of rows) {
    const rowData = sortedColumns.map(col => {
      const value = row[col.key]
      // Format value based on type
      return formatCellValue(value, col.dataType)
    })
    data.push(rowData)
  }
  
  const ws = XLSX.utils.aoa_to_sheet(data)
  
  // Set column widths based on content
  ws["!cols"] = sortedColumns.map((col, index) => {
    // Find max length in this column
    let maxLength = col.label.length
    for (const row of data.slice(1)) { // Skip header
      const cellValue = row[index]
      if (cellValue !== null && cellValue !== undefined) {
        maxLength = Math.max(maxLength, String(cellValue).length)
      }
    }
    return { wch: Math.min(Math.max(maxLength + 2, 10), 50) }
  })
  
  // Apply number/date formatting hints via cell formats
  // Note: SheetJS has limited formatting support, but we can set basic types
  
  XLSX.utils.book_append_sheet(wb, ws, "Data")
  
  // Write to buffer
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  return buffer
}

// ============================================
// Excel Parsing
// ============================================

/**
 * Parse an Excel file and extract headers and rows
 */
export function parseExcelFile(buffer: Buffer | ArrayBuffer): ExcelParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellNF: true, cellStyles: true })

  // Get the first sheet
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error("File contains no data")
  }

  const worksheet = workbook.Sheets[firstSheetName]
  if (!worksheet) {
    throw new Error("Could not read worksheet")
  }

  // Get raw data with raw: true to preserve native types (numbers, booleans)
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][]

  if (rawData.length === 0) {
    throw new Error("File is empty")
  }

  // First row is headers
  const headers = rawData[0].map(h => String(h || "").trim())

  // Remaining rows are data
  const dataRows = rawData.slice(1).filter(row =>
    row.some(cell => cell !== null && cell !== undefined && cell !== "")
  )

  // Convert to objects, handling Date objects from cellDates: true
  const rows = dataRows.map(row => {
    const obj: Record<string, string | number | boolean | null> = {}
    headers.forEach((header, index) => {
      const value = (row as unknown[])[index]
      if (value === undefined || value === "") {
        obj[header] = null
      } else if (value instanceof Date) {
        // Convert JS Date to YYYY-MM-DD string
        const year = value.getFullYear()
        const month = String(value.getMonth() + 1).padStart(2, "0")
        const day = String(value.getDate()).padStart(2, "0")
        obj[header] = `${year}-${month}-${day}`
      } else {
        obj[header] = value as string | number | boolean
      }
    })
    return obj
  })

  // Build string version for rawRows
  const rawRowsStr = dataRows.map(row =>
    (row as unknown[]).map(cell => {
      if (cell instanceof Date) {
        const year = cell.getFullYear()
        const month = String(cell.getMonth() + 1).padStart(2, "0")
        const day = String(cell.getDate()).padStart(2, "0")
        return `${year}-${month}-${day}`
      }
      return String(cell ?? "")
    })
  )

  return {
    headers,
    rows,
    rawRows: rawRowsStr,
  }
}

/**
 * Parse Excel and return rows keyed by normalized column keys
 * Maps headers to schema column keys
 */
export function parseExcelWithSchema(
  buffer: Buffer | ArrayBuffer,
  schema: DatabaseSchema
): DatabaseRow[] {
  const parsed = parseExcelFile(buffer)
  
  // Create a map from label (case-insensitive) to column key
  const labelToKey = new Map<string, string>()
  for (const col of schema.columns) {
    labelToKey.set(col.label.toLowerCase().trim(), col.key)
  }
  
  // Map headers to keys
  const headerToKey = new Map<string, string>()
  for (const header of parsed.headers) {
    const normalizedHeader = header.toLowerCase().trim()
    const key = labelToKey.get(normalizedHeader)
    if (key) {
      headerToKey.set(header, key)
    }
  }
  
  // Build a map from column key to dataType for value coercion
  const keyToDataType = new Map<string, string>()
  for (const col of schema.columns) {
    keyToDataType.set(col.key, col.dataType)
  }

  // Convert rows to use schema keys, with type coercion based on schema
  return parsed.rows.map(row => {
    const result: DatabaseRow = {}
    for (const [header, value] of Object.entries(row)) {
      const key = headerToKey.get(header)
      if (key) {
        result[key] = coerceValue(value, keyToDataType.get(key) || "text")
      }
    }
    return result
  })
}

// ============================================
// Helpers
// ============================================

/**
 * Coerce a parsed value to match the expected schema data type.
 * Strips currency symbols and commas from numeric fields,
 * normalizes booleans, and attempts date parsing.
 */
function coerceValue(
  value: string | number | boolean | null,
  dataType: string
): string | number | boolean | null {
  if (value === null || value === undefined) return null

  switch (dataType) {
    case "currency":
    case "number": {
      const num = parseNumericValue(value)
      if (num !== null) return num
      // If parsing fails, keep original value (will be caught by validation)
      return value
    }
    case "boolean": {
      const str = String(value).toLowerCase().trim()
      if (["true", "yes", "1", "y"].includes(str)) return true
      if (["false", "no", "0", "n"].includes(str)) return false
      return value
    }
    case "date": {
      // Attempt to parse common date formats to ISO string
      const str = String(value).trim()
      if (!str) return null

      // Already in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

      // Handle short month-day strings without year (e.g. "26-Jan", "Jan-26", "26 Jan")
      // These come from Excel clipboard when dates are formatted as short dates
      const monthNames: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        january: 0, february: 1, march: 2, april: 3, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      }

      // Pattern: "26-Jan", "26 Jan", "26/Jan"
      const dayFirstMatch = str.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})$/)
      if (dayFirstMatch) {
        const day = parseInt(dayFirstMatch[1])
        const monthKey = dayFirstMatch[2].toLowerCase()
        if (monthKey in monthNames && day >= 1 && day <= 31) {
          const month = monthNames[monthKey]
          const year = new Date().getFullYear()
          const d = new Date(year, month, day)
          if (!isNaN(d.getTime())) {
            return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          }
        }
      }

      // Pattern: "Jan-26", "Jan 26", "Jan/26" (month first, no year)
      const monthFirstMatch = str.match(/^([A-Za-z]{3,9})[\s\-\/](\d{1,2})$/)
      if (monthFirstMatch) {
        const monthKey = monthFirstMatch[1].toLowerCase()
        const day = parseInt(monthFirstMatch[2])
        if (monthKey in monthNames && day >= 1 && day <= 31) {
          const month = monthNames[monthKey]
          const year = new Date().getFullYear()
          const d = new Date(year, month, day)
          if (!isNaN(d.getTime())) {
            return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          }
        }
      }

      // Standard date parsing for full dates (e.g. "1/25/2026", "January 25, 2026")
      const parsed = new Date(str)
      if (!isNaN(parsed.getTime())) {
        // Guard against dates that default to year 2001 or similar from ambiguous input
        const year = parsed.getFullYear()
        if (year >= 1900 && year <= 2100) {
          return parsed.toISOString().split("T")[0] // YYYY-MM-DD
        }
      }

      // Keep original if parsing fails
      return value
    }
    default:
      // text, dropdown, file — keep as-is, just trim strings
      return typeof value === "string" ? value.trim() : value
  }
}

/**
 * Format data type for display
 */
function formatDataType(dataType: string): string {
  switch (dataType) {
    case "text": return "Text"
    case "number": return "Number"
    case "date": return "Date"
    case "boolean": return "Yes/No"
    case "currency": return "Currency"
    default: return dataType
  }
}

/**
 * Format cell value for export
 */
function formatCellValue(
  value: string | number | boolean | null,
  dataType: string
): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null
  }
  
  switch (dataType) {
    case "boolean":
      return value ? "Yes" : "No"
    case "date":
      // Keep as string, let Excel interpret
      return value
    case "number":
    case "currency":
      // Keep numeric value
      return typeof value === "number" ? value : value
    default:
      return value
  }
}

/**
 * Infer data type from sample values
 */
export function inferDataType(values: (string | number | boolean | null)[]): DatabaseSchemaColumn["dataType"] {
  const nonEmptyValues = values.filter(v => v !== null && v !== undefined && v !== "")
  
  if (nonEmptyValues.length === 0) {
    return "text"
  }
  
  // Check for boolean
  const booleanPatterns = ["true", "false", "yes", "no", "1", "0", "y", "n"]
  const allBoolean = nonEmptyValues.every(v => 
    booleanPatterns.includes(String(v).toLowerCase().trim())
  )
  if (allBoolean) {
    return "boolean"
  }
  
  // Check for currency (has currency symbol, commas with decimals, or accounting format)
  const currencyCount = nonEmptyValues.filter(v => {
    const str = String(v).trim()
    // Match: $1,234.56, £1234.56, -$500, $-500, ($1,234.56), €1 234,56, ¥1234
    // Currency symbol present (with optional negative sign, commas, decimals)
    if (/^[-]?[$£€¥]\s*-?\d[\d,\s]*(\.\d{1,2})?$/.test(str)) return true
    if (/^[$£€¥]\s*-?\d[\d,\s]*(\.\d{1,2})?$/.test(str)) return true
    // Negative sign before currency symbol: -$500.00
    if (/^-[$£€¥]\s*\d[\d,\s]*(\.\d{1,2})?$/.test(str)) return true
    // Accounting format: ($1,234.56) or (1,234.56)
    if (/^\([$£€¥]?\s*\d[\d,\s]*(\.\d{1,2})?\)$/.test(str)) return true
    // Number with exactly 2 decimal places and commas (likely currency): 1,234.56
    if (/^-?\d{1,3}(,\d{3})+\.\d{2}$/.test(str)) return true
    // Plain number with exactly 2 decimal places: 1234.56
    if (/^-?\d+\.\d{2}$/.test(str)) return true
    return false
  }).length
  if (currencyCount >= nonEmptyValues.length * 0.7) {
    return "currency"
  }
  
  // Check for number
  const numberCount = nonEmptyValues.filter(v => {
    const str = String(v).trim().replace(/,/g, "")
    return !isNaN(parseFloat(str)) && isFinite(Number(str))
  }).length
  if (numberCount >= nonEmptyValues.length * 0.7) {
    return "number"
  }
  
  // Check for date
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/,                    // 2024-01-15
    /^\d{2}\/\d{2}\/\d{4}$/,                  // 01/15/2024
    /^\d{2}-\d{2}-\d{4}$/,                    // 01-15-2024
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,            // 1/15/24
  ]
  const dateCount = nonEmptyValues.filter(v => {
    const str = String(v).trim()
    return datePatterns.some(p => p.test(str))
  }).length
  if (dateCount >= nonEmptyValues.length * 0.7) {
    return "date"
  }
  
  return "text"
}
