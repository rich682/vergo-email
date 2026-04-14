/**
 * ReconciliationFileParserService
 * Parses uploaded Excel/CSV/PDF files into structured row data for reconciliation.
 *
 * Excel/CSV: parsed directly with XLSX library (no AI).
 * PDF: text extracted with unpdf, then parsed deterministically with regex (no AI).
 * AI is ONLY used downstream for matching — never for data extraction.
 */
import * as XLSX from "xlsx"
import type { SourceConfig, SourceColumnDef, ExtractionProfile } from "./reconciliation.service"

export interface ParsedSourceResult {
  rows: Record<string, any>[]
  detectedColumns: { key: string; label: string; sampleValues: string[] }[]
  warnings: string[]
  rowCount: number
}

export class ReconciliationFileParserService {
  /**
   * Parse a source file into structured rows.
   * If sourceConfig has columns defined, maps to those columns.
   * Otherwise, auto-detects columns for first-time setup.
   */
  static async parseFile(
    buffer: Buffer,
    filename: string,
    sourceConfig?: SourceConfig,
    mode: "detect" | "full" = "detect",
    extractionProfile?: ExtractionProfile
  ): Promise<ParsedSourceResult> {
    const ext = filename.toLowerCase().split(".").pop() || ""
    const warnings: string[] = []

    let rawRows: Record<string, any>[] = []
    let detectedColumns: { key: string; label: string; sampleValues: string[] }[] = []

    if (ext === "xlsx" || ext === "xls") {
      const result = this.parseExcel(buffer)
      rawRows = result.rows
      detectedColumns = result.detectedColumns
    } else if (ext === "csv" || ext === "tsv") {
      const result = this.parseCsv(buffer)
      rawRows = result.rows
      detectedColumns = result.detectedColumns
    } else if (ext === "pdf") {
      const result = await this.parsePdf(buffer)
      rawRows = result.rows
      detectedColumns = result.detectedColumns
      if (result.rows.length === 0) {
        warnings.push("Could not extract tabular data from PDF. The document may not contain recognizable transaction rows.")
      }
    } else {
      throw new Error(`Unsupported file type: .${ext}. Please upload CSV, Excel, or PDF.`)
    }

    // If source config has column mappings, remap the rows
    if (sourceConfig?.columns && sourceConfig.columns.length > 0) {
      rawRows = this.remapRows(rawRows, sourceConfig.columns, detectedColumns)
    }

    return {
      rows: rawRows,
      detectedColumns,
      warnings,
      rowCount: rawRows.length,
    }
  }

  // ── Excel / CSV ─────────────────────────────────────────────────────

  /** Parse Excel file into rows */
  private static parseExcel(buffer: Buffer): { rows: Record<string, any>[]; detectedColumns: any[] } {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
    return this.parseExcelWorkbook(workbook)
  }

  /** Parse CSV file into rows (uses same logic as Excel) */
  private static parseCsv(buffer: Buffer): { rows: Record<string, any>[]; detectedColumns: any[] } {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
    return this.parseExcelWorkbook(workbook)
  }

  /** Shared workbook parser with smart header row detection */
  private static parseExcelWorkbook(workbook: XLSX.WorkBook): { rows: Record<string, any>[]; detectedColumns: any[] } {
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error("File has no sheets")

    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]

    if (jsonData.length < 2) throw new Error("File has no data rows")

    // Detect the header row — many accounting exports have headers in row 2+
    const headerRowIdx = this.detectHeaderRow(jsonData)
    let headers = (jsonData[headerRowIdx] || []).map((h: any, idx: number) =>
      h ? String(h).trim() : `Column${idx + 1}`
    )

    // If >60% generic, scan for a better row
    const genericCount = headers.filter((h) => /^Column\d+$/.test(h)).length
    if (genericCount / headers.length > 0.6 && headerRowIdx === 0) {
      for (let r = 1; r < Math.min(jsonData.length, 10); r++) {
        const candidate = (jsonData[r] || []).map((h: any, idx: number) =>
          h ? String(h).trim() : `Column${idx + 1}`
        )
        const candidateGeneric = candidate.filter((h) => /^Column\d+$/.test(h)).length
        if (candidateGeneric < genericCount) {
          return this.buildRowsFromHeaders(jsonData, candidate, r + 1)
        }
      }
    }

