/**
 * ReconciliationFileParserService
 * Parses uploaded Excel/CSV/PDF files into structured row data for reconciliation.
 * Uses the same libraries as the existing attachment-extraction and excel-utils services.
 * PDF parsing uses positional text extraction + AI fallback for robust tabular detection.
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
   */
  static async parseFile(
    buffer: Buffer,
    filename: string,
    sourceConfig?: SourceConfig
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
   * Parse PDF file by sending the raw PDF bytes directly to GPT-4o-mini.
   * This avoids all pdfjs-dist / DOMMatrix / canvas issues in serverless environments.
   * GPT-4o-mini natively reads PDF files via the file attachment API.
   */
  private static async parsePdf(buffer: Buffer): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    try {
      console.log("[PDF Parser] Sending PDF directly to AI for extraction...")
      const openai = getOpenAIClient()

      const base64 = buffer.toString("base64")

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a document parser specializing in extracting structured tabular data from PDFs. You handle any document type: financial statements, bank/credit card statements, invoices, ledgers, payroll reports, inventory lists, general accounting reports, or any document containing a data table.

Rules:
- First, understand what type of document this is from its content
- Identify the main DATA TABLE in the document -- the primary repeating rows of data (e.g. transactions, line items, entries)
- Do NOT confuse summary sections, headers, or account info with the data table
- Extract ALL rows of data -- every single row, not just a sample
- Determine clear column names from the table headers as they appear in the document
- Use the column names exactly as they appear in the document. Do NOT invent or rename columns
- If there are continuation pages (e.g. "continued on next page"), include data from ALL pages
- Parse amounts as numbers (remove currency symbols, handle negatives/parentheses, keep decimals)
- Parse dates consistently (keep original format)
- IGNORE non-tabular content: summaries, warnings, page footers, page numbers, disclaimers
- IGNORE rows that are clearly footer/header artifacts (e.g. "PAGE 1 of 4", account numbers, footer codes)
- If a row has sub-lines (e.g. foreign currency conversions, memo lines), merge them into the parent row or skip them
- If you cannot find a clear data table, return empty arrays

Return JSON with this exact structure:
{
  "columns": ["Column Name 1", "Column Name 2", ...],
  "rows": [
    {"Column Name 1": "value", "Column Name 2": "value", ...},
    ...
  ],
  "documentType": "credit_card_statement" | "bank_statement" | "invoice" | "ledger" | "payroll" | "inventory" | "other",
  "confidence": "high" | "medium" | "low"
}`,
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: `data:application/pdf;base64,${base64}`,
                },
              } as any,
              {
                type: "text",
                text: "Extract the main data table from this document. Return ALL rows.",
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 16000,
      })

      const content = completion.choices[0]?.message?.content
      if (!content) {
        console.log("[PDF Parser] No response from AI")
        return { rows: [], detectedColumns: [] }
      }

      const parsed = JSON.parse(content)
      const columns: string[] = parsed.columns || []
      const rawRows: Record<string, any>[] = parsed.rows || []

      console.log(`[PDF Parser] AI extracted ${columns.length} columns, ${rawRows.length} rows (type: ${parsed.documentType}, confidence: ${parsed.confidence})`)

      if (columns.length === 0 || rawRows.length === 0) {
        return { rows: [], detectedColumns: [] }
      }

      const detectedColumns = columns.map((label: string) => ({
        key: label,
        label,
        sampleValues: rawRows.slice(0, 3).map((r: Record<string, any>) => String(r[label] ?? "")),
      }))

      return { rows: rawRows, detectedColumns }
    } catch (err) {
      console.error("[PDF Parser] Error:", err)
      return { rows: [], detectedColumns: [] }
    }
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
