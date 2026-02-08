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
      // Step 1: Extract text from the PDF
      console.log("[PDF Parser] Step 1: Extracting text from PDF...")
      const pdfText = await this.extractPdfTextWithPositions(buffer)
      console.log(`[PDF Parser] Extracted ${pdfText.items.length} text items, fullText length: ${pdfText.fullText.length}`)

      if (!pdfText || pdfText.fullText.length < 20) {
        console.log("[PDF Parser] Not enough text extracted, returning empty")
        return { rows: [], detectedColumns: [] }
      }

      // Step 2: Try AI extraction FIRST for PDFs -- it's far more reliable for
      // complex financial documents (statements, invoices, ledgers) because it
      // understands context and can identify the primary transaction table
      // amidst summaries, headers, footers, etc.
      console.log("[PDF Parser] Step 2: Attempting AI-powered extraction...")
      try {
        const aiResult = await this.extractTableWithAI(pdfText.fullText)
        console.log(`[PDF Parser] AI result: ${aiResult.detectedColumns.length} columns, ${aiResult.rows.length} rows`)

        if (aiResult.rows.length >= 2 && aiResult.detectedColumns.length >= 2) {
          console.log("[PDF Parser] Using AI result")
          return aiResult
        }
      } catch (aiErr) {
        console.error("[PDF Parser] AI extraction error:", aiErr)
      }

      // Step 3: Fall back to positional extraction if AI failed or is unavailable
      console.log("[PDF Parser] Step 3: Falling back to positional extraction...")
      const positionalResult = this.reconstructTableFromPositions(pdfText.items, pdfText.pageHeight)
      console.log(`[PDF Parser] Positional result: ${positionalResult.detectedColumns.length} columns, ${positionalResult.rows.length} rows`)

      if (positionalResult.rows.length > 0) {
        return positionalResult
      }

      console.log("[PDF Parser] All extraction methods failed, returning empty")
      return { rows: [], detectedColumns: [] }
    } catch (err) {
      console.error("[PDF Parser] Error:", err)
      return { rows: [], detectedColumns: [] }
    }
  }

  /**
   * Extract text items with their x/y positions from a PDF buffer.
   * Uses raw PDF coordinates (y increases upward, so higher y = higher on page).
   * Items are sorted into reading order: descending y (top-first), then ascending x (left-first).
   */
  private static async extractPdfTextWithPositions(buffer: Buffer): Promise<{
    items: { str: string; x: number; y: number; width: number; page: number }[]
    fullText: string
    pageHeight: number
  }> {
    // Use legacy build for Node.js compatibility (standard build requires DOMMatrix)
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const data = new Uint8Array(buffer)
    const loadingTask = pdfjsLib.getDocument({ data })
    const pdf = await loadingTask.promise

    const allItems: { str: string; x: number; y: number; width: number; page: number }[] = []
    const textParts: string[] = []
    let maxY = 0

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()

      const pageTextParts: string[] = []
      for (const item of textContent.items) {
        const ti = item as any
        if (!ti.str || ti.str.trim() === "") continue

        // transform[4] = x, transform[5] = y (raw PDF coordinate: bottom-up)
        const x = ti.transform?.[4] ?? 0
        const y = ti.transform?.[5] ?? 0
        const width = ti.width ?? 0

        if (y > maxY) maxY = y

        allItems.push({ str: ti.str.trim(), x, y, width, page: pageNum })
        pageTextParts.push(ti.str)
      }
      textParts.push(pageTextParts.join(" "))
    }

    return { items: allItems, fullText: textParts.join("\n"), pageHeight: maxY }
  }

  /**
   * Reconstruct a table from positioned text items by clustering y-coordinates into rows
   * and x-coordinates into columns.
   * Uses raw PDF coordinates: higher y = higher on page, so reading order = descending y.
   */
  private static reconstructTableFromPositions(
    items: { str: string; x: number; y: number; width: number; page: number }[],
    pageHeight: number
  ): { rows: Record<string, any>[]; detectedColumns: { key: string; label: string; sampleValues: string[] }[] } {
    if (items.length === 0) return { rows: [], detectedColumns: [] }

    // Sort items in reading order: page ascending, then y descending (top first), then x ascending
    const sorted = [...items].sort((a, b) => {
      const pageDiff = a.page - b.page
      if (pageDiff !== 0) return pageDiff
      const yDiff = b.y - a.y // descending y = top of page first
      if (Math.abs(yDiff) > 3) return yDiff
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

    // Sort row clusters in reading order: page ascending, y descending (top-of-page first)
    rowClusters.sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page
      return b.y - a.y // descending = top first
    })

    // Sort items within each row left-to-right
    for (const cluster of rowClusters) {
      cluster.items.sort((a, b) => a.x - b.x)
    }

    // Always use x-gap merge approach: PDF text items are often fragmented
    // (each word is a separate item), so we need to merge nearby items into cells
    return this.reconstructWithXGapAnalysis(rowClusters)
  }

  /**
   * Alternative reconstruction using x-gap analysis: merge text items into cells
   * based on horizontal gaps, then detect columns from consistent patterns.
   */
  private static reconstructWithXGapAnalysis(
    rowClusters: { y: number; page: number; items: { str: string; x: number; width: number }[] }[]
  ): { rows: Record<string, any>[]; detectedColumns: { key: string; label: string; sampleValues: string[] }[] } {
    // For each row, sort items left-to-right, then merge nearby items into cells
    const mergedRows: string[][] = []

    for (const cluster of rowClusters) {
      if (cluster.items.length === 0) continue

      // Sort items left-to-right within the row
      const sortedItems = [...cluster.items].sort((a, b) => a.x - b.x)

      const cells: string[] = []
      let currentCell = sortedItems[0].str
      // Use item width if available, otherwise estimate ~6pt per character
      let lastRight = sortedItems[0].x + (sortedItems[0].width || sortedItems[0].str.length * 4)

      for (let i = 1; i < sortedItems.length; i++) {
        const item = sortedItems[i]
        const gap = item.x - lastRight

        if (gap > 12) {
          // Large gap = new cell
          cells.push(currentCell.trim())
          currentCell = item.str
        } else {
          // Small gap = same cell, append with space
          currentCell += " " + item.str
        }
        lastRight = item.x + (item.width || item.str.length * 4)
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

      // Send up to 30K chars to capture multi-page documents fully
      // GPT-4o-mini handles up to 128K tokens so this is well within limits
      const truncatedText = fullText.length > 30000 ? fullText.slice(0, 30000) + "\n...(truncated)" : fullText

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a financial document parser. Your job is to extract the primary data table from financial documents like bank statements, credit card statements, invoices, ledgers, etc.

The text you receive is extracted from a PDF using automated tools, so it may be messy -- words may run together, columns may not align perfectly, and there may be extra spaces or concatenated text. Use your understanding of financial documents to parse through the noise.

Rules:
- Identify the main TRANSACTION / LINE ITEM table in the document (not the account summary)
- Extract ALL rows of data -- every single transaction, not just a sample
- Determine clear column names from the table headers
- For credit card / bank statements, typical columns include: Transaction Date, Post Date, Reference Number, Description, Amount
- For bank statements: Date, Description, Withdrawals, Deposits, Balance
- If there are continuation pages (e.g. "Transactions continued on next page"), include data from ALL pages
- Parse amounts as numbers (remove $ signs, handle negatives, keep decimals)
- Parse dates consistently (keep original format like MM/DD)
- IGNORE non-tabular content: account summaries, payment warnings, page footers, page numbers, account info
- IGNORE rows that are clearly footer/header artifacts (e.g. "PAGE 1 of 4", account numbers, footer codes)
- If a transaction has a foreign currency conversion line below it (e.g. "GB POUND STERLNG 44.98 X 1.358..."), merge the conversion info into the parent transaction or skip it
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
            content: `Extract the transaction table from this financial document:\n\n${truncatedText}`
          }
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
