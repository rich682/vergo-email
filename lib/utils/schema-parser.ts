/**
 * Schema Parser Utilities
 * 
 * Parses CSV and XLSX files to auto-detect schema columns and types.
 * Used by the Create Schema flow in the Data workflow.
 */

import * as XLSX from "xlsx"

export type ColumnType = "text" | "number" | "date" | "boolean" | "currency"

export interface DetectedColumn {
  key: string
  label: string
  type: ColumnType
  required: boolean
  sampleValues: string[]
}

export interface RowLabel {
  label: string
  type: ColumnType  // Detected type from values in that row
}

export interface SchemaParseResult {
  columns: DetectedColumn[]
  sampleRows: Array<Record<string, string>>
  rowCount: number
  rowLabels: RowLabel[]  // Values from Column A with detected types - used for row-based identity preview
}

export interface SchemaParseError {
  message: string
  code: "INVALID_FILE" | "NO_DATA" | "TOO_MANY_COLUMNS" | "PARSE_ERROR"
}

const MAX_SAMPLE_ROWS = 20
const MAX_COLUMNS = 100

/**
 * Generate a unique key from a column label
 */
function generateKey(label: string, existingKeys: Set<string>): string {
  let baseKey = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^_|_$/g, "")
    || "column"
  
  let key = baseKey
  let counter = 1
  while (existingKeys.has(key)) {
    key = `${baseKey}_${counter}`
    counter++
  }
  existingKeys.add(key)
  return key
}

/**
 * Detect the type of a column based on sample values
 */
function detectColumnType(values: string[]): ColumnType {
  const nonEmptyValues = values.filter(v => v && v.trim().length > 0)
  
  if (nonEmptyValues.length === 0) {
    return "text"
  }

  // Check for currency pattern first (before number check)
  const currencyPattern = /^[\$€£¥₹]?\s*-?\d{1,3}(,\d{3})*(\.\d{1,2})?$|^-?\d{1,3}(,\d{3})*(\.\d{1,2})?\s*[\$€£¥₹]?$/
  const currencyMatches = nonEmptyValues.filter(v => currencyPattern.test(v.trim()))
  if (currencyMatches.length >= nonEmptyValues.length * 0.8) {
    return "currency"
  }

  // Check for numbers
  const numberPattern = /^-?\d+(\.\d+)?$|^-?\d{1,3}(,\d{3})*(\.\d+)?$/
  const numberMatches = nonEmptyValues.filter(v => {
    const cleaned = v.trim().replace(/,/g, "")
    return numberPattern.test(v.trim()) || !isNaN(parseFloat(cleaned))
  })
  if (numberMatches.length >= nonEmptyValues.length * 0.8) {
    return "number"
  }

  // Check for dates
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/, // ISO: 2024-01-15
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // US: 1/15/2024 or 01/15/24
    /^\d{1,2}-\d{1,2}-\d{2,4}$/, // Alt: 1-15-2024
    /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/, // Long: January 15, 2024
    /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/, // EU: 15 January 2024
  ]
  const dateMatches = nonEmptyValues.filter(v => {
    const trimmed = v.trim()
    return datePatterns.some(p => p.test(trimmed)) || !isNaN(Date.parse(trimmed))
  })
  if (dateMatches.length >= nonEmptyValues.length * 0.8) {
    return "date"
  }

  // Check for booleans
  const booleanValues = ["true", "false", "yes", "no", "y", "n", "1", "0"]
  const booleanMatches = nonEmptyValues.filter(v => 
    booleanValues.includes(v.trim().toLowerCase())
  )
  if (booleanMatches.length >= nonEmptyValues.length * 0.9) {
    return "boolean"
  }

  return "text"
}

/**
 * Detect the type of a row by analyzing values across columns (excluding the label column)
 */
function detectRowType(row: Record<string, string>, labelColumnHeader: string): ColumnType {
  // Get all values from the row except the label column
  const values = Object.entries(row)
    .filter(([key]) => key !== labelColumnHeader)
    .map(([, value]) => value)
  return detectColumnType(values)
}

/**
 * Parse CSV content and extract schema
 */
