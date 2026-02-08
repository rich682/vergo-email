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
   * Parse PDF file -- uses positional text extraction to reconstruct tabular layout,
   * then falls back to AI extraction if the positional approach yields poor results.
   */
  private static async parsePdf(buffer: Buffer): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    try {
      // Step 1: Extract positioned text items from the PDF
      const pdfText = await this.extractPdfTextWithPositions(buffer)

      if (!pdfText || pdfText.fullText.length < 20) {
        return { rows: [], detectedColumns: [] }
      }

      // Step 2: Try positional row/column reconstruction
      const positionalResult = this.reconstructTableFromPositions(pdfText.items, pdfText.pageHeight)

      // If positional extraction found a reasonable table (3+ columns, 2+ rows), use it
      if (positionalResult.detectedColumns.length >= 3 && positionalResult.rows.length >= 2) {
        return positionalResult
      }

      // Step 3: Fall back to AI-powered extraction
      const aiResult = await this.extractTableWithAI(pdfText.fullText)
      if (aiResult.rows.length > 0 && aiResult.detectedColumns.length >= 2) {
        return aiResult
      }

      // If AI also failed but positional had something, return that
      if (positionalResult.rows.length > 0) return positionalResult

      return { rows: [], detectedColumns: [] }
    } catch (err) {
      console.error("[PDF Parser] Error:", err)
      return { rows: [], detectedColumns: [] }
    }
  }

  /**
   * Extract text items with their x/y positions from a PDF buffer.
   */
  private static async extractPdfTextWithPositions(buffer: Buffer): Promise<{
    items: { str: string; x: number; y: number; width: number; page: number }[]
    fullText: string
    pageHeight: number
  }> {
    const pdfjsLib = await import("pdfjs-dist")
    const data = new Uint8Array(buffer)
    const loadingTask = pdfjsLib.getDocument({ data })
    const pdf = await loadingTask.promise

    const allItems: { str: string; x: number; y: number; width: number; page: number }[] = []
    const textParts: string[] = []
    let firstPageHeight = 792 // default US letter

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.0 })
      if (pageNum === 1) firstPageHeight = viewport.height
      const textContent = await page.getTextContent()

      const pageTextParts: string[] = []
      for (const item of textContent.items) {
        const ti = item as any
        if (!ti.str || ti.str.trim() === "") continue

        // transform[4] = x, transform[5] = y (PDF coordinate: bottom-up)
        const x = ti.transform?.[4] ?? 0
        const rawY = ti.transform?.[5] ?? 0
        // Flip y so top-of-page = 0
        const y = viewport.height - rawY
        const width = ti.width ?? 0

        allItems.push({ str: ti.str.trim(), x, y, width, page: pageNum })
        pageTextParts.push(ti.str)
      }
      textParts.push(pageTextParts.join(" "))
    }

    return { items: allItems, fullText: textParts.join("\n"), pageHeight: firstPageHeight }
  }

  /**
   * Reconstruct a table from positioned text items by clustering y-coordinates into rows
   * and x-coordinates into columns.
   */
  private static reconstructTableFromPositions(
    items: { str: string; x: number; y: number; width: number; page: number }[],
    pageHeight: number
  ): { rows: Record<string, any>[]; detectedColumns: { key: string; label: string; sampleValues: string[] }[] } {
    if (items.length === 0) return { rows: [], detectedColumns: [] }

    // Sort items top-to-bottom, left-to-right (accounting for pages)
    const sorted = [...items].sort((a, b) => {
      const pageDiff = a.page - b.page
      if (pageDiff !== 0) return pageDiff
      const yDiff = a.y - b.y
      if (Math.abs(yDiff) > 3) return yDiff // same row if y within 3pt
      return a.x - b.x
    })

    // Cluster items into rows by y-position (within 4pt tolerance)
    const rowClusters: { y: number; page: number; items: typeof sorted }[] = []
    for (const item of sorted) {
      const existing = rowClusters.find(
        (c) => c.page === item.page && Math.abs(c.y - item.y) < 4
      )
      if (existing) {
        existing.items.push(item)
        existing.y = (existing.y + item.y) / 2 // running average
      } else {
        rowClusters.push({ y: item.y, page: item.page, items: [item] })
      }
    }

    // Sort row clusters top-to-bottom across pages
    rowClusters.sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page
      return a.y - b.y
    })

    // Sort items within each row left-to-right
    for (const cluster of rowClusters) {
      cluster.items.sort((a, b) => a.x - b.x)
    }

    // Find rows that look like table data (similar number of items, consistent x-positions)
    // First, find the most common item count per row (likely the table width)
    const itemCounts = rowClusters.map((c) => c.items.length)
    const countFreq = new Map<number, number>()
    for (const count of itemCounts) {
      if (count >= 2) countFreq.set(count, (countFreq.get(count) || 0) + 1)
    }

    // Find the most frequent count that appears enough to be a table
    let bestCount = 0
    let bestFreq = 0
    for (const [count, freq] of countFreq) {
      if (freq > bestFreq || (freq === bestFreq && count > bestCount)) {
        bestCount = count
        bestFreq = freq
      }
    }

    if (bestFreq < 2) {
      // No consistent table structure found -- try merging adjacent items
      // into cells based on x-gap analysis
      return this.reconstructWithXGapAnalysis(rowClusters)
    }

    // Filter to rows matching the table width (±1 tolerance)
    const tableRows = rowClusters.filter(
      (c) => Math.abs(c.items.length - bestCount) <= 1
    )

    if (tableRows.length < 2) return { rows: [], detectedColumns: [] }

    // Use the first table row as potential headers, or generate column names
    // Detect columns from x-positions of items in the densest rows
    const colCount = bestCount
    const headerRow = tableRows[0]
    const headers = headerRow.items.slice(0, colCount).map((item, idx) => {
      const label = item.str.replace(/\s+/g, " ").trim()
      return label || `Column ${idx + 1}`
    })

    // Check if headers look like actual headers (contain letters, not just numbers)
    const looksLikeHeaders = headers.some((h) => /[a-zA-Z]{2,}/.test(h))
    const dataStart = looksLikeHeaders ? 1 : 0

    const rows: Record<string, any>[] = []
    for (let i = dataStart; i < tableRows.length; i++) {
      const cluster = tableRows[i]
      const row: Record<string, any> = {}
      let hasData = false
      for (let j = 0; j < headers.length; j++) {
        const val = cluster.items[j]?.str || ""
        row[headers[j]] = val
        if (val.trim()) hasData = true
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
   * Alternative reconstruction using x-gap analysis: merge text items into cells
   * based on horizontal gaps, then detect columns from consistent patterns.
   */
  private static reconstructWithXGapAnalysis(
    rowClusters: { y: number; page: number; items: { str: string; x: number; width: number }[] }[]
  ): { rows: Record<string, any>[]; detectedColumns: { key: string; label: string; sampleValues: string[] }[] } {
    // For each row, merge items that are close together (gap < 10pt) into cells
    const mergedRows: string[][] = []

    for (const cluster of rowClusters) {
      if (cluster.items.length === 0) continue

      const cells: string[] = []
      let currentCell = cluster.items[0].str
      let lastRight = cluster.items[0].x + cluster.items[0].width

      for (let i = 1; i < cluster.items.length; i++) {
        const item = cluster.items[i]
        const gap = item.x - lastRight

        if (gap > 15) {
          // Large gap = new cell
          cells.push(currentCell.trim())
          currentCell = item.str
        } else {
          // Small gap = same cell, append with space
          currentCell += " " + item.str
        }
        lastRight = item.x + item.width
      }
      cells.push(currentCell.trim())
      if (cells.some((c) => c.length > 0)) mergedRows.push(cells)
    }

    if (mergedRows.length < 2) return { rows: [], detectedColumns: [] }

    // Find the most common cell count
    const cellCounts = mergedRows.map((r) => r.length)
    const freq = new Map<number, number>()
    for (const c of cellCounts) {
      if (c >= 2) freq.set(c, (freq.get(c) || 0) + 1)
    }

    let bestCount = 0
    let bestFreq = 0
    for (const [count, f] of freq) {
      if (f > bestFreq || (f === bestFreq && count > bestCount)) {
        bestCount = count
        bestFreq = f
      }
    }

    if (bestFreq < 2 || bestCount < 2) return { rows: [], detectedColumns: [] }

    // Filter to rows matching the dominant cell count (±1)
    const tableRows = mergedRows.filter((r) => Math.abs(r.length - bestCount) <= 1)
    if (tableRows.length < 2) return { rows: [], detectedColumns: [] }

    // Use first row as headers if it looks like text
    const headerCandidates = tableRows[0]
    const looksLikeHeaders = headerCandidates.some((h) => /[a-zA-Z]{2,}/.test(h))

    const headers = looksLikeHeaders
      ? headerCandidates.map((h, i) => h || `Column ${i + 1}`)
      : Array.from({ length: bestCount }, (_, i) => `Column ${i + 1}`)

    const dataStart = looksLikeHeaders ? 1 : 0
    const rows: Record<string, any>[] = []

    for (let i = dataStart; i < tableRows.length; i++) {
      const cells = tableRows[i]
      const row: Record<string, any> = {}
      let hasData = false
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = cells[j] || ""
        if (cells[j]?.trim()) hasData = true
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
   * AI-powered table extraction: send the raw PDF text to GPT and ask it to
   * identify and extract the primary data table as structured JSON.
   */
  private static async extractTableWithAI(
    fullText: string
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: { key: string; label: string; sampleValues: string[] }[] }> {
    try {
      const openai = getOpenAIClient()

      // Truncate text to avoid token limits (send first ~8000 chars which is usually enough)
      const truncatedText = fullText.length > 8000 ? fullText.slice(0, 8000) + "\n...(truncated)" : fullText

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a financial document parser. Your job is to extract the primary data table from financial documents like bank statements, credit card statements, invoices, ledgers, etc.

Rules:
- Identify the main transaction/data table in the document
- Extract ALL rows of data (not just a sample)
- Determine clear column names from the document headers
- For credit card / bank statements, typical columns include: Transaction Date, Post Date, Reference Number, Description, Amount
- If there are continuation pages (e.g. "Transactions continued"), include data from all pages
- Parse amounts as numbers (remove $ signs, handle negatives)
- Parse dates consistently (keep original format)
- Ignore non-tabular content like account summaries, payment warnings, page footers, etc.
- If you cannot find a clear data table, return empty arrays

Return JSON with this exact structure:
{
  "columns": ["Column Name 1", "Column Name 2", ...],
  "rows": [
    {"Column Name 1": "value", "Column Name 2": "value", ...},
    ...
  ],
  "documentType": "credit_card_statement" | "bank_statement" | "invoice" | "ledger" | "other",
  "confidence": "high" | "medium" | "low"
}`
          },
          {
            role: "user",
            content: `Extract the data table from this financial document:\n\n${truncatedText}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4000,
      })

      const content = completion.choices[0]?.message?.content
      if (!content) return { rows: [], detectedColumns: [] }

      const parsed = JSON.parse(content)
      const columns: string[] = parsed.columns || []
      const rawRows: Record<string, any>[] = parsed.rows || []

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
      console.error("[PDF Parser] AI extraction failed:", err)
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