    return this.buildRowsFromHeaders(jsonData, headers, headerRowIdx + 1)
  }

  private static buildRowsFromHeaders(
    jsonData: any[][],
    headers: string[],
    startRow: number
  ): { rows: Record<string, any>[]; detectedColumns: any[] } {
    const rows: Record<string, any>[] = []
    for (let i = startRow; i < jsonData.length; i++) {
      const row: Record<string, any> = {}
      let nonEmpty = 0
      for (let j = 0; j < headers.length; j++) {
        const val = jsonData[i]?.[j]
        row[headers[j]] = val !== undefined ? val : ""
        if (val !== undefined && val !== "" && val !== null) nonEmpty++
      }
      if (nonEmpty >= 3) rows.push(row) // Skip near-empty rows (separators, subtotals)
    }

    const detectedColumns = headers.map((label) => ({
      key: label,
      label,
      sampleValues: rows.slice(0, 3).map((r) => String(r[label] ?? "")),
    }))

    return { rows, detectedColumns }
  }

  /** Find the best header row — the one with the most non-empty string cells */
  private static detectHeaderRow(jsonData: any[][]): number {
    let bestRow = 0
    let bestScore = 0

    for (let r = 0; r < Math.min(jsonData.length, 10); r++) {
      const row = jsonData[r] || []
      let score = 0
      for (const cell of row) {
        if (cell === undefined || cell === null || String(cell).trim() === "") continue
        const val = String(cell).trim()
        if (typeof cell === "string" && isNaN(Number(val)) && val.length > 0 && val.length < 60) {
          score++
        }
      }
      if (score > bestScore) {
        bestScore = score
        bestRow = r
      }
    }

    return bestRow
  }

  // ── PDF ──────────────────────────────────────────────────────────────

  /**
   * Parse PDF deterministically: extract text with unpdf, then parse transaction
   * rows using regex patterns. No AI involved.
   *
   * Handles common financial document formats:
   * - Credit card statements (JPM, Chase, Amex, etc.)
   * - Bank statements with transaction lines
   * - Any document with date + description + amount patterns
   */
  private static async parsePdf(
    buffer: Buffer
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    // Step 1: Extract text
    const { extractText } = await import("unpdf")
    const result = await extractText(new Uint8Array(buffer))
    const pages = result.text || []
    const allText = pages.join("\n")

    if (allText.length < 50) {
      console.log("[PDF Parser] Not enough text extracted")
      return { rows: [], detectedColumns: [] }
    }

    console.log(`[PDF Parser] Extracted ${allText.length} chars from ${pages.length} pages`)

    // Step 2: Parse transaction rows deterministically
    const rows: Record<string, any>[] = []
    let currentCardholder = ""
    let currentActivityType = ""

    const lines = allText.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      // Detect cardholder name (e.g., "ROBERT COCHRAN CREDITS PURCHASES CASH ADV TOTAL ACTIVITY")
      const cardholderMatch = line.match(/^([A-Z][A-Z\s]{2,30}?)\s+CREDITS\s+PURCHASES/i)
      if (cardholderMatch) {
        currentCardholder = cardholderMatch[1].trim()
        continue
      }

      // Detect activity type (e.g., "Purchasing Activity", "Travel Activity")
      const activityMatch = line.match(/^(Purchasing|Travel)\s+Activity/i)
      if (activityMatch) {
        currentActivityType = activityMatch[1] + " Activity"
        continue
      }

      // Transaction pattern 1: MM-DD MM-DD LONGREF DESCRIPTION AMOUNT [CR]
      // e.g., "03-09 03-06 82711166066500002351036 SP BRUNT WORKWEAR NORTH READING MA 187.24"
      const txn1 = line.match(
        /^(\d{2}-\d{2})\s+(\d{2}-\d{2})\s+(\d{10,})\s+(.+?)\s+([\d,]+\.\d{2})(\s+CR)?$/
      )
      if (txn1) {
        let amount = parseFloat(txn1[5].replace(/,/g, ""))
        if (txn1[6]?.includes("CR")) amount = -amount
        rows.push({
          "Post Date": txn1[1],
          "Tran Date": txn1[2],
          "Reference Number": txn1[3],
          "Transaction Description": txn1[4].trim(),
          "Amount": amount,
          ...(currentCardholder && { "Cardholder": currentCardholder }),
          ...(currentActivityType && { "Activity Type": currentActivityType }),
        })
        continue
      }

      // Transaction pattern 2: MM-DD MM-DD DESCRIPTION AMOUNT [CR] (no reference)
      // e.g., "03-24 03-24 AUTO PAYMENT DEDUCTION 104,855.27 CR"
      const txn2 = line.match(
        /^(\d{2}-\d{2})\s+(\d{2}-\d{2})\s+([A-Z][\w\s*#\/.'-]+?)\s+([\d,]+\.\d{2})(\s+CR)?$/
      )
      if (txn2) {
        let amount = parseFloat(txn2[4].replace(/,/g, ""))
        if (txn2[5]?.includes("CR")) amount = -amount
        rows.push({
          "Post Date": txn2[1],
          "Tran Date": txn2[2],
          "Reference Number": "",
          "Transaction Description": txn2[3].trim(),
          "Amount": amount,
          ...(currentCardholder && { "Cardholder": currentCardholder }),
          ...(currentActivityType && { "Activity Type": currentActivityType }),
        })
        continue
      }

      // Transaction pattern 3: MM/DD MM/DD or MM/DD/YY format
      const txn3 = line.match(
        /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+([\d,]+\.\d{2})(\s+CR)?$/
      )
      if (txn3) {
        let amount = parseFloat(txn3[4].replace(/,/g, ""))
        if (txn3[5]?.includes("CR")) amount = -amount
        rows.push({
          "Post Date": txn3[1],
          "Tran Date": txn3[2],
          "Reference Number": "",
          "Transaction Description": txn3[3].trim(),
          "Amount": amount,
          ...(currentCardholder && { "Cardholder": currentCardholder }),
          ...(currentActivityType && { "Activity Type": currentActivityType }),
        })
        continue
      }

      // Transaction pattern 4: Single date with description and amount
      // e.g., "03/15 PURCHASE AT STORE NAME 125.00"
      const txn4 = line.match(
        /^(\d{2}[\/\-]\d{2}(?:[\/\-]\d{2,4})?)\s+(.{5,}?)\s+([\d,]+\.\d{2})(\s+CR)?$/
      )
      if (txn4 && !/^(total|balance|payment|previous|new|credit limit|available)/i.test(txn4[2])) {
        let amount = parseFloat(txn4[3].replace(/,/g, ""))
        if (txn4[4]?.includes("CR")) amount = -amount
        rows.push({
          "Post Date": txn4[1],
          "Tran Date": txn4[1],
          "Reference Number": "",
          "Transaction Description": txn4[2].trim(),
          "Amount": amount,
          ...(currentCardholder && { "Cardholder": currentCardholder }),
          ...(currentActivityType && { "Activity Type": currentActivityType }),
        })
        continue
      }
    }

    console.log(`[PDF Parser] Deterministic extraction: ${rows.length} transaction rows`)

    if (rows.length === 0) {
      return { rows: [], detectedColumns: [] }
    }

    // Build detected columns from the first row's keys
    const columnKeys = Object.keys(rows[0])
    const detectedColumns = columnKeys.map((key) => ({
      key,
      label: key,
      sampleValues: rows.slice(0, 3).map((r) => String(r[key] ?? "")),
    }))

    return { rows, detectedColumns }
  }

  // ── Shared Utilities ────────────────────────────────────────────────

  /**
   * Remap raw rows to match the configured column definitions.
   * Maps detected column labels → config column keys.
   */
  private static remapRows(
    rawRows: Record<string, any>[],
    configColumns: SourceColumnDef[],
    detectedColumns: { key: string; label: string }[]
  ): Record<string, any>[] {
    const mapping = new Map<string, string>()
    for (const configCol of configColumns) {
      const match = detectedColumns.find(
        (dc) =>
          dc.label === configCol.label ||
          dc.label.toLowerCase() === configCol.label.toLowerCase() ||
          dc.key === configCol.key
      )
      if (match) {
        mapping.set(match.key, configCol.key)
      }
    }

    return rawRows.map((row) => {
      const mapped: Record<string, any> = {}
      for (const [rawKey, configKey] of mapping.entries()) {
        mapped[configKey] = row[rawKey]
      }
      for (const key of Object.keys(row)) {
        if (!mapping.has(key)) {
          mapped[key] = row[key]
        }
      }
      return mapped
    })
  }

  /**
   * Auto-detect column types from sample data.
   */
  static detectColumnTypes(
    detectedColumns: { key: string; label: string; sampleValues: string[] }[]
  ): { key: string; label: string; suggestedType: SourceColumnDef["type"] }[] {
    return detectedColumns.map((col) => {
      const label = col.label.toLowerCase()
      const samples = col.sampleValues.map((s) => String(s).trim())

      // Date detection
      const dateLabels = ["date", "posted", "effective", "created", "updated", "timestamp", "time", "period", "due", "issued", "paid", "tran"]
      const isDateByLabel = dateLabels.some((d) => label.includes(d))
      const isDateBySample = samples.some((s) => {
        if (/^\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?$/.test(s)) return true
        if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(s)) return true
        if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) return true
        if (/^[A-Za-z]{3,9}\s+\d{1,2}[,\s]+\d{4}$/.test(s)) return true
        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return true
        const num = parseFloat(s)
        if (!isNaN(num) && num > 25000 && num < 60000 && Number.isInteger(num)) return true
        return false
      })
      if (isDateByLabel || isDateBySample) {
        return { key: col.key, label: col.label, suggestedType: "date" as const }
      }

      // Amount detection
      if (
        label.includes("amount") ||
        label.includes("debit") ||
        label.includes("credit") ||
        label.includes("balance") ||
        label.includes("total") ||
        samples.some((s) => /^[\$\-\(]?\d[\d,]*\.?\d*\)?$/.test(s.replace(/\s/g, "")))
      ) {
        return { key: col.key, label: col.label, suggestedType: "amount" as const }
      }

      // Reference detection
      if (
        label.includes("ref") ||
        label.includes("check") ||
        label.includes("number") ||
        label.includes("id") ||
        label.includes("invoice")
      ) {
        return { key: col.key, label: col.label, suggestedType: "reference" as const }
      }

      return { key: col.key, label: col.label, suggestedType: "text" as const }
    })
  }
}