function parseCSVForSchema(content: string): SchemaParseResult | SchemaParseError {
  try {
    const lines = content.split("\n").map(l => l.trim()).filter(l => l.length > 0)
    
    if (lines.length === 0) {
      return { message: "File is empty", code: "NO_DATA" }
    }

    // Parse headers
    const headers = parseCSVLine(lines[0])
    if (headers.length === 0) {
      return { message: "No column headers found", code: "NO_DATA" }
    }

    if (headers.length > MAX_COLUMNS) {
      return { message: `Too many columns (${headers.length}). Maximum is ${MAX_COLUMNS}.`, code: "TOO_MANY_COLUMNS" }
    }

    // Parse sample rows
    const sampleRows: Array<Record<string, string>> = []
    for (let i = 1; i < lines.length && sampleRows.length < MAX_SAMPLE_ROWS; i++) {
      const values = parseCSVLine(lines[i])
      if (values.length === headers.length) {
        const row: Record<string, string> = {}
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = values[j]?.trim() || ""
        }
        sampleRows.push(row)
      }
    }

    // Detect columns
    const existingKeys = new Set<string>()
    const columns: DetectedColumn[] = headers.map(header => {
      const sampleValues = sampleRows.map(row => row[header] || "")
      const key = generateKey(header, existingKeys)
      
      return {
        key,
        label: header,
        type: detectColumnType(sampleValues),
        required: false,
        sampleValues: sampleValues.slice(0, 5),
      }
    })

    // Extract row labels with detected types (values from first column / Column A)
    const firstColumnHeader = headers[0]
    const rowLabels: RowLabel[] = firstColumnHeader 
      ? sampleRows
          .filter(row => (row[firstColumnHeader] || "").trim().length > 0)
          .map(row => ({
            label: row[firstColumnHeader] || "",
            type: detectRowType(row, firstColumnHeader)
          }))
      : []

    return {
      columns,
      sampleRows,
      rowCount: lines.length - 1, // Exclude header row
      rowLabels,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse CSV"
    return { message, code: "PARSE_ERROR" }
  }
}

/**
 * Parse CSV line (handles quoted fields)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

/**
 * Check if an Excel cell format indicates currency
 */
function isCurrencyFormat(format: string | undefined): boolean {
  if (!format) return false
  // Common currency format patterns in Excel
  // e.g., "$#,##0.00", "[$USD] #,##0.00", "#,##0.00 €", etc.
  return /[$€£¥₹]/.test(format) || 
         /\[\$[A-Z]{3}\]/.test(format) || // [$USD], [$EUR], etc.
         format.includes("Currency") ||
         format.includes("Accounting")
}

/**
 * Parse XLSX content and extract schema
 */
