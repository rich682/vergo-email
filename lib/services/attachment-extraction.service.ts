/**
 * Attachment Extraction Service
 * Extracts text content from PDF, Excel, and CSV files for AI analysis.
 * V1: Now includes signal extraction for unstructured documents (PDF, images)
 * Uses existing dependencies: pdfjs-dist, xlsx
 */

import * as XLSX from "xlsx"
import { getOpenAIClient } from "@/lib/utils/openai-client"

export interface ExtractionResult {
  success: boolean
  text: string
  mimeType: string
  error?: string
  metadata?: {
    pageCount?: number
    sheetCount?: number
    rowCount?: number
    columns?: string[]
  }
}

export interface SheetData {
  name: string
  columns: string[]
  rows: Record<string, any>[]
  rowCount: number
}

export interface ExcelExtractionResult extends ExtractionResult {
  sheets: SheetData[]
}

/**
 * Extracted signals from unstructured documents (PDF, images)
 * V1: Focuses on high-confidence signals, not perfect row extraction
 */
export interface ExtractedSignals {
  totals: Array<{
    label?: string
    value: number
    currency?: string
    confidence: "high" | "medium" | "low"
  }>
  dates: Array<{
    label?: string
    date: string
    type?: "statement_date" | "period_start" | "period_end" | "transaction" | "other"
  }>
  references: string[]  // Account numbers, check numbers, invoice refs
  textSummary: string   // Truncated text for LLM context
  documentType?: string // "bank_statement", "credit_card", "invoice", etc.
}

export interface SignalExtractionResult {
  success: boolean
  signals: ExtractedSignals
  error?: string
}

/**
 * AttachmentExtractionService - extracts text from various file types
 * No refactoring of existing services - this is a new standalone service
 */
export class AttachmentExtractionService {
  /**
   * Extract text content from a URL (Vercel Blob or other public URL)
   */
  static async extractFromUrl(
    url: string,
    mimeType?: string
  ): Promise<ExtractionResult> {
    try {
      // Fetch the file
      const response = await fetch(url)
      if (!response.ok) {
        return {
          success: false,
          text: "",
          mimeType: mimeType || "unknown",
          error: `Failed to fetch file: ${response.statusText}`
        }
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      const detectedMime = mimeType || response.headers.get("content-type") || "application/octet-stream"

      return this.extractFromBuffer(buffer, detectedMime)
    } catch (error: any) {
      return {
        success: false,
        text: "",
        mimeType: mimeType || "unknown",
        error: `Extraction failed: ${error.message}`
      }
    }
  }

  /**
   * Extract text content from a buffer based on MIME type
   */
  static async extractFromBuffer(
    buffer: Buffer,
    mimeType: string
  ): Promise<ExtractionResult> {
    const normalizedMime = mimeType.toLowerCase()

    // PDF
    if (normalizedMime.includes("pdf")) {
      return this.extractFromPdf(buffer)
    }

    // Excel (xlsx, xls)
    if (
      normalizedMime.includes("spreadsheet") ||
      normalizedMime.includes("excel") ||
      normalizedMime.includes("ms-excel")
    ) {
      return this.extractFromExcel(buffer)
    }

    // CSV
    if (normalizedMime.includes("csv") || normalizedMime.includes("comma-separated")) {
      return this.extractFromCsv(buffer)
    }

    // Plain text
    if (normalizedMime.includes("text/plain")) {
      const text = buffer.toString("utf-8")
      return {
        success: true,
        text,
        mimeType,
        metadata: {}
      }
    }

    // Image - return placeholder (OCR not implemented yet)
    if (normalizedMime.includes("image/")) {
      return {
        success: true,
        text: "[Image file - content extraction not available]",
        mimeType,
        metadata: {}
      }
    }

    // Unsupported type
    return {
      success: false,
      text: "",
      mimeType,
      error: `Unsupported file type: ${mimeType}`
    }
  }

  /**
   * Extract text from PDF using pdfjs-dist
   */
  static async extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
    try {
      // Dynamic import to avoid bundling issues
      const pdfjsLib = await import("pdfjs-dist")
      
      // Convert Buffer to Uint8Array for pdfjs
      const data = new Uint8Array(buffer)
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data })
      const pdf = await loadingTask.promise

      const textParts: string[] = []
      const pageCount = pdf.numPages

      // Extract text from each page
      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        
        const pageText = textContent.items
          .map((item: any) => item.str || "")
          .join(" ")
        
