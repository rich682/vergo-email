/**
 * Attachment Extraction Service
 * Extracts text content from PDF, Excel, and CSV files for AI analysis.
 * Uses existing dependencies: pdfjs-dist, xlsx
 */

import * as XLSX from "xlsx"

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
}