function parseXLSXForSchema(buffer: ArrayBuffer): SchemaParseResult | SchemaParseError {
  try {
    // Use cellDates to properly handle dates, cellNF to get number formats
    const workbook = XLSX.read(buffer, { type: "array", cellNF: true, cellStyles: true })
    
    // Get first sheet
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return { message: "No sheets found in workbook", code: "NO_DATA" }
    }

    const sheet = workbook.Sheets[sheetName]
    
    // Get the range of the sheet
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1")
    
    if (range.e.r < 0 || range.e.c < 0) {
      return { message: "Sheet is empty", code: "NO_DATA" }
    }

    // Track which columns and rows have currency formatting
    const currencyColumns = new Set<number>()
    const currencyRowCounts = new Map<number, number>()  // row index -> count of currency cells
    const rowCellCounts = new Map<number, number>()       // row index -> total data cells
    
    // Check cell formats for currency (sample first 20 data rows)
    for (let row = 1; row <= Math.min(range.e.r, MAX_SAMPLE_ROWS); row++) {
      let currencyCount = 0
      let totalCells = 0
      
      for (let col = 0; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
        const cell = sheet[cellAddress]
        
        // Skip first column (row labels) for row currency detection
        if (col > 0 && cell && cell.v !== undefined && cell.v !== null && cell.v !== "") {
          totalCells++
          if (cell.z && isCurrencyFormat(cell.z)) {
            currencyCount++
          }
        }
        
        // Track column currency (all columns including first)
        if (cell && cell.z && isCurrencyFormat(cell.z)) {
          currencyColumns.add(col)
        }
      }
      
      currencyRowCounts.set(row, currencyCount)
      rowCellCounts.set(row, totalCells)
    }
    
    // Determine which rows are currency (>80% of data cells have currency format)
    const currencyRows = new Set<number>()
    for (let row = 1; row <= Math.min(range.e.r, MAX_SAMPLE_ROWS); row++) {
      const currencyCount = currencyRowCounts.get(row) || 0
      const totalCells = rowCellCounts.get(row) || 0
      if (totalCells > 0 && currencyCount >= totalCells * 0.8) {
        currencyRows.add(row)
      }
    }

    // Parse data using sheet_to_json for convenience
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 }) as unknown[][]

    if (data.length === 0) {
      return { message: "Sheet is empty", code: "NO_DATA" }
    }

    // First row is headers
    const headers = (data[0] || []).map(h => String(h || "").trim()).filter(h => h.length > 0)
    
    if (headers.length === 0) {
      return { message: "No column headers found", code: "NO_DATA" }
    }

    if (headers.length > MAX_COLUMNS) {
      return { message: `Too many columns (${headers.length}). Maximum is ${MAX_COLUMNS}.`, code: "TOO_MANY_COLUMNS" }
    }

    // Parse sample rows
    const sampleRows: Array<Record<string, string>> = []
    for (let i = 1; i < data.length && sampleRows.length < MAX_SAMPLE_ROWS; i++) {
      const rowData = data[i] || []
      const row: Record<string, string> = {}
      for (let j = 0; j < headers.length; j++) {
        const value = rowData[j]
        row[headers[j]] = value !== null && value !== undefined ? String(value).trim() : ""
      }
      sampleRows.push(row)
    }

    // Detect columns, using format info for currency detection
    const existingKeys = new Set<string>()
    const columns: DetectedColumn[] = headers.map((header, colIndex) => {
      const sampleValues = sampleRows.map(row => row[header] || "")
      const key = generateKey(header, existingKeys)
      
      // If Excel format indicates currency, use that; otherwise detect from values
      let type: ColumnType
      if (currencyColumns.has(colIndex)) {
        type = "currency"
      } else {
        type = detectColumnType(sampleValues)
      }
      
      return {
        key,
        label: header,
        type,
        required: false,
        sampleValues: sampleValues.slice(0, 5),
      }
    })

    // Extract row labels with detected types (values from first column / Column A)
    // Use Excel cell format info if available, otherwise detect from values
    const firstColumnHeader = headers[0]
    const rowLabels: RowLabel[] = firstColumnHeader 
      ? sampleRows
          .map((row, index) => {
            const label = (row[firstColumnHeader] || "").trim()
            if (!label) return null
            
            // Excel row index is index + 1 (1-based Excel rows after header)
            const excelRowIndex = index + 1
            
            // Use Excel format info if row is currency, otherwise detect from values
            const type = currencyRows.has(excelRowIndex) 
              ? "currency" as ColumnType
              : detectRowType(row, firstColumnHeader)
            
            return { label, type }
          })
          .filter((row): row is RowLabel => row !== null)
      : []

    return {
      columns,
      sampleRows,
      rowCount: data.length - 1, // Exclude header row
      rowLabels,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse Excel file"
    return { message, code: "PARSE_ERROR" }
  }
}

/**
 * Parse a file (CSV or XLSX) and extract schema information
 */
export async function parseFileForSchema(file: File): Promise<SchemaParseResult | SchemaParseError> {
  const fileName = file.name.toLowerCase()
  
  if (fileName.endsWith(".csv")) {
    const content = await file.text()
    return parseCSVForSchema(content)
  }
  
  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const buffer = await file.arrayBuffer()
    return parseXLSXForSchema(buffer)
  }

  return {
    message: "Unsupported file type. Please upload a CSV or Excel file (.csv, .xlsx, .xls).",
    code: "INVALID_FILE"
  }
}

/**
 * Check if result is an error
 */
export function isSchemaParseError(result: SchemaParseResult | SchemaParseError): result is SchemaParseError {
  return "code" in result && "message" in result && !("columns" in result)
}
