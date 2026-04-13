/**
 * ReconciliationFileParserService
 * Parses uploaded Excel/CSV/PDF files into structured row data for reconciliation.
 * Uses the same libraries as the existing attachment-extraction and excel-utils services.
 * PDF parsing uses `unpdf` for serverless-friendly text extraction + AI for table detection.
 */
import * as XLSX from "xlsx"
import OpenAI from "openai"
import { getOpenAIClient } from "@/lib/utils/openai-client"
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
   *
   * For PDFs, use mode="detect" (default) for fast column detection + row count,
   * or mode="full" to extract every row (slower, used during actual reconciliation).
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

    // Merge extraction profile from sourceConfig if not provided directly
    const profile = extractionProfile || sourceConfig?.extractionProfile

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
      const result = await this.parsePdf(buffer, mode, profile)
      rawRows = result.rows
      detectedColumns = result.detectedColumns
      if (result.rows.length === 0) {
        warnings.push("Could not extract tabular data from PDF. Try providing document description and extraction hints.")
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
   * Render PDF pages to base64 data URLs for vision-based extraction.
   * Limits to maxPages to control cost/tokens.
   * Uses @napi-rs/canvas for Node.js environments.
   */
  private static async renderPdfPagesToBase64(
    buffer: Buffer,
    maxPages: number = 5
  ): Promise<string[]> {
    const { renderPageAsImage } = await import("unpdf")
    const data = new Uint8Array(buffer)

    // Get page count via getMeta
    const { getMeta } = await import("unpdf")
    const meta = await getMeta(data)
    const pageCount = Math.min(meta.info?.pages ?? 1, maxPages)
    const dataUrls: string[] = []

    for (let i = 1; i <= pageCount; i++) {
      try {
        const dataUrl = await renderPageAsImage(data, i, {
          scale: 2.0,
          toDataURL: true,
          canvasImport: () => import("@napi-rs/canvas"),
        })
        dataUrls.push(dataUrl as string)
      } catch (pageErr) {
        console.warn(`[PDF Parser] Failed to render page ${i}, skipping:`, (pageErr as Error).message)
      }
    }

    return dataUrls
  }

  /**
   * Vision-based PDF parsing fallback: renders pages to images and sends to GPT-4o.
   * If page rendering fails (complex fonts/patterns), falls back to sending
   * the raw PDF as a file input to GPT-4o.
   * Used when text extraction fails (scanned PDFs, complex layouts).
   */
  private static async parsePdfWithVision(
    buffer: Buffer,
    mode: "detect" | "full",
    extractionProfile?: ExtractionProfile
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    // Try rendering pages to images first — increased page limits for better coverage
    console.log("[PDF Parser] Vision fallback: rendering pages to images...")
    let dataUrls: string[] = []
    try {
      dataUrls = await this.renderPdfPagesToBase64(buffer, mode === "detect" ? 5 : 15)
    } catch (renderErr) {
      console.warn("[PDF Parser] Vision fallback: render failed:", (renderErr as Error).message)
    }
    console.log(`[PDF Parser] Rendered ${dataUrls.length} pages to images`)

    const openai = getOpenAIClient()

    // Build content parts: use rendered images if available, otherwise send raw PDF as file
    let fileContent: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    if (dataUrls.length > 0) {
      fileContent = dataUrls.map(
        (url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })
      )
    } else {
      console.log("[PDF Parser] Vision fallback: sending raw PDF as file input...")
      const base64Pdf = buffer.toString("base64")
      fileContent = [
        {
          type: "file" as any,
          file: { data: base64Pdf, filename: "document.pdf" },
        } as any,
      ]
    }

    const profileContext = this.buildProfileContext(extractionProfile)

    const systemPrompt =
      mode === "detect"
        ? `You are a document parser. Extract the structure of the main data table from this document.

Rules:
- Identify the main DATA TABLE (e.g. transactions, line items, entries)
- Do NOT confuse summary sections, headers, or account info with the data table
- Documents may contain MULTIPLE tables or sections (e.g. different cardholders, "Purchasing Activity" and "Travel Activity") — COMBINE all transaction sections into a single unified table
- Transaction tables may NOT start on page 1 — look through ALL pages
- If there are multiple sections per cardholder or category, add a column for the section name
- Return the column names exactly as they appear, or infer clean names from the layout
- Return the FIRST 5 data rows as samples
- Count the TOTAL number of data rows across ALL sections and pages (not just the 5 samples)
- Parse amounts as numbers, dates in original format
- IGNORE non-tabular content
${profileContext}
Return JSON:
{
  "columns": ["Col1", "Col2", ...],
  "sampleRows": [{"Col1": "val", ...}, ...],
  "totalRowCount": 70,
  "documentType": "credit_card_statement" | "bank_statement" | "invoice" | "ledger" | "other"
}`
        : `You are a document parser specializing in extracting structured tabular data. Extract the COMPLETE data table from this document.

Rules:
- Identify the main DATA TABLE (transactions, line items, entries)
- Do NOT confuse summary sections, headers, or account info with the data table
- Documents may contain MULTIPLE tables or sections — COMBINE all transaction sections into a single unified table
- Transaction tables may NOT start on page 1 — look through ALL pages
- If there are multiple sections per cardholder or category, add a column for the section name
- Extract ALL rows -- every single row from every section, not just a sample
- Use column names exactly as they appear, or infer clean names from the layout
- Include data from ALL pages (continuation pages too)
- Parse amounts as numbers (remove currency symbols, handle negatives/parentheses)
- Parse dates in original format
- IGNORE non-tabular content: summaries, footers, page numbers, disclaimers
${profileContext}
Return JSON:
{
  "columns": ["Col1", "Col2", ...],
  "rows": [{"Col1": "val", ...}, ...]
}`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            ...fileContent,
            {
              type: "text" as const,
              text:
                mode === "detect"
                  ? "Detect the table structure in this document."
                  : "Extract ALL rows from the data table in this document.",
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: mode === "detect" ? 2000 : 16000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return { rows: [], detectedColumns: [] }

    const parsed = JSON.parse(content)
    const columns: string[] = parsed.columns || []

    if (columns.length === 0) return { rows: [], detectedColumns: [] }

    if (mode === "detect") {
      const sampleRows: Record<string, any>[] = parsed.sampleRows || []
      const totalRowCount: number = parsed.totalRowCount || sampleRows.length

      console.log(
        `[PDF Parser] Vision detect: ${columns.length} columns, ${totalRowCount} total rows (${sampleRows.length} samples, type: ${parsed.documentType})`
      )

      const detectedColumns = columns.map((label: string) => ({
        key: label,
        label,
        sampleValues: sampleRows.slice(0, 3).map((r: Record<string, any>) => String(r[label] ?? "")),
      }))

      const placeholderRows = Array.from({ length: totalRowCount }, (_, i) => {
        if (i < sampleRows.length) return sampleRows[i]
        const row: Record<string, any> = {}
        for (const col of columns) row[col] = ""
        return row
      })

      return { rows: placeholderRows, detectedColumns }
    } else {
      const rawRows: Record<string, any>[] = parsed.rows || []
      console.log(`[PDF Parser] Vision full: ${columns.length} columns, ${rawRows.length} rows`)

      if (rawRows.length === 0) return { rows: [], detectedColumns: [] }

      const detectedColumns = columns.map((label: string) => ({
        key: label,
        label,
        sampleValues: rawRows.slice(0, 3).map((r: Record<string, any>) => String(r[label] ?? "")),
      }))

      return { rows: rawRows, detectedColumns }
    }
  }

  /**
   * Send the raw PDF as a file input to GPT-4o — no canvas or page rendering needed.
   * This is the most reliable serverless-friendly vision approach.
   */
  private static async parsePdfRawFile(
    buffer: Buffer,
    mode: "detect" | "full",
    extractionProfile?: ExtractionProfile
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    const openai = getOpenAIClient()
    const base64Pdf = buffer.toString("base64")
    const profileContext = this.buildProfileContext(extractionProfile)

    const systemPrompt = mode === "detect"
      ? `You are a document parser. Extract the structure of the main data table from this PDF.

Rules:
- Identify the main DATA TABLE (e.g. transactions, line items, entries)
- Do NOT confuse summary sections, headers, or account info with the data table
- Documents may contain MULTIPLE tables or sections (e.g. different cardholders, "Purchasing Activity" and "Travel Activity") — COMBINE all transaction sections into a single unified table
- Transaction tables may NOT start on page 1 — look through ALL pages
- If there are multiple sections per cardholder or category, add a column for the section name
- Return the column names exactly as they appear, or infer clean names from the layout
- Return the FIRST 5 data rows as samples
- Count the TOTAL number of data rows across ALL sections and pages
- Parse amounts as numbers, dates in original format
- IGNORE non-tabular content
${profileContext}
Return JSON:
{
  "columns": ["Col1", "Col2", ...],
  "sampleRows": [{"Col1": "val", ...}, ...],
  "totalRowCount": 70,
  "documentType": "credit_card_statement" | "bank_statement" | "invoice" | "ledger" | "other"
}`
      : `You are a document parser. Extract the COMPLETE data table from this PDF.

Rules:
- Identify the main DATA TABLE (transactions, line items, entries)
- Documents may contain MULTIPLE tables or sections — COMBINE all into one unified table
- Transaction tables may NOT start on page 1 — look through ALL pages
- If multiple sections, add a column for the section name
- Extract ALL rows from every section, not just a sample
- Parse amounts as numbers, dates in original format
- IGNORE non-tabular content
${profileContext}
Return JSON:
{
  "columns": ["Col1", "Col2", ...],
  "rows": [{"Col1": "val", ...}, ...]
}`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "file" as any,
              file: { data: base64Pdf, filename: "document.pdf" },
            } as any,
            {
              type: "text" as const,
              text: mode === "detect"
                ? "Detect the table structure in this PDF document."
                : "Extract ALL rows from the data table in this PDF document.",
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: mode === "detect" ? 2000 : 16000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return { rows: [], detectedColumns: [] }

    const parsed = JSON.parse(content)
    const columns: string[] = parsed.columns || []
    if (columns.length === 0) return { rows: [], detectedColumns: [] }

    if (mode === "detect") {
      const sampleRows: Record<string, any>[] = parsed.sampleRows || []
      const totalRowCount: number = parsed.totalRowCount || sampleRows.length

      console.log(`[PDF Parser] Raw PDF detect: ${columns.length} columns, ${totalRowCount} total rows`)

      const detectedColumns = columns.map((label: string) => ({
        key: label,
        label,
        sampleValues: sampleRows.slice(0, 3).map((r: Record<string, any>) => String(r[label] ?? "")),
      }))

      const placeholderRows = Array.from({ length: totalRowCount }, (_, i) => {
        if (i < sampleRows.length) return sampleRows[i]
        const row: Record<string, any> = {}
        for (const col of columns) row[col] = ""
        return row
      })

      return { rows: placeholderRows, detectedColumns }
    } else {
      const rawRows: Record<string, any>[] = parsed.rows || []
      console.log(`[PDF Parser] Raw PDF full: ${columns.length} columns, ${rawRows.length} rows`)

      if (rawRows.length === 0) return { rows: [], detectedColumns: [] }

      const detectedColumns = columns.map((label: string) => ({
        key: label,
        label,
        sampleValues: rawRows.slice(0, 3).map((r: Record<string, any>) => String(r[label] ?? "")),
      }))

      return { rows: rawRows, detectedColumns }
    }
  }

  /**
   * Hybrid PDF parsing: sends BOTH extracted text AND rendered page images to GPT-4o.
   * This gives the AI both the exact character content and the spatial layout context,
   * making it much more effective for complex multi-section documents.
   */
  private static async parsePdfHybrid(
    buffer: Buffer,
    extractedText: string,
    mode: "detect" | "full",
    extractionProfile?: ExtractionProfile
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    console.log("[PDF Parser] Hybrid mode: sending text + page images to GPT-4o...")

    let dataUrls: string[] = []
    try {
      dataUrls = await this.renderPdfPagesToBase64(buffer, mode === "detect" ? 5 : 15)
    } catch (renderErr) {
      console.warn("[PDF Parser] Hybrid: page render failed:", (renderErr as Error).message)
      return { rows: [], detectedColumns: [] }
    }

    if (dataUrls.length === 0) return { rows: [], detectedColumns: [] }

    const openai = getOpenAIClient()
    const truncatedText = extractedText.length > 20000 ? extractedText.slice(0, 20000) + "\n...(truncated)" : extractedText
    const profileContext = this.buildProfileContext(extractionProfile)

    const systemPrompt = mode === "detect"
      ? `You are a document parser. You have BOTH the extracted text AND page images of this document.
Use the images to understand the visual layout and the text for exact values.

Rules:
- Identify the main DATA TABLE (e.g. transactions, line items, entries)
- Do NOT confuse summary sections, headers, or account info with the data table
- Documents may contain MULTIPLE tables or sections — COMBINE all into one unified table
- Transaction tables may NOT start on page 1 — check ALL pages
- If multiple sections per cardholder or category, add a column for the section name
- Return the FIRST 5 data rows as samples
- Count the TOTAL number of data rows across ALL sections and pages
- Parse amounts as numbers, dates in original format
- IGNORE non-tabular content
${profileContext}
Return JSON:
{
  "columns": ["Col1", "Col2", ...],
  "sampleRows": [{"Col1": "val", ...}, ...],
  "totalRowCount": 70,
  "documentType": "credit_card_statement" | "bank_statement" | "invoice" | "ledger" | "other"
}`
      : `You are a document parser. You have BOTH the extracted text AND page images of this document.
Use the images to understand the visual layout and the text for exact values.

Rules:
- Identify the main DATA TABLE (transactions, line items, entries)
- Documents may contain MULTIPLE tables or sections — COMBINE all into one unified table
- Transaction tables may NOT start on page 1 — check ALL pages
- If multiple sections, add a column for the section name
- Extract ALL rows from every section, not just a sample
- Parse amounts as numbers, dates in original format
- IGNORE non-tabular content
${profileContext}
Return JSON:
{
  "columns": ["Col1", "Col2", ...],
  "rows": [{"Col1": "val", ...}, ...]
}`

    const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = dataUrls.map(
      (url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })
    )

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            ...imageContent,
            {
              type: "text" as const,
              text: `Here is the extracted text from the same document for reference:\n\n${truncatedText}\n\n${
                mode === "detect"
                  ? "Detect the table structure using both the images and text above."
                  : "Extract ALL rows from the data table using both the images and text above."
              }`,
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: mode === "detect" ? 2000 : 16000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return { rows: [], detectedColumns: [] }

    const parsed = JSON.parse(content)
    const columns: string[] = parsed.columns || []
    if (columns.length === 0) return { rows: [], detectedColumns: [] }

    if (mode === "detect") {
      const sampleRows: Record<string, any>[] = parsed.sampleRows || []
      const totalRowCount: number = parsed.totalRowCount || sampleRows.length

      console.log(`[PDF Parser] Hybrid detect: ${columns.length} columns, ${totalRowCount} total rows (${sampleRows.length} samples)`)

      const detectedColumns = columns.map((label: string) => ({
        key: label,
        label,
        sampleValues: sampleRows.slice(0, 3).map((r: Record<string, any>) => String(r[label] ?? "")),
      }))

      const placeholderRows = Array.from({ length: totalRowCount }, (_, i) => {
        if (i < sampleRows.length) return sampleRows[i]
        const row: Record<string, any> = {}
        for (const col of columns) row[col] = ""
        return row
      })

      return { rows: placeholderRows, detectedColumns }
    } else {
      const rawRows: Record<string, any>[] = parsed.rows || []
      console.log(`[PDF Parser] Hybrid full: ${columns.length} columns, ${rawRows.length} rows`)

      if (rawRows.length === 0) return { rows: [], detectedColumns: [] }

      const detectedColumns = columns.map((label: string) => ({
        key: label,
        label,
        sampleValues: rawRows.slice(0, 3).map((r: Record<string, any>) => String(r[label] ?? "")),
      }))

      return { rows: rawRows, detectedColumns }
    }
  }

  /**
   * Build additional context for AI prompts from an extraction profile.
   */
  private static buildProfileContext(profile?: ExtractionProfile): string {
    if (!profile) return ""
    const parts: string[] = []
    if (profile.documentDescription) {
      parts.push(`DOCUMENT TYPE: ${profile.documentDescription}`)
    }
    if (profile.extractionHints) {
      parts.push(`USER HINTS: ${profile.extractionHints}`)
    }
    if (profile.expectedColumns && profile.expectedColumns.length > 0) {
      parts.push(`EXPECTED COLUMNS: ${JSON.stringify(profile.expectedColumns)}`)
    }
    if (profile.sampleExtraction && profile.sampleExtraction.length > 0) {
      parts.push(`EXAMPLE OF CORRECTLY PARSED ROWS:\n${JSON.stringify(profile.sampleExtraction.slice(0, 3), null, 2)}`)
    }
    return parts.length > 0 ? `\n\n--- User-provided context ---\n${parts.join("\n")}\n--- End context ---\n` : ""
  }

  /**
   * Parse PDF file using unpdf for text extraction + AI for table detection.
   * Falls back to hybrid (text+vision) then pure vision when text-only fails.
   *
   * mode="detect": Fast -- asks AI for column names, total row count, and 5 sample rows.
   * mode="full":   Slower -- asks AI to extract ALL rows.
   */
  private static async parsePdf(
    buffer: Buffer,
    mode: "detect" | "full" = "detect",
    extractionProfile?: ExtractionProfile
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    try {
      // Step 1: Extract text (fast, ~100ms)
      console.log("[PDF Parser] Extracting text with unpdf...")
      const fullText = await this.extractPdfText(buffer)
      console.log(`[PDF Parser] Extracted text: ${fullText.length} chars`)

      if (fullText.length < 20) {
        console.log("[PDF Parser] Not enough text, trying vision fallback...")
        return await this.parsePdfWithVision(buffer, mode, extractionProfile)
      }

      const openai = getOpenAIClient()
      const truncatedText = fullText.length > 30000 ? fullText.slice(0, 30000) + "\n...(truncated)" : fullText

      // Step 2: Try text-based extraction with gpt-4o (reliable for complex layouts)
      console.log("[PDF Parser] Trying text-based extraction with gpt-4o...")
      let result: { rows: Record<string, any>[]; detectedColumns: any[] }
      if (mode === "detect") {
        result = await this.parsePdfDetectMode(openai, truncatedText, extractionProfile)
      } else {
        result = await this.parsePdfFullMode(openai, truncatedText, extractionProfile)
      }

      if (result.detectedColumns.length > 0) {
        return result
      }

      // Step 3: Try sending raw PDF as a file to gpt-4o (no canvas rendering needed)
      console.log("[PDF Parser] Text-only found no columns, sending raw PDF to gpt-4o...")
      result = await this.parsePdfRawFile(buffer, mode, extractionProfile)
      if (result.detectedColumns.length > 0) {
        return result
      }

      // Step 4: Try hybrid text + vision (requires canvas — may fail on serverless)
      console.log("[PDF Parser] Raw PDF found no columns, trying hybrid text + vision...")
      try {
        result = await this.parsePdfHybrid(buffer, fullText, mode, extractionProfile)
        if (result.detectedColumns.length > 0) {
          return result
        }
      } catch (hybridErr) {
        console.warn("[PDF Parser] Hybrid fallback failed:", (hybridErr as Error).message)
      }

      // Step 5: Pure vision fallback (renders pages — may fail on serverless)
      console.log("[PDF Parser] Trying pure vision fallback...")
      try {
        return await this.parsePdfWithVision(buffer, mode, extractionProfile)
      } catch (visionErr) {
        console.warn("[PDF Parser] Vision fallback failed:", (visionErr as Error).message)
        return { rows: [], detectedColumns: [] }
      }
    } catch (err: any) {
      console.error("[PDF Parser] Error:", err?.message || err)
      // Surface API errors (rate limits, auth) instead of silently returning empty
      if (err?.status === 429 || err?.status === 401 || err?.status === 403) {
        throw new Error(`AI service error: ${err.message || "Rate limit or authentication issue"}`)
      }
      throw err // Surface the actual error so the API returns it
    }
  }

  /**
   * Fast detect mode: ask AI for column names + row count + 5 sample rows.
   * Uses gpt-4o for reliability with complex layouts.
   */
  private static async parsePdfDetectMode(
    openai: OpenAI,
    text: string,
    extractionProfile?: ExtractionProfile
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    console.log("[PDF Parser] Detect mode: asking AI for columns + samples...")
    const profileContext = this.buildProfileContext(extractionProfile)

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a document parser. Extract the structure of the main data table from this document.

Rules:
- Identify the main DATA TABLE (e.g. transactions, line items, entries)
- Do NOT confuse summary sections, headers, or account info with the data table
- Documents may contain MULTIPLE tables or sections (e.g. different cardholders, "Purchasing Activity" and "Travel Activity" sections) — COMBINE all transaction sections into a single unified table
- Transaction tables may NOT start on page 1 — look through ALL pages. Page 1 often contains only summary/account info
- If the document has multiple sections per cardholder or category, add a column for the section name (e.g. "Cardholder", "Activity Type")
- Return the column names exactly as they appear, or infer clean names from the layout
- Return the FIRST 5 data rows as samples
- Count the TOTAL number of data rows across ALL sections and pages (not just the 5 samples)
- Parse amounts as numbers, dates in original format
- IGNORE non-tabular content (summaries, totals, footers, disclaimers)
${profileContext}
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
   * Uses gpt-4o for reliability with complex layouts.
   */
  private static async parsePdfFullMode(
    openai: OpenAI,
    text: string,
    extractionProfile?: ExtractionProfile
  ): Promise<{ rows: Record<string, any>[]; detectedColumns: any[] }> {
    console.log("[PDF Parser] Full mode: extracting ALL rows...")
    const profileContext = this.buildProfileContext(extractionProfile)

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a document parser specializing in extracting structured tabular data. Extract the COMPLETE data table.

Rules:
- Identify the main DATA TABLE (transactions, line items, entries)
- Do NOT confuse summary sections, headers, or account info with the data table
- Documents may contain MULTIPLE tables or sections (e.g. different cardholders, "Purchasing Activity" and "Travel Activity") — COMBINE all transaction sections into a single unified table
- Transaction tables may NOT start on page 1 — look through ALL pages
- If there are multiple sections per cardholder or category, add a column for the section name
- Extract ALL rows -- every single row from every section, not just a sample
- Use column names exactly as they appear, or infer clean names from the layout
- Include data from ALL pages (continuation pages too)
- Parse amounts as numbers (remove currency symbols, handle negatives/parentheses)
- Parse dates in original format
- IGNORE non-tabular content: summaries, footers, page numbers, disclaimers
${profileContext}
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

      // Check if date-like — comprehensive detection
      const dateLabels = ["date", "posted", "effective", "created", "updated", "timestamp", "time", "period", "due", "issued", "paid"]
      const isDateByLabel = dateLabels.some((d) => label.includes(d))
      const isDateBySample = samples.some((s) => {
        // MM/DD/YYYY, DD/MM/YYYY, MM-DD-YYYY
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return true
        // ISO: YYYY-MM-DD or YYYY/MM/DD (with optional time)
        if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(s)) return true
        // European: DD.MM.YYYY
        if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) return true
        // Month name formats: "Feb 6, 2026", "6 February 2026", "February 2026"
        if (/^[A-Za-z]{3,9}\s+\d{1,2}[,\s]+\d{4}$/.test(s)) return true
        if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(s)) return true
        // Excel/JS Date object stringified: "Fri Feb 06 2026..." or ISO with T
        if (/^\w{3}\s+\w{3}\s+\d{2}\s+\d{4}/.test(s)) return true
        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return true
        // Excel serial number (range ~25000-60000 for years 1968-2064)
        const num = parseFloat(s)
        if (!isNaN(num) && num > 25000 && num < 60000 && Number.isInteger(num)) return true
        return false
      })
      if (isDateByLabel || isDateBySample) {
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