        if (pageText.trim()) {
          textParts.push(`[Page ${pageNum}]\n${pageText}`)
        }
      }

      const fullText = textParts.join("\n\n")

      return {
        success: true,
        text: fullText || "[PDF contains no extractable text]",
        mimeType: "application/pdf",
        metadata: { pageCount }
      }
    } catch (error: any) {
      console.error("[AttachmentExtraction] PDF extraction error:", error)
      return {
        success: false,
        text: "",
        mimeType: "application/pdf",
        error: `PDF extraction failed: ${error.message}`
      }
    }
  }

  /**
   * Extract data from Excel files using xlsx
   */
  static extractFromExcel(buffer: Buffer): ExtractionResult {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" })
      const sheets: SheetData[] = []
      const textParts: string[] = []
      let totalRows = 0

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
          header: 1,
          defval: ""
        }) as any[][]

        if (jsonData.length === 0) continue

        // First row is headers
        const headers = jsonData[0].map((h: any) => String(h || "").trim())
        const rows: Record<string, any>[] = []

        // Convert remaining rows to objects
        for (let i = 1; i < jsonData.length; i++) {
          const row: Record<string, any> = {}
          let hasData = false
          
          for (let j = 0; j < headers.length; j++) {
            const value = jsonData[i][j]
            if (value !== "" && value !== null && value !== undefined) {
              hasData = true
            }
            row[headers[j] || `Column${j}`] = value
          }
          
          if (hasData) {
            rows.push(row)
          }
        }

        sheets.push({
          name: sheetName,
          columns: headers.filter(h => h),
          rows,
          rowCount: rows.length
        })

        totalRows += rows.length

        // Build text summary for AI
        textParts.push(`[Sheet: ${sheetName}]`)
        textParts.push(`Columns: ${headers.filter(h => h).join(", ")}`)
        textParts.push(`Rows: ${rows.length}`)
        
        // Include sample rows (first 5)
        const sampleRows = rows.slice(0, 5)
        if (sampleRows.length > 0) {
          textParts.push("Sample data:")
          for (const row of sampleRows) {
            const rowStr = Object.entries(row)
              .filter(([_, v]) => v !== "" && v !== null && v !== undefined)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")
            textParts.push(`  - ${rowStr}`)
          }
          if (rows.length > 5) {
            textParts.push(`  ... and ${rows.length - 5} more rows`)
          }
        }
        textParts.push("")
      }

      const result: ExcelExtractionResult = {
        success: true,
        text: textParts.join("\n"),
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sheets,
        metadata: {
          sheetCount: sheets.length,
          rowCount: totalRows,
          columns: sheets.flatMap(s => s.columns)
        }
      }

      return result
    } catch (error: any) {
      console.error("[AttachmentExtraction] Excel extraction error:", error)
      return {
        success: false,
        text: "",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        error: `Excel extraction failed: ${error.message}`
      }
    }
  }

  /**
   * Extract data from CSV files
   */
  static extractFromCsv(buffer: Buffer): ExtractionResult {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      
      if (!sheetName) {
        return {
          success: false,
          text: "",
          mimeType: "text/csv",
          error: "CSV file is empty"
        }
      }

      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
        header: 1,
        defval: ""
      }) as any[][]

      if (jsonData.length === 0) {
        return {
          success: true,
          text: "[Empty CSV file]",
          mimeType: "text/csv",
          metadata: { rowCount: 0, columns: [] }
        }
      }

      // First row is headers
      const headers = jsonData[0].map((h: any) => String(h || "").trim())
      const rows: Record<string, any>[] = []

      for (let i = 1; i < jsonData.length; i++) {
        const row: Record<string, any> = {}
        let hasData = false
        
        for (let j = 0; j < headers.length; j++) {
          const value = jsonData[i][j]
          if (value !== "" && value !== null && value !== undefined) {
            hasData = true
          }
          row[headers[j] || `Column${j}`] = value
        }
        
        if (hasData) {
          rows.push(row)
        }
      }

      // Build text summary
      const textParts: string[] = []
      textParts.push(`Columns: ${headers.filter(h => h).join(", ")}`)
      textParts.push(`Rows: ${rows.length}`)
      
      // Include sample rows (first 5)
      const sampleRows = rows.slice(0, 5)
      if (sampleRows.length > 0) {
        textParts.push("Sample data:")
        for (const row of sampleRows) {
          const rowStr = Object.entries(row)
            .filter(([_, v]) => v !== "" && v !== null && v !== undefined)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")
          textParts.push(`  - ${rowStr}`)
        }
        if (rows.length > 5) {
          textParts.push(`  ... and ${rows.length - 5} more rows`)
        }
      }

      return {
        success: true,
        text: textParts.join("\n"),
        mimeType: "text/csv",
        metadata: {
          rowCount: rows.length,
          columns: headers.filter(h => h)
        }
      }
    } catch (error: any) {
      console.error("[AttachmentExtraction] CSV extraction error:", error)
      return {
        success: false,
        text: "",
        mimeType: "text/csv",
        error: `CSV extraction failed: ${error.message}`
      }
    }
  }

  /**
   * Extract content from multiple attachments and combine
   */
  static async extractFromMultiple(
    attachments: Array<{ url: string; mimeType?: string; filename?: string }>
  ): Promise<{ combined: string; results: ExtractionResult[] }> {
    const results: ExtractionResult[] = []
    const textParts: string[] = []

    for (const attachment of attachments) {
      const result = await this.extractFromUrl(attachment.url, attachment.mimeType)
      results.push(result)

      if (result.success && result.text) {
        const label = attachment.filename || "Attachment"
        textParts.push(`=== ${label} ===`)
        textParts.push(result.text)
        textParts.push("")
      }
    }

    return {
      combined: textParts.join("\n"),
      results
    }
  }

  // ============================================
  // V1 SIGNAL EXTRACTION FOR UNSTRUCTURED DOCS
  // ============================================

  /**
   * Extract accounting signals from PDF text
   * V1: Uses regex patterns for totals, dates, references
   * Does NOT attempt full table reconstruction
   */
  static async extractSignalsFromPdf(buffer: Buffer): Promise<SignalExtractionResult> {
    try {
      // First extract the text
      const textResult = await this.extractFromPdf(buffer)
      if (!textResult.success) {
        return {
          success: false,
          signals: this.emptySignals(),
          error: textResult.error
        }
      }

      const text = textResult.text
      const signals = this.extractSignalsFromText(text)

      return {
        success: true,
        signals
      }
    } catch (error: any) {
      console.error("[AttachmentExtraction] PDF signal extraction error:", error)
      return {
        success: false,
        signals: this.emptySignals(),
        error: `PDF signal extraction failed: ${error.message}`
      }
    }
  }

  /**
   * Extract accounting signals from image using OpenAI Vision
   * V1: Sends image to vision model with accounting-focused prompt
   */
  static async extractSignalsFromImage(
    buffer: Buffer, 
    mimeType: string
  ): Promise<SignalExtractionResult> {
    try {
      const openai = getOpenAIClient()

      // Convert buffer to base64
      const base64 = buffer.toString("base64")
      const dataUrl = `data:${mimeType};base64,${base64}`

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an accounting assistant analyzing a financial document image.
Extract the following accounting-relevant information if visible:

1. TOTALS: Any monetary totals, balances, or amounts (e.g., ending balance, total due, net amount)
2. DATES: Statement dates, period dates, transaction dates
3. REFERENCES: Account numbers, invoice numbers, check numbers, reference IDs
4. DOCUMENT TYPE: What type of document is this? (bank_statement, credit_card, invoice, payroll, etc.)

Respond with JSON:
{
  "totals": [{"label": "Ending Balance", "value": 12345.67, "currency": "USD", "confidence": "high"}],
  "dates": [{"label": "Statement Date", "date": "2024-12-31", "type": "statement_date"}],
  "references": ["Account #1234567890"],
  "documentType": "bank_statement",
  "textSummary": "Brief 1-2 sentence description of what this document shows"
}

If you cannot extract certain fields, return empty arrays. Focus on HIGH CONFIDENCE extractions only.`
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" }
              },
              {
                type: "text",
                text: "Please analyze this financial document image and extract accounting signals."
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        return {
          success: false,
          signals: this.emptySignals(),
          error: "No response from vision model"
        }
      }

      const parsed = JSON.parse(response)

      const signals: ExtractedSignals = {
        totals: (parsed.totals || []).map((t: any) => ({
          label: t.label,
          value: parseFloat(t.value) || 0,
          currency: t.currency || "USD",
          confidence: t.confidence || "medium"
        })),
        dates: (parsed.dates || []).map((d: any) => ({
          label: d.label,
          date: d.date,
          type: d.type || "other"
        })),
        references: parsed.references || [],
        textSummary: parsed.textSummary || "[Image analyzed - see extracted signals]",
        documentType: parsed.documentType
      }

      return {
        success: true,
        signals
      }
    } catch (error: any) {
      console.error("[AttachmentExtraction] Image signal extraction error:", error)
      return {
        success: false,
        signals: this.emptySignals(),
        error: `Image signal extraction failed: ${error.message}`
      }
    }
  }

  /**
   * Extract signals from already-extracted text using regex patterns
   */
  static extractSignalsFromText(text: string): ExtractedSignals {
    const totals: ExtractedSignals["totals"] = []
    const dates: ExtractedSignals["dates"] = []
    const references: string[] = []

    // Regex patterns for monetary amounts
    // Matches: $1,234.56, $1234.56, 1,234.56, -$1,234.56
    const moneyPattern = /(?:(?:ending|closing|beginning|opening|total|balance|amount|net|gross|due|payment)\s*(?:balance|due|amount)?[\s:]*)?[\$]?-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/gi
    
    // Find amounts with labels
    const labeledAmountPattern = /((?:ending|closing|beginning|opening|total|net|gross|balance|amount|due|payment|credit|debit)\s*(?:balance|due|amount)?)\s*[:.]?\s*\$?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi
    
    let match
    const seenAmounts = new Set<string>()
    
    while ((match = labeledAmountPattern.exec(text)) !== null) {
      const label = match[1].trim()
      const valueStr = match[2].replace(/,/g, "")
      const value = parseFloat(valueStr)
      
      if (!isNaN(value) && Math.abs(value) > 0.01 && !seenAmounts.has(valueStr)) {
        seenAmounts.add(valueStr)
        totals.push({
          label,
          value,
          currency: "USD",
          confidence: label.toLowerCase().includes("ending") || label.toLowerCase().includes("total") 
            ? "high" 
            : "medium"
        })
      }
    }

    // Date patterns
    // Matches: 12/31/2024, 2024-12-31, December 31, 2024, 31 Dec 2024
    const datePatterns = [
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/g,
      /(\d{4}-\d{2}-\d{2})/g,
      /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/gi,
      /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi
    ]

    const labeledDatePattern = /((?:statement|period|through|ending|as of|dated?)\s*(?:date|end)?)\s*[:.]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/gi
    
    while ((match = labeledDatePattern.exec(text)) !== null) {
      const label = match[1].trim()
      const date = match[2]
      
      dates.push({
        label,
        date,
        type: label.toLowerCase().includes("statement") ? "statement_date" 
          : label.toLowerCase().includes("period") || label.toLowerCase().includes("through") ? "period_end"
          : "other"
      })
    }

    // Reference number patterns
    // Account numbers, invoice numbers, check numbers
    const refPatterns = [
      /(?:account|acct)[\s#.:]*(\d{4,})/gi,
      /(?:invoice|inv)[\s#.:]*([A-Z0-9-]{4,})/gi,
      /(?:check|chk)[\s#.:]*(\d{4,})/gi,
      /(?:reference|ref)[\s#.:]*([A-Z0-9-]{4,})/gi
    ]

    for (const pattern of refPatterns) {
      while ((match = pattern.exec(text)) !== null) {
        const ref = match[1]
        if (!references.includes(ref)) {
          references.push(ref)
        }
      }
    }

    // Determine document type from keywords
    let documentType: string | undefined
    const textLower = text.toLowerCase()
    if (textLower.includes("bank statement") || textLower.includes("checking account")) {
      documentType = "bank_statement"
    } else if (textLower.includes("credit card") || textLower.includes("card statement")) {
      documentType = "credit_card"
    } else if (textLower.includes("invoice") || textLower.includes("bill to")) {
      documentType = "invoice"
    } else if (textLower.includes("payroll") || textLower.includes("pay stub")) {
      documentType = "payroll"
    }

    // Truncate text for summary (first 2000 chars)
    const textSummary = text.length > 2000 
      ? text.substring(0, 2000) + "..."
      : text

    return {
      totals: totals.slice(0, 10), // Limit to top 10
      dates: dates.slice(0, 5),    // Limit to 5
      references: references.slice(0, 10), // Limit to 10
      textSummary,
      documentType
    }
  }

  /**
   * Helper to return empty signals structure
   */
  static emptySignals(): ExtractedSignals {
    return {
      totals: [],
      dates: [],
      references: [],
      textSummary: ""
    }
  }

  /**
   * Extract signals from any file type (auto-detect)
   */
  static async extractSignals(
    buffer: Buffer,
    mimeType: string
  ): Promise<SignalExtractionResult> {
    const normalizedMime = mimeType.toLowerCase()

    // PDF
    if (normalizedMime.includes("pdf")) {
      return this.extractSignalsFromPdf(buffer)
    }

    // Image
    if (normalizedMime.startsWith("image/")) {
      return this.extractSignalsFromImage(buffer, mimeType)
    }

    // For structured files (Excel/CSV), extract from text representation
    const extractResult = await this.extractFromBuffer(buffer, mimeType)
    if (extractResult.success && extractResult.text) {
      return {
        success: true,
        signals: this.extractSignalsFromText(extractResult.text)
      }
    }

    return {
      success: false,
      signals: this.emptySignals(),
      error: `Unsupported file type for signal extraction: ${mimeType}`
    }
  }
}
