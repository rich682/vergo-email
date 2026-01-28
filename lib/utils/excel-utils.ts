/**
 * Excel Utilities
 * 
 * Shared utilities for Excel file generation, parsing, and export.
 * Uses the xlsx (SheetJS) library consistently across all operations.
 */

import * as XLSX from "xlsx"
import { DatabaseSchema, DatabaseSchemaColumn, DatabaseRow } from "@/lib/services/database.service"

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
  const workbook = XLSX.read(buffer, { type: "buffer", cellNF: true, cellStyles: true })
  
  // Get the first sheet
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error("Excel file has no sheets")
  }
  
  const worksheet = workbook.Sheets[firstSheetName]
  if (!worksheet) {
    throw new Error("Could not read worksheet")
  }
  
  // Get raw data as 2D array
  const rawData: string[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false, // Convert to strings for consistency
  }) as string[][]
  
  if (rawData.length === 0) {
    throw new Error("Excel file is empty")
  }
  
  // First row is headers
  const headers = rawData[0].map(h => String(h || "").trim())
  
  // Remaining rows are data
  const dataRows = rawData.slice(1).filter(row => 
    row.some(cell => cell !== null && cell !== undefined && cell !== "")
  )
  
  // Convert to objects
  const rows = dataRows.map(row => {
    const obj: Record<string, string | number | boolean | null> = {}
    headers.forEach((header, index) => {
      const value = row[index]
      obj[header] = value === undefined || value === "" ? null : value
    })
    return obj
  })
  
  return {
    headers,
    rows,
    rawRows: dataRows,
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
  
  // Convert rows to use schema keys
  return parsed.rows.map(row => {
    const result: DatabaseRow = {}
    for (const [header, value] of Object.entries(row)) {
      const key = headerToKey.get(header)
      if (key) {
        result[key] = value
      }
    }
    return result
  })
}

// ============================================
// Helpers
// ============================================

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
  
  // Check for currency (has $ or exactly 2 decimal places)
  const currencyPattern = /^[$£€¥]?\s*-?\d{1,3}(,\d{3})*(\.\d{2})?$|^-?\d+\.\d{2}$/
  const currencyCount = nonEmptyValues.filter(v => 
    currencyPattern.test(String(v).trim())
  ).length
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
