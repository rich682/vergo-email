/**
 * ReconciliationFileParserService
 * Parses uploaded Excel/CSV/PDF files into structured row data for reconciliation.
 * Uses the same libraries as the existing attachment-extraction and excel-utils services.
 * PDF parsing uses `unpdf` for serverless-friendly text extraction + AI for table detection.
 */
import * as XLSX from "xlsx"
import OpenAI from "openai"
import type { SourceConfig, SourceColumnDef } from "./reconciliation.service"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set")
  return new OpenAI({ apiKey })
}

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
   *
   * For PDFs, use mode="detect" (default) for fast column detection + row count,
   * or mode="full" to extract every row (slower, used during actual reconciliation).
   */
  static async parseFile(
    buffer: Buffer,
    filename: string,
    sourceConfig?: SourceConfig,
    mode: "detect" | "full" = "detect"
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
      const result = await this.parsePdf(buffer, mode)
      rawRows = result.rows
      detectedColumns = result.detectedColumns
      if (result.rows.length === 0) {
        warnings.push("Could not extract tabular data from PDF. Try uploading a CSV or Excel file instead.")
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

  /** Parse Excel file into rows */
  private static parseExcel(buffer: Buffer): { rows: Record<string, any>[]; detectedColumns: any[] } {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error("Excel file has no sheets")

    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]

    if (jsonData.length < 2) throw new Error("File has no data rows (needs at least a header row and one data row)")

    // First row = headers
    const headers = (jsonData[0] || []).map((h: any, idx: number) =>
      h ? String(h).trim() : `Column${idx + 1}`
    )

    const rows: Record<string, any>[] = []
    for (let i = 1; i < jsonData.length; i++) {
      const row: Record<string, any> = {}
      let hasData = false
      for (let j = 0; j < headers.length; j++) {
        const val = jsonData[i]?.[j]
        row[headers[j]] = val !== undefined ? val : ""
        if (val !== undefined && val !== "" && val !== null) hasData = true
      }
      if (hasData) rows.push(row)
    }

    const detectedColumns = headers.map((label) => ({
      key: label,
      label,
      sampleValues: rows.slice(0, 3).map((r) => String(r[label] ?? "")),
    }))

    return { rows, detectedColumns }
  }

  /** Parse CSV file into rows */
  private static parseCsv(buffer: Buffer): { rows: Record<string, any>[]; detectedColumns: any[] } {
    // xlsx can parse CSV too
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error("CSV file is empty")

    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][]

    if (jsonData.length < 2) throw new Error("File has no data rows")

    const headers = (jsonData[0] || []).map((h: any, idx: number) =>
      h ? String(h).trim() : `Column${idx + 1}`
    )

    const rows: Record<string, any>[] = []
    for (let i = 1; i < jsonData.length; i++) {
      const row: Record<string, any> = {}
      let hasData = false
      for (let j = 0; j < headers.length; j++) {
        const val = jsonData[i]?.[j]
        row[headers[j]] = val !== undefined ? val : ""
        if (val !== undefined && val !== "" && val !== null) hasData = true
      }
      if (hasData) rows.push(row)
    }

    const detectedColumns = headers.map((label) => ({
      key: label,
      label,
      sampleValues: rows.slice(0, 3).map((r) => String(r[label] ?? "")),
    }))

    return { rows, detectedColumns }
  }

  /**
   * Extract text from a PDF using `unpdf` (serverless-friendly, no canvas/DOMMatrix).
   */
  private static async extractPdfText(buffer: Buffer): Promise<string> {
    const { extractText } = await import("unpdf")
    const result = await extractText(new Uint8Array(buffer))
    // Join pages with a clear separator
    return (result.text || []).join("\n--- PAGE BREAK ---\n")
  }

  /**
   * Parse PDF file using unpdf for text extraction + AI for table detection.
   *
   * mode="detect": Fast -- asks AI for column names, total row count, and 5 sample rows.
   *                Used by the /analyze endpoint for initial column detection.
   * mode="full":   Slower -- asks AI to extract ALL rows. Used during actual reconciliation runs.
   */
  private static async parsePdf(
    buffer: Buffer,
    mode: "detect" | "full" = "detect"
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    try {
      // Step 1: Extract text (fast, ~100ms)
      console.log("[PDF Parser] Extracting text with unpdf...")
      const fullText = await this.extractPdfText(buffer)
      console.log(`[PDF Parser] Extracted text: ${fullText.length} chars`)

      if (fullText.length < 20) {
        console.log("[PDF Parser] Not enough text, returning empty")
        return { rows: [], detectedColumns: [] }
      }

      // Step 2: Send text to AI for table extraction
      const openai = getOpenAIClient()
      const truncatedText = fullText.length > 30000 ? fullText.slice(0, 30000) + "\n...(truncated)" : fullText

      if (mode === "detect") {
        return await this.parsePdfDetectMode(openai, truncatedText)
      } else {
        return await this.parsePdfFullMode(openai, truncatedText)
      }
    } catch (err) {
      console.error("[PDF Parser] Error:", err)
      return { rows: [], detectedColumns: [] }
    }
  }

  /**
   * Fast detect mode: ask AI for column names + row count + 5 sample rows.
   * Typically completes in 3-8 seconds.
   */
  private static async parsePdfDetectMode(
    openai: OpenAI,
    text: string
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    console.log("[PDF Parser] Detect mode: asking AI for columns + samples...")

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a document parser. Extract the structure of the main data table from this document.

Rules:
- Identify the main DATA TABLE (e.g. transactions, line items, entries)
- Do NOT confuse summary sections, headers, or account info with the data table
- Return the column names exactly as they appear in the document
- Return the FIRST 5 data rows as samples
- Count the TOTAL number of data rows across all pages (not just the 5 samples)
- Parse amounts as numbers, dates in original format
- IGNORE non-tabular content

Return JSON:
{
  "columns": ["Col1", "Col2", ...],
  "sampleRows": [{"Col1": "val", ...}, ...],
  "totalRowCount": 70,
  "documentType": "credit_card_statement" | "bank_statement" | "invoice" | "ledger" | "other"
}`,
        },
        {
          role: "user",
          content: `Detect the table structure in this document:\n\n${text}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return { rows: [], detectedColumns: [] }

    const parsed = JSON.parse(content)
    const columns: string[] = parsed.columns || []
    const sampleRows: Record<string, any>[] = parsed.sampleRows || []
    const totalRowCount: number = parsed.totalRowCount || sampleRows.length

    console.log(`[PDF Parser] Detected ${columns.length} columns, ${totalRowCount} total rows (${sampleRows.length} samples, type: ${parsed.documentType})`)

    if (columns.length === 0) return { rows: [], detectedColumns: [] }

    const detectedColumns = columns.map((label: string) => ({
      key: label,
      label,
      sampleValues: sampleRows.slice(0, 3).map((r: Record<string, any>) => String(r[label] ?? "")),
    }))

    // Return sample rows but with the real total count
    // Create placeholder rows so rowCount reflects the true document size
    const placeholderRows = Array.from({ length: totalRowCount }, (_, i) => {
      if (i < sampleRows.length) return sampleRows[i]
      // Placeholder row with column keys
      const row: Record<string, any> = {}
      for (const col of columns) row[col] = ""
      return row
    })

    return { rows: placeholderRows, detectedColumns }
  }

  /**
   * Full extraction mode: ask AI to extract ALL rows from the document.
   * Can take 30-60 seconds for large documents.
   */
  private static async parsePdfFullMode(
    openai: OpenAI,
    text: string
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    console.log("[PDF Parser] Full mode: extracting ALL rows...")

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a document parser specializing in extracting structured tabular data. Extract the COMPLETE data table.

Rules:
- Identify the main DATA TABLE (transactions, line items, entries)
- Do NOT confuse summary sections, headers, or account info with the data table
- Extract ALL rows -- every single row, not just a sample
- Use column names exactly as they appear in the document
- Include data from ALL pages (continuation pages too)
- Parse amounts as numbers (remove currency symbols, handle negatives/parentheses)
- Parse dates in original format
- IGNORE non-tabular content: summaries, footers, page numbers, disclaimers

Return JSON:
{
  "columns": ["Col1", "Col2", ...],
  "rows": [{"Col1": "val", ...}, ...]
}`,
        },
        {
          role: "user",
          content: `Extract ALL rows from the data table in this document:\n\n${text}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 16000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return { rows: [], detectedColumns: [] }

    const parsed = JSON.parse(content)
    const columns: string[] = parsed.columns || []
    const rawRows: Record<string, any>[] = parsed.rows || []

    console.log(`[PDF Parser] Full extraction: ${columns.length} columns, ${rawRows.length} rows`)

    if (columns.length === 0 || rawRows.length === 0) {
      return { rows: [], detectedColumns: [] }
    }

    const detectedColumns = columns.map((label: string) => ({
      key: label,
      label,
      sampleValues: rawRows.slice(0, 3).map((r: Record<string, any>) => String(r[label] ?? "")),
    }))

    return { rows: rawRows, detectedColumns }
  }

  /**
   * Remap raw rows to match the configured column definitions.
   * Maps detected column labels → config column keys.
   */
  private static remapRows(
    rawRows: Record<string, any>[],
    configColumns: SourceColumnDef[],
    detectedColumns: { key: string; label: string }[]
  ): Record<string, any>[] {
    // Build a mapping from detected column label → config column key
    // Try exact match first, then case-insensitive match
    const mapping = new Map<string, string>()
    for (const configCol of configColumns) {
      // Look for exact label match in detected columns
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
      // Also keep unmapped columns with original keys
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
   * Returns suggested type for each column.
   */
  static detectColumnTypes(
    detectedColumns: { key: string; label: string; sampleValues: string[] }[]
  ): { key: string; label: string; suggestedType: SourceColumnDef["type"] }[] {
    return detectedColumns.map((col) => {
      const label = col.label.toLowerCase()
      const samples = col.sampleValues.map((s) => String(s).trim())

      // Check if date-like
      if (
        label.includes("date") ||
        label.includes("posted") ||
        label.includes("effective") ||
        samples.some((s) => /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s))
      ) {
        return { key: col.key, label: col.label, suggestedType: "date" as const }
      }

      // Check if amount-like
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

      // Check if reference-like
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
