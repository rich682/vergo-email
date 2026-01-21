/**
 * Reconciliation Processor Service
 * Compares two Excel/CSV files and generates variance reports.
 * Uses attachment-extraction.service.ts for file parsing.
 */

import { prisma } from "@/lib/prisma"
import { ReconciliationStatus } from "@prisma/client"
import { 
  AttachmentExtractionService, 
  SheetData, 
  ExcelExtractionResult,
  ExtractedSignals,
  SignalExtractionResult
} from "./attachment-extraction.service"
import OpenAI from "openai"
import { 
  RECONCILIATION_LIMITS, 
  RECONCILIATION_MESSAGES,
  getFileCategory,
  isStructuredFile
} from "@/lib/constants/reconciliation"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}

export interface ColumnMapping {
  doc1Column: string
  doc2Column: string
  confidence: number
  matchType: "exact" | "fuzzy" | "ai_suggested"
}

export interface RowMatch {
  doc1RowIndex: number
  doc2RowIndex: number
  keyValue: string
  status: "match" | "mismatch" | "partial"
  differences: Array<{
    column: string
    doc1Value: any
    doc2Value: any
  }>
}

export interface Discrepancy {
  type: "missing_in_doc1" | "missing_in_doc2" | "value_mismatch"
  keyColumn: string
  keyValue: string
  details: string
  doc1Row?: Record<string, any>
  doc2Row?: Record<string, any>
}

export interface ReconciliationResult {
  success: boolean
  summary: string
  matchedCount: number
  unmatchedCount: number
  totalRows: number
  columnMappings: ColumnMapping[]
  discrepancies: Discrepancy[]
  keyColumn?: string
  error?: string
}

// ============================================
// ANCHORED RECONCILIATION MODEL TYPES
// ============================================

/**
 * Supporting document metadata stored in JSON field
 */
export interface SupportingDocument {
  key: string           // Blob storage key
  name: string          // Original filename
  url: string           // Public URL
  size: number          // File size bytes
  uploadOrder: number   // Preserves user order (1-indexed)
}

/**
 * Reconciliation intent classification
 */
export type ReconciliationIntentType = 
  | "ROW_LEVEL"           // Standard row-to-row matching
  | "TOTALS_ONLY"         // Only verify totals match
  | "AGGREGATED_TO_DETAIL"// One side aggregated, other detailed
  | "HYBRID"              // Mix of approaches
  | "UNKNOWN"             // Couldn't determine

export interface ReconciliationIntent {
  type: ReconciliationIntentType
  confidence: number                    // 0-1
  anchorRoleExplanation: string         // "The GL serves as source of truth..."
  supportingRoleExplanation: string     // "Bank statements provide evidence..."
  userDescription?: string              // Original user input
}

/**
 * Result for a single supporting document comparison
 */
export interface SupportingDocumentResult {
  documentName: string
  documentKey: string
  columns: string[]
  rowCount: number
  totalColumn?: string
  totalValue?: number
  matchedCount: number
  unmatchedCount: number
  discrepancies: Discrepancy[]
  columnMappings: ColumnMapping[]
  keyColumn?: string
}

/**
 * Full anchored reconciliation result
 */
export interface AnchoredReconciliationResult {
  success: boolean
  error?: string
  // Anchor analysis
  anchor: {
    name: string
    columns: string[]
    rowCount: number
    totalColumn?: string
    totalValue?: number
  }
  // Per-supporting results
  supportingResults: SupportingDocumentResult[]
  // Aggregated totals
  totalMatchedCount: number
  totalUnmatchedCount: number
  // AI-generated summary
  summary: string
  // Intent classification
  reconciliationIntent: ReconciliationIntent
}

// ============================================
// V1 ACCOUNTING CONTEXT & ENHANCED OUTPUT
// ============================================

/**
 * Accounting context for AI prompts
 * Includes task, board, period, and template information
 */
export interface ReconciliationContext {
  taskName: string
  taskDescription?: string
  boardName?: string
  periodStart?: string
  periodEnd?: string
  isRecurring: boolean
  anchorRole: string
  supportingRoles: string[]
  userIntent?: string
  priorExplanation?: string  // From template
}

/**
 * V1 Enhanced AI output
 * Focuses on confidence and explainability
 */
export interface V1ReconciliationResult {
  success: boolean
  reconciliationType: ReconciliationIntentType
  confidenceScore: number  // 0-100
  confidenceLabel: "High" | "Medium" | "Low"
  explanation: string  // 2-4 sentences
  keyFindings: string[]  // Bulleted findings
  suggestedNextSteps: string[]  // Bulleted next steps
  
  // Document summaries
  anchorSummary: {
    role: string
    filename: string
    fileType: "structured" | "pdf" | "image"
    extractedTotals?: ExtractedSignals["totals"]
    extractedDates?: ExtractedSignals["dates"]
    rowCount?: number
  }
  supportingSummaries: Array<{
    role: string
    filename: string
    fileType: "structured" | "pdf" | "image"
    extractedTotals?: ExtractedSignals["totals"]
    extractedDates?: ExtractedSignals["dates"]
    rowCount?: number
  }>
  
  // Existing fields for backwards compatibility
  matchedCount?: number
  unmatchedCount?: number
  discrepancies?: Discrepancy[]
  columnMappings?: ColumnMapping[]
  keyColumn?: string
  
  error?: string
}

/**
 * Document info with signals for V1 processing
 */
export interface DocumentWithSignals {
  name: string
  url: string
  key: string
  mimeType: string
  fileCategory: "structured" | "pdf" | "image" | "unknown"
  signals?: ExtractedSignals
  sheetData?: SheetData  // For structured files only
}

export class ReconciliationProcessorService {
  /**
   * Process a reconciliation by ID
   * Fetches documents, extracts data, compares, and updates the record
   */
  static async processReconciliation(
    reconciliationId: string
  ): Promise<ReconciliationResult> {
    // Update status to PROCESSING
    await prisma.reconciliation.update({
      where: { id: reconciliationId },
      data: { status: ReconciliationStatus.PROCESSING }
    })

    try {
      // Fetch reconciliation record
      const reconciliation = await prisma.reconciliation.findUnique({
        where: { id: reconciliationId }
      })

      if (!reconciliation) {
        throw new Error("Reconciliation not found")
      }

      // Extract content from both documents
      const [doc1Result, doc2Result] = await Promise.all([
        AttachmentExtractionService.extractFromUrl(
          reconciliation.document1Url || reconciliation.document1Key,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        AttachmentExtractionService.extractFromUrl(
          reconciliation.document2Url || reconciliation.document2Key,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
      ])

      if (!doc1Result.success) {
        throw new Error(`Failed to extract document 1: ${doc1Result.error}`)
      }
      if (!doc2Result.success) {
        throw new Error(`Failed to extract document 2: ${doc2Result.error}`)
      }

      // Get sheet data (Excel extraction includes sheets property)
      const doc1Sheets = (doc1Result as ExcelExtractionResult).sheets || []
      const doc2Sheets = (doc2Result as ExcelExtractionResult).sheets || []

      if (doc1Sheets.length === 0 || doc2Sheets.length === 0) {
        throw new Error("One or both documents have no data sheets")
      }

      // Use first sheet from each document
      const sheet1 = doc1Sheets[0]
      const sheet2 = doc2Sheets[0]

      // Validate row counts
      if (sheet1.rowCount > RECONCILIATION_LIMITS.MAX_ROWS_PER_SHEET) {
        throw new Error(
          `Document 1 has ${sheet1.rowCount.toLocaleString()} rows. ${RECONCILIATION_MESSAGES.TOO_MANY_ROWS}`
        )
      }
      if (sheet2.rowCount > RECONCILIATION_LIMITS.MAX_ROWS_PER_SHEET) {
        throw new Error(
          `Document 2 has ${sheet2.rowCount.toLocaleString()} rows. ${RECONCILIATION_MESSAGES.TOO_MANY_ROWS}`
        )
      }

      // Validate column counts
      if (sheet1.columns.length > RECONCILIATION_LIMITS.MAX_COLUMNS) {
        throw new Error(
          `Document 1 has ${sheet1.columns.length} columns. ${RECONCILIATION_MESSAGES.TOO_MANY_COLUMNS}`
        )
      }
      if (sheet2.columns.length > RECONCILIATION_LIMITS.MAX_COLUMNS) {
        throw new Error(
          `Document 2 has ${sheet2.columns.length} columns. ${RECONCILIATION_MESSAGES.TOO_MANY_COLUMNS}`
        )
      }

      // Detect column mappings (deterministic first, then AI enhancement)
      const deterministicMappings = this.detectColumnMappings(sheet1, sheet2)
      
      // Enhance with AI-powered semantic matching for unmatched columns
      let columnMappings: ColumnMapping[]
      try {
        columnMappings = await this.detectColumnMappingsWithAI(
          sheet1,
          sheet2,
          deterministicMappings
        )
      } catch (aiError: any) {
        console.warn("[ReconciliationProcessor] AI column matching failed, using deterministic only:", aiError.message)
        columnMappings = deterministicMappings
      }

      // Find key column (usually first mapped column or ID-like column)
      const keyColumn = this.detectKeyColumn(sheet1, sheet2, columnMappings)

      // Compare data
      const comparisonResult = this.compareSheets(
        sheet1,
        sheet2,
        columnMappings,
        keyColumn
      )

      // Generate summary using AI
      const summary = await this.generateSummary(
        reconciliation.document1Name,
        reconciliation.document2Name,
        comparisonResult
      )

      const result: ReconciliationResult = {
        success: true,
        summary,
        matchedCount: comparisonResult.matchedCount,
        unmatchedCount: comparisonResult.unmatchedCount,
        totalRows: comparisonResult.totalRows,
        columnMappings,
        discrepancies: comparisonResult.discrepancies,
        keyColumn
      }

      // Update reconciliation record with results
      await prisma.reconciliation.update({
        where: { id: reconciliationId },
        data: {
          status: ReconciliationStatus.COMPLETED,
          summary,
          matchedCount: result.matchedCount,
          unmatchedCount: result.unmatchedCount,
          totalRows: result.totalRows,
          result: result as any,
          discrepancies: result.discrepancies as any
        }
      })

      return result
    } catch (error: any) {
      console.error("[ReconciliationProcessor] Error:", error)

      // Update status to FAILED
      await prisma.reconciliation.update({
        where: { id: reconciliationId },
        data: {
          status: ReconciliationStatus.FAILED,
          errorMessage: error.message
        }
      })

      return {
        success: false,
        summary: "",
        matchedCount: 0,
        unmatchedCount: 0,
        totalRows: 0,
        columnMappings: [],
        discrepancies: [],
        error: error.message
      }
    }
  }

  /**
   * Detect matching columns between two sheets
   */
  static detectColumnMappings(
    sheet1: SheetData,
    sheet2: SheetData
  ): ColumnMapping[] {
    const mappings: ColumnMapping[] = []
    const usedDoc2Columns = new Set<string>()

    for (const col1 of sheet1.columns) {
      const col1Lower = col1.toLowerCase().trim()

      // Try exact match first
      const exactMatch = sheet2.columns.find(
        col2 => col2.toLowerCase().trim() === col1Lower && !usedDoc2Columns.has(col2)
      )

      if (exactMatch) {
        mappings.push({
          doc1Column: col1,
          doc2Column: exactMatch,
          confidence: 1.0,
          matchType: "exact"
        })
        usedDoc2Columns.add(exactMatch)
        continue
      }

      // Try fuzzy match (contains or similar)
      const fuzzyMatch = sheet2.columns.find(col2 => {
        if (usedDoc2Columns.has(col2)) return false
        const col2Lower = col2.toLowerCase().trim()
        
        // Check if one contains the other
        if (col1Lower.includes(col2Lower) || col2Lower.includes(col1Lower)) {
          return true
        }
        
        // Check common variations
        const normalize = (s: string) => s.replace(/[_\-\s]/g, "").toLowerCase()
        return normalize(col1) === normalize(col2)
      })

      if (fuzzyMatch) {
        mappings.push({
          doc1Column: col1,
          doc2Column: fuzzyMatch,
          confidence: 0.8,
          matchType: "fuzzy"
        })
        usedDoc2Columns.add(fuzzyMatch)
      }
    }

    return mappings
  }

  /**
   * Enhance column mappings with AI-powered semantic matching
   * For columns that weren't matched deterministically, uses AI to suggest matches
   */
  static async detectColumnMappingsWithAI(
    sheet1: SheetData,
    sheet2: SheetData,
    deterministicMappings: ColumnMapping[]
  ): Promise<ColumnMapping[]> {
    // Start with deterministic mappings
    const mappings = [...deterministicMappings]
    const usedDoc1Columns = new Set(mappings.map(m => m.doc1Column))
    const usedDoc2Columns = new Set(mappings.map(m => m.doc2Column))

    // Find unmatched columns
    const unmatchedDoc1 = sheet1.columns.filter(c => !usedDoc1Columns.has(c))
    const unmatchedDoc2 = sheet2.columns.filter(c => !usedDoc2Columns.has(c))

    // If no unmatched columns on either side, return as-is
    if (unmatchedDoc1.length === 0 || unmatchedDoc2.length === 0) {
      return mappings
    }

    try {
      const openai = getOpenAIClient()

      // Build sample data for context (first 3 values from each column)
      const doc1Samples: Record<string, string[]> = {}
      const doc2Samples: Record<string, string[]> = {}

      for (const col of unmatchedDoc1) {
        doc1Samples[col] = sheet1.rows
          .slice(0, 3)
          .map(r => String(r[col] || ""))
          .filter(v => v)
      }
      for (const col of unmatchedDoc2) {
        doc2Samples[col] = sheet2.rows
          .slice(0, 3)
          .map(r => String(r[col] || ""))
          .filter(v => v)
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a data matching expert. Given two lists of column names with sample values, identify which columns likely represent the same data despite different names.

Common patterns to look for:
- Abbreviations: "Amt" = "Amount", "Acct" = "Account", "Desc" = "Description"
- Synonyms: "Vendor" = "Supplier", "Customer" = "Client"
- Naming conventions: "account_id" = "AccountID" = "Account Number"

Respond with JSON array of matches:
[{"doc1Column": "...", "doc2Column": "...", "confidence": 0.6-0.8}]

Only include matches you're reasonably confident about. Empty array if no good matches.`
          },
          {
            role: "user",
            content: `Document 1 columns (with sample values):
${Object.entries(doc1Samples).map(([col, samples]) => `- "${col}": ${samples.slice(0, 2).join(", ") || "(empty)"}`).join("\n")}

Document 2 columns (with sample values):
${Object.entries(doc2Samples).map(([col, samples]) => `- "${col}": ${samples.slice(0, 2).join(", ") || "(empty)"}`).join("\n")}

Which columns likely match?`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 500
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        return mappings
      }

      const parsed = JSON.parse(response)
      const aiMatches = Array.isArray(parsed) ? parsed : parsed.matches || []

      // Add AI-suggested matches
      for (const match of aiMatches) {
        if (
          match.doc1Column &&
          match.doc2Column &&
          unmatchedDoc1.includes(match.doc1Column) &&
          unmatchedDoc2.includes(match.doc2Column) &&
          !usedDoc2Columns.has(match.doc2Column)
        ) {
          mappings.push({
            doc1Column: match.doc1Column,
            doc2Column: match.doc2Column,
            confidence: Math.min(0.75, match.confidence || 0.65),
            matchType: "ai_suggested"
          })
          usedDoc2Columns.add(match.doc2Column)
        }
      }

      return mappings
    } catch (error: any) {
      console.warn("[ReconciliationProcessor] AI column matching failed:", error.message)
      // Return deterministic mappings as fallback
      return deterministicMappings
    }
  }

  /**
   * Detect the key column for matching rows
   */
  static detectKeyColumn(
    sheet1: SheetData,
    sheet2: SheetData,
    mappings: ColumnMapping[]
  ): string | undefined {
    // Look for common ID-like column names
    const idPatterns = ["id", "key", "code", "number", "ref", "identifier", "account"]
    
    for (const mapping of mappings) {
      const colLower = mapping.doc1Column.toLowerCase()
      if (idPatterns.some(pattern => colLower.includes(pattern))) {
        return mapping.doc1Column
      }
    }

    // Default to first mapped column
    return mappings[0]?.doc1Column
  }

  /**
   * Compare two sheets and find discrepancies
   */
  static compareSheets(
    sheet1: SheetData,
    sheet2: SheetData,
    mappings: ColumnMapping[],
    keyColumn?: string
  ): {
    matchedCount: number
    unmatchedCount: number
    totalRows: number
    discrepancies: Discrepancy[]
  } {
    const discrepancies: Discrepancy[] = []
    let matchedCount = 0
    let unmatchedCount = 0

    // Build lookup for sheet2 by key column
    const sheet2Map = new Map<string, Record<string, any>>()
    const keyMapping = mappings.find(m => m.doc1Column === keyColumn)
    const doc2KeyColumn = keyMapping?.doc2Column || keyColumn

    if (keyColumn && doc2KeyColumn) {
      for (const row of sheet2.rows) {
        const keyValue = String(row[doc2KeyColumn] || "").trim()
        if (keyValue) {
          sheet2Map.set(keyValue.toLowerCase(), row)
        }
      }
    }

    // Track which sheet2 rows were matched
    const matchedSheet2Keys = new Set<string>()

    // Compare each row in sheet1
    for (const row1 of sheet1.rows) {
      const keyValue = keyColumn ? String(row1[keyColumn] || "").trim() : ""
      
      if (!keyValue) {
        continue // Skip rows without key
      }

      const keyLower = keyValue.toLowerCase()
      const row2 = sheet2Map.get(keyLower)

      if (!row2) {
        // Row exists in doc1 but not doc2
        unmatchedCount++
        discrepancies.push({
          type: "missing_in_doc2",
          keyColumn: keyColumn || "unknown",
          keyValue,
          details: `Row with ${keyColumn}="${keyValue}" exists in ${sheet1.name || "Document 1"} but not in ${sheet2.name || "Document 2"}`,
          doc1Row: row1
        })
        continue
      }

      matchedSheet2Keys.add(keyLower)

      // Compare values for mapped columns
      let hasDiscrepancy = false
      const rowDifferences: Array<{ column: string; doc1Value: any; doc2Value: any }> = []

      for (const mapping of mappings) {
        if (mapping.doc1Column === keyColumn) continue // Skip key column

        const val1 = row1[mapping.doc1Column]
        const val2 = row2[mapping.doc2Column]

        // Normalize and compare
        const str1 = String(val1 ?? "").trim()
        const str2 = String(val2 ?? "").trim()

        if (str1 !== str2) {
          // Check if it's a numeric difference
          const num1 = parseFloat(str1)
          const num2 = parseFloat(str2)
          
          if (!isNaN(num1) && !isNaN(num2) && Math.abs(num1 - num2) < 0.01) {
            continue // Close enough for numbers
          }

          hasDiscrepancy = true
          rowDifferences.push({
            column: mapping.doc1Column,
            doc1Value: val1,
            doc2Value: val2
          })
        }
      }

      if (hasDiscrepancy) {
        unmatchedCount++
        discrepancies.push({
          type: "value_mismatch",
          keyColumn: keyColumn || "unknown",
          keyValue,
          details: `Row ${keyValue}: ${rowDifferences.map(d => `${d.column} differs (${d.doc1Value} vs ${d.doc2Value})`).join(", ")}`,
          doc1Row: row1,
          doc2Row: row2
        })
      } else {
        matchedCount++
      }
    }

    // Find rows in sheet2 that weren't matched
    if (keyColumn && doc2KeyColumn) {
      for (const row2 of sheet2.rows) {
        const keyValue = String(row2[doc2KeyColumn] || "").trim()
        if (keyValue && !matchedSheet2Keys.has(keyValue.toLowerCase())) {
          unmatchedCount++
          discrepancies.push({
            type: "missing_in_doc1",
            keyColumn: doc2KeyColumn,
            keyValue,
            details: `Row with ${doc2KeyColumn}="${keyValue}" exists in ${sheet2.name || "Document 2"} but not in ${sheet1.name || "Document 1"}`,
            doc2Row: row2
          })
        }
      }
    }

    return {
      matchedCount,
      unmatchedCount,
      totalRows: sheet1.rowCount + sheet2.rowCount,
      discrepancies
    }
  }

  /**
   * Generate human-readable summary using AI
   */
  static async generateSummary(
    doc1Name: string,
    doc2Name: string,
    result: {
      matchedCount: number
      unmatchedCount: number
      totalRows: number
      discrepancies: Discrepancy[]
    }
  ): Promise<string> {
    // If no discrepancies, return simple summary
    if (result.discrepancies.length === 0) {
      return `Reconciliation complete: ${result.matchedCount} rows matched between "${doc1Name}" and "${doc2Name}". No discrepancies found.`
    }

    try {
      const openai = getOpenAIClient()

      // Build discrepancy summary for AI
      const discrepancySummary = result.discrepancies.slice(0, 10).map(d => {
        return `- ${d.type}: ${d.details}`
      }).join("\n")

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an accounting assistant summarizing reconciliation results. Be concise and professional. Focus on the key findings and any action items.`
          },
          {
            role: "user",
            content: `Summarize this reconciliation between "${doc1Name}" and "${doc2Name}":

Statistics:
- Matched rows: ${result.matchedCount}
- Unmatched rows: ${result.unmatchedCount}
- Total rows analyzed: ${result.totalRows}

Discrepancies found (${result.discrepancies.length} total):
${discrepancySummary}
${result.discrepancies.length > 10 ? `\n... and ${result.discrepancies.length - 10} more discrepancies` : ""}

Provide a 2-3 sentence summary suitable for an accounting team.`
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      })

      return completion.choices[0]?.message?.content || 
        `Reconciliation complete: ${result.matchedCount} matched, ${result.unmatchedCount} discrepancies found.`
    } catch (error: any) {
      console.warn("[ReconciliationProcessor] AI summary failed:", error.message)
      return `Reconciliation complete: ${result.matchedCount} rows matched, ${result.unmatchedCount} discrepancies found between "${doc1Name}" and "${doc2Name}".`
    }
  }

  // ============================================
  // ANCHORED RECONCILIATION METHODS
  // ============================================

  /**
   * Process an anchored reconciliation with 1 anchor + N supporting documents
   * Runs existing comparison logic for each anchor-supporting pair
   */
  static async processAnchoredReconciliation(
    reconciliationId: string,
    intentDescription?: string
  ): Promise<AnchoredReconciliationResult> {
    // Update status to PROCESSING
    await prisma.reconciliation.update({
      where: { id: reconciliationId },
      data: { status: ReconciliationStatus.PROCESSING }
    })

    try {
      // Fetch reconciliation record
      const reconciliation = await prisma.reconciliation.findUnique({
        where: { id: reconciliationId },
        include: {
          taskInstance: { select: { name: true } }
        }
      })

      if (!reconciliation) {
        throw new Error("Reconciliation not found")
      }

      // Extract anchor document (stored in document1)
      const anchorResult = await AttachmentExtractionService.extractFromUrl(
        reconciliation.document1Url || reconciliation.document1Key,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )

      if (!anchorResult.success) {
        throw new Error(`Failed to extract anchor document: ${anchorResult.error}`)
      }

      const anchorSheets = (anchorResult as ExcelExtractionResult).sheets || []
      if (anchorSheets.length === 0) {
        throw new Error("Anchor document has no data sheets")
      }

      const anchorSheet = anchorSheets[0]

      // Validate anchor
      if (anchorSheet.rowCount > RECONCILIATION_LIMITS.MAX_ROWS_PER_SHEET) {
        throw new Error(
          `Anchor document has ${anchorSheet.rowCount.toLocaleString()} rows. ${RECONCILIATION_MESSAGES.TOO_MANY_ROWS}`
        )
      }

      // Build list of all supporting documents
      // First supporting is in document2, additional ones in supportingDocuments JSON
      const supportingDocs: Array<{ name: string; url: string; key: string }> = [
        {
          name: reconciliation.document2Name,
          url: reconciliation.document2Url || reconciliation.document2Key,
          key: reconciliation.document2Key
        }
      ]

      // Add additional supporting docs from JSON field
      const additionalDocs = (reconciliation.supportingDocuments as unknown as SupportingDocument[]) || []
      for (const doc of additionalDocs) {
        supportingDocs.push({
          name: doc.name,
          url: doc.url || doc.key,
          key: doc.key
        })
      }

      // Extract all supporting documents
      const supportingExtractions = await Promise.all(
        supportingDocs.map(doc =>
          AttachmentExtractionService.extractFromUrl(
            doc.url,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          ).then(result => ({ doc, result }))
        )
      )

      // Prepare data for intent classification
      const supportingDocsForIntent: Array<{ name: string; columns: string[]; rowCount: number }> = []

      // Process each supporting document against the anchor
      const supportingResults: SupportingDocumentResult[] = []
      let totalMatchedCount = 0
      let totalUnmatchedCount = 0
      const allDiscrepancies: Discrepancy[] = []

      for (const { doc, result } of supportingExtractions) {
        if (!result.success) {
          console.error(`[ReconciliationProcessor] Failed to extract ${doc.name}:`, result.error)
          continue
        }

        const sheets = (result as ExcelExtractionResult).sheets || []
        if (sheets.length === 0) {
          console.warn(`[ReconciliationProcessor] ${doc.name} has no data sheets`)
          continue
        }

        const supportingSheet = sheets[0]

        // Validate supporting doc
        if (supportingSheet.rowCount > RECONCILIATION_LIMITS.MAX_ROWS_PER_SHEET) {
          console.warn(`[ReconciliationProcessor] ${doc.name} has too many rows, skipping`)
          continue
        }

        // Collect data for intent classification
        supportingDocsForIntent.push({
          name: doc.name,
          columns: supportingSheet.columns,
          rowCount: supportingSheet.rowCount
        })

        // Run existing column mapping logic
        const deterministicMappings = this.detectColumnMappings(anchorSheet, supportingSheet)
        let columnMappings: ColumnMapping[]
        try {
          columnMappings = await this.detectColumnMappingsWithAI(
            anchorSheet,
            supportingSheet,
            deterministicMappings
          )
        } catch (aiError: any) {
          console.warn(`[ReconciliationProcessor] AI column matching failed for ${doc.name}:`, aiError.message)
          columnMappings = deterministicMappings
        }

        // Find key column
        const keyColumn = this.detectKeyColumn(anchorSheet, supportingSheet, columnMappings)

        // Run existing comparison logic (anchor vs this supporting doc)
        const comparisonResult = this.compareSheets(
          anchorSheet,
          supportingSheet,
          columnMappings,
          keyColumn
        )

        // Detect total column and value if present
        const totalColumn = this.detectTotalColumn(supportingSheet)
        const totalValue = totalColumn ? this.sumColumn(supportingSheet, totalColumn) : undefined

        // Store result for this supporting doc
        supportingResults.push({
          documentName: doc.name,
          documentKey: doc.key,
          columns: supportingSheet.columns,
          rowCount: supportingSheet.rowCount,
          totalColumn,
          totalValue,
          matchedCount: comparisonResult.matchedCount,
          unmatchedCount: comparisonResult.unmatchedCount,
          discrepancies: comparisonResult.discrepancies,
          columnMappings,
          keyColumn
        })

        // Aggregate totals
        totalMatchedCount += comparisonResult.matchedCount
        totalUnmatchedCount += comparisonResult.unmatchedCount
        allDiscrepancies.push(...comparisonResult.discrepancies)
      }

      // Classify reconciliation intent using AI
      let reconciliationIntent: ReconciliationIntent
      try {
        reconciliationIntent = await this.classifyReconciliationIntent({
          userDescription: intentDescription,
          jobName: reconciliation.taskInstance?.name || "Reconciliation",
          anchorColumns: anchorSheet.columns,
          anchorRowCount: anchorSheet.rowCount,
          supportingDocs: supportingDocsForIntent
        })
      } catch (intentError: any) {
        console.warn("[ReconciliationProcessor] Intent classification failed:", intentError.message)
        reconciliationIntent = {
          type: "UNKNOWN",
          confidence: 0,
          anchorRoleExplanation: "The anchor document serves as the source of truth for this reconciliation.",
          supportingRoleExplanation: "Supporting documents provide evidence to explain or verify the anchor.",
          userDescription: intentDescription
        }
      }

      // Detect anchor totals
      const anchorTotalColumn = this.detectTotalColumn(anchorSheet)
      const anchorTotalValue = anchorTotalColumn ? this.sumColumn(anchorSheet, anchorTotalColumn) : undefined

      // Generate summary with intent context
      const summary = await this.generateAnchoredSummary(
        reconciliation.document1Name,
        supportingDocs.map(d => d.name),
        {
          totalMatchedCount,
          totalUnmatchedCount,
          supportingResults,
          reconciliationIntent
        }
      )

      const result: AnchoredReconciliationResult = {
        success: true,
        anchor: {
          name: reconciliation.document1Name,
          columns: anchorSheet.columns,
          rowCount: anchorSheet.rowCount,
          totalColumn: anchorTotalColumn,
          totalValue: anchorTotalValue
        },
        supportingResults,
        totalMatchedCount,
        totalUnmatchedCount,
        summary,
        reconciliationIntent
      }

      // Update reconciliation record with results
      await prisma.reconciliation.update({
        where: { id: reconciliationId },
        data: {
          status: ReconciliationStatus.COMPLETED,
          summary,
          matchedCount: totalMatchedCount,
          unmatchedCount: totalUnmatchedCount,
          totalRows: anchorSheet.rowCount + supportingResults.reduce((sum, r) => sum + r.rowCount, 0),
          result: result as any,
          discrepancies: allDiscrepancies as any,
          processedAt: new Date()
        }
      })

      return result
    } catch (error: any) {
      console.error("[ReconciliationProcessor] Anchored processing error:", error)

      // Update status to FAILED
      await prisma.reconciliation.update({
        where: { id: reconciliationId },
        data: {
          status: ReconciliationStatus.FAILED,
          errorMessage: error.message
        }
      })

      return {
        success: false,
        error: error.message,
        anchor: { name: "", columns: [], rowCount: 0 },
        supportingResults: [],
        totalMatchedCount: 0,
        totalUnmatchedCount: 0,
        summary: "",
        reconciliationIntent: {
          type: "UNKNOWN",
          confidence: 0,
          anchorRoleExplanation: "",
          supportingRoleExplanation: ""
        }
      }
    }
  }

  /**
   * Classify reconciliation intent using AI
   * Determines if this is row-level, totals-only, aggregated-to-detail, etc.
   */
  static async classifyReconciliationIntent(inputs: {
    userDescription?: string
    jobName: string
    anchorColumns: string[]
    anchorRowCount: number
    supportingDocs: Array<{
      name: string
      columns: string[]
      rowCount: number
    }>
  }): Promise<ReconciliationIntent> {
    try {
      const openai = getOpenAIClient()

      // Build supporting docs summary
      const supportingSummary = inputs.supportingDocs.map(doc => 
        `- ${doc.name}: ${doc.rowCount} rows, columns: ${doc.columns.slice(0, 5).join(", ")}${doc.columns.length > 5 ? "..." : ""}`
      ).join("\n")

      // Analyze row count patterns for hints
      const avgSupportingRows = inputs.supportingDocs.reduce((sum, d) => sum + d.rowCount, 0) / inputs.supportingDocs.length
      const rowRatio = inputs.anchorRowCount / avgSupportingRows
      const rowRatioHint = rowRatio > 5 
        ? "Anchor has significantly more rows than supporting docs - likely ROW_LEVEL or AGGREGATED_TO_DETAIL"
        : rowRatio < 0.2
        ? "Supporting docs have significantly more rows than anchor - may be AGGREGATED_TO_DETAIL (anchor is summary)"
        : "Similar row counts - likely ROW_LEVEL matching"

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an accounting reconciliation expert. Classify the user's reconciliation intent based on the documents they're comparing.

Intent types:
- ROW_LEVEL: Standard row-to-row matching (most common)
- TOTALS_ONLY: Only verify total amounts match, individual rows don't need to match
- AGGREGATED_TO_DETAIL: One document has aggregated/summary data, other has detailed transactions
- HYBRID: Mix of approaches needed
- UNKNOWN: Cannot determine

Respond with JSON:
{
  "type": "ROW_LEVEL",
  "confidence": 0.85,
  "anchorRoleExplanation": "1-2 sentences explaining anchor's role",
  "supportingRoleExplanation": "1-2 sentences explaining supporting docs' role"
}`
          },
          {
            role: "user",
            content: `Job Name: ${inputs.jobName}

User Description: ${inputs.userDescription || "Not provided"}

Anchor Document:
- Columns: ${inputs.anchorColumns.slice(0, 10).join(", ")}${inputs.anchorColumns.length > 10 ? "..." : ""}
- Row Count: ${inputs.anchorRowCount}

Supporting Documents:
${supportingSummary}

Analysis hint: ${rowRatioHint}

Classify the reconciliation intent.`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 400
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        throw new Error("No response from AI")
      }

      const parsed = JSON.parse(response)

      return {
        type: parsed.type || "UNKNOWN",
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        anchorRoleExplanation: parsed.anchorRoleExplanation || "The anchor document serves as the source of truth.",
        supportingRoleExplanation: parsed.supportingRoleExplanation || "Supporting documents provide verification evidence.",
        userDescription: inputs.userDescription
      }
    } catch (error: any) {
      console.warn("[ReconciliationProcessor] Intent classification failed:", error.message)
      
      // Return reasonable defaults based on heuristics
      return {
        type: "ROW_LEVEL",
        confidence: 0.5,
        anchorRoleExplanation: "The anchor document serves as the authoritative source for this reconciliation.",
        supportingRoleExplanation: "Supporting documents provide evidence to verify or explain the anchor values.",
        userDescription: inputs.userDescription
      }
    }
  }

  /**
   * Generate summary for anchored reconciliation
   */
  static async generateAnchoredSummary(
    anchorName: string,
    supportingNames: string[],
    result: {
      totalMatchedCount: number
      totalUnmatchedCount: number
      supportingResults: SupportingDocumentResult[]
      reconciliationIntent: ReconciliationIntent
    }
  ): Promise<string> {
    const totalDiscrepancies = result.supportingResults.reduce(
      (sum, r) => sum + r.discrepancies.length, 0
    )

    // Simple summary if no issues
    if (totalDiscrepancies === 0) {
      return `Reconciliation complete: All ${result.totalMatchedCount} items matched between "${anchorName}" and ${supportingNames.length} supporting document(s). No discrepancies found.`
    }

    try {
      const openai = getOpenAIClient()

      // Build per-supporting summary
      const perDocSummary = result.supportingResults.map(r => 
        `- ${r.documentName}: ${r.matchedCount} matched, ${r.unmatchedCount} unmatched`
      ).join("\n")

      const intentContext = result.reconciliationIntent.type !== "UNKNOWN"
        ? `\nReconciliation Type: ${result.reconciliationIntent.type}\n${result.reconciliationIntent.anchorRoleExplanation}`
        : ""

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an accounting assistant summarizing reconciliation results. Be concise and professional. Reference the anchor document as the source of truth.`
          },
          {
            role: "user",
            content: `Summarize this anchored reconciliation:

Anchor (Source of Truth): "${anchorName}"
Supporting Documents: ${supportingNames.join(", ")}
${intentContext}

Results per supporting document:
${perDocSummary}

Total: ${result.totalMatchedCount} matched, ${result.totalUnmatchedCount} discrepancies

Provide a 2-3 sentence professional summary.`
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      })

      return completion.choices[0]?.message?.content || 
        `Reconciliation of "${anchorName}" against ${supportingNames.length} supporting document(s): ${result.totalMatchedCount} matched, ${result.totalUnmatchedCount} discrepancies.`
    } catch (error: any) {
      console.warn("[ReconciliationProcessor] AI summary failed:", error.message)
      return `Reconciliation of "${anchorName}" against ${supportingNames.length} supporting document(s): ${result.totalMatchedCount} matched, ${result.totalUnmatchedCount} discrepancies found.`
    }
  }

  /**
   * Detect a column likely containing monetary totals
   */
  static detectTotalColumn(sheet: SheetData): string | undefined {
    const amountPatterns = ["amount", "total", "balance", "value", "sum", "amt"]
    
    for (const col of sheet.columns) {
      const colLower = col.toLowerCase()
      if (amountPatterns.some(p => colLower.includes(p))) {
        // Verify it has numeric values
        const sampleValues = sheet.rows.slice(0, 5).map(r => r[col])
        const hasNumbers = sampleValues.some(v => !isNaN(parseFloat(String(v))))
        if (hasNumbers) {
          return col
        }
      }
    }
    
    return undefined
  }

  /**
   * Sum values in a column
   */
  static sumColumn(sheet: SheetData, column: string): number {
    let sum = 0
    for (const row of sheet.rows) {
      const val = parseFloat(String(row[column] || 0))
      if (!isNaN(val)) {
        sum += val
      }
    }
    return Math.round(sum * 100) / 100 // Round to 2 decimals
  }

  // ============================================
  // V1 ACCOUNTING CONTEXT & ENHANCED PROCESSING
  // ============================================

  /**
   * Build accounting context for AI prompts
   * Includes task, board, period, and template information
   */
  static async buildAccountingContext(
    reconciliationId: string,
    anchorRole?: string,
    userIntent?: string
  ): Promise<ReconciliationContext> {
    const reconciliation = await prisma.reconciliation.findUnique({
      where: { id: reconciliationId },
      include: {
        taskInstance: {
          include: {
            board: true
          }
        },
        template: true
      }
    })

    if (!reconciliation) {
      throw new Error("Reconciliation not found")
    }

    const task = reconciliation.taskInstance
    const board = task?.board
    const template = reconciliation.template

    // Determine if this is recurring (has template or board has automation)
    const isRecurring = Boolean(template?.id) || Boolean(board?.automationEnabled)

    // Build period string if board has dates
    let periodStart: string | undefined
    let periodEnd: string | undefined
    if (board?.periodStart) {
      periodStart = board.periodStart.toISOString().split("T")[0]
    }
    if (board?.periodEnd) {
      periodEnd = board.periodEnd.toISOString().split("T")[0]
    }

    // Get anchor role from reconciliation, parameter, or template
    const resolvedAnchorRole = anchorRole || 
      reconciliation.anchorRole || 
      template?.anchorRole || 
      "Source Document"

    // Get supporting roles from template if available
    const supportingRoles = (template?.supportingRoles as string[]) || ["Supporting Document"]

    return {
      taskName: task?.name || "Reconciliation",
      taskDescription: task?.description || undefined,
      boardName: board?.name,
      periodStart,
      periodEnd,
      isRecurring,
      anchorRole: resolvedAnchorRole,
      supportingRoles,
      userIntent: userIntent || template?.defaultIntent || undefined,
      priorExplanation: template?.priorExplanation || undefined
    }
  }

  /**
   * V1 Enhanced AI analysis with confidence and explanation
   * Works with both structured and unstructured documents
   */
  static async analyzeWithV1Output(
    context: ReconciliationContext,
    anchorDoc: DocumentWithSignals,
    supportingDocs: DocumentWithSignals[]
  ): Promise<V1ReconciliationResult> {
    try {
      const openai = getOpenAIClient()

      // Build document summaries for AI
      const anchorSummary = this.buildDocumentSummaryForAI(anchorDoc, context.anchorRole)
      const supportingSummaries = supportingDocs.map((doc, i) => 
        this.buildDocumentSummaryForAI(doc, context.supportingRoles[i] || `Supporting Document ${i + 1}`)
      )

      // Build the enhanced prompt with full accounting context
      const systemPrompt = `You are an accounting assistant helping with reconciliations. You prioritize EXPLAINABILITY over precision.

ACCOUNTING CONTEXT:
- Task: ${context.taskName}${context.taskDescription ? ` - ${context.taskDescription}` : ""}
- Board/Period: ${context.boardName || "N/A"} ${context.periodStart && context.periodEnd ? `(${context.periodStart} to ${context.periodEnd})` : ""}
- Recurring Reconciliation: ${context.isRecurring ? "Yes" : "No"}
- Anchor Role: ${context.anchorRole}
- Supporting Document Roles: ${context.supportingRoles.join(", ")}
${context.priorExplanation ? `\nPrior Period Notes: ${context.priorExplanation}` : ""}

Analyze the uploaded documents and provide:
1. reconciliation_intent: ROW_LEVEL | TOTALS_ONLY | AGGREGATED_TO_DETAIL | HYBRID | UNKNOWN
2. confidence_score: 0-100 (ACCOUNTING confidence - how confident an accountant would be, not algorithmic certainty)
3. explanation: 2-4 sentences in accounting language explaining what you found
4. key_findings: Array of 3-5 bullet points (e.g., "Totals match exactly", "One timing difference identified")
5. suggested_next_steps: Array of 2-4 bullet points for the accountant to verify

Focus on HIGH CONFIDENCE signals. It's OK to express uncertainty - that's valuable information.
For PDFs/images, focus on extracted totals and dates rather than row-level matching.

Respond with JSON only.`

      const userPrompt = `Analyze this reconciliation:

User Intent: ${context.userIntent || "Not specified - please infer from documents"}

ANCHOR DOCUMENT (Source of Truth):
${anchorSummary}

SUPPORTING DOCUMENTS:
${supportingSummaries.join("\n\n")}

Provide your V1 reconciliation analysis.`

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 1500
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        throw new Error("No response from AI")
      }

      const parsed = JSON.parse(response)

      // Determine confidence label
      const score = Math.min(100, Math.max(0, parsed.confidence_score || 50))
      const confidenceLabel: "High" | "Medium" | "Low" = 
        score >= 80 ? "High" : score >= 50 ? "Medium" : "Low"

      return {
        success: true,
        reconciliationType: parsed.reconciliation_intent || "UNKNOWN",
        confidenceScore: score,
        confidenceLabel,
        explanation: parsed.explanation || "Analysis complete.",
        keyFindings: parsed.key_findings || [],
        suggestedNextSteps: parsed.suggested_next_steps || [],
        anchorSummary: {
          role: context.anchorRole,
          filename: anchorDoc.name,
          fileType: anchorDoc.fileCategory === "unknown" ? "structured" : anchorDoc.fileCategory,
          extractedTotals: anchorDoc.signals?.totals,
          extractedDates: anchorDoc.signals?.dates,
          rowCount: anchorDoc.sheetData?.rowCount
        },
        supportingSummaries: supportingDocs.map((doc, i) => ({
          role: context.supportingRoles[i] || `Supporting ${i + 1}`,
          filename: doc.name,
          fileType: doc.fileCategory === "unknown" ? "structured" : doc.fileCategory,
          extractedTotals: doc.signals?.totals,
          extractedDates: doc.signals?.dates,
          rowCount: doc.sheetData?.rowCount
        }))
      }
    } catch (error: any) {
      console.error("[ReconciliationProcessor] V1 analysis failed:", error.message)
      
      return {
        success: false,
        reconciliationType: "UNKNOWN",
        confidenceScore: 0,
        confidenceLabel: "Low",
        explanation: "Analysis could not be completed.",
        keyFindings: [],
        suggestedNextSteps: ["Review documents manually"],
        anchorSummary: {
          role: context.anchorRole,
          filename: anchorDoc.name,
          fileType: anchorDoc.fileCategory === "unknown" ? "structured" : anchorDoc.fileCategory
        },
        supportingSummaries: supportingDocs.map((doc, i) => ({
          role: context.supportingRoles[i] || `Supporting ${i + 1}`,
          filename: doc.name,
          fileType: doc.fileCategory === "unknown" ? "structured" : doc.fileCategory
        })),
        error: error.message
      }
    }
  }

  /**
   * Build a text summary of a document for AI consumption
   */
  static buildDocumentSummaryForAI(doc: DocumentWithSignals, role: string): string {
    const parts: string[] = []
    parts.push(`Role: ${role}`)
    parts.push(`Filename: ${doc.name}`)
    parts.push(`Type: ${doc.fileCategory.toUpperCase()}`)

    if (doc.fileCategory === "structured" && doc.sheetData) {
      parts.push(`Columns: ${doc.sheetData.columns.join(", ")}`)
      parts.push(`Row Count: ${doc.sheetData.rowCount}`)
      
      // Sample data
      if (doc.sheetData.rows.length > 0) {
        const sample = doc.sheetData.rows.slice(0, 3)
        parts.push("Sample Data:")
        for (const row of sample) {
          const rowStr = Object.entries(row)
            .filter(([_, v]) => v !== "" && v !== null && v !== undefined)
            .slice(0, 5)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")
          parts.push(`  - ${rowStr}`)
        }
      }
    }

    if (doc.signals) {
      if (doc.signals.totals.length > 0) {
        parts.push("Extracted Totals:")
        for (const t of doc.signals.totals.slice(0, 5)) {
          parts.push(`  - ${t.label || "Total"}: ${t.currency || "$"}${t.value.toLocaleString()} (${t.confidence} confidence)`)
        }
      }
      if (doc.signals.dates.length > 0) {
        parts.push("Extracted Dates:")
        for (const d of doc.signals.dates.slice(0, 3)) {
          parts.push(`  - ${d.label || "Date"}: ${d.date} (${d.type || "other"})`)
        }
      }
      if (doc.signals.references.length > 0) {
        parts.push(`References Found: ${doc.signals.references.slice(0, 5).join(", ")}`)
      }
      if (doc.signals.documentType) {
        parts.push(`Detected Document Type: ${doc.signals.documentType}`)
      }
      if (doc.signals.textSummary && doc.fileCategory !== "structured") {
        // Include truncated text for unstructured docs
        const truncated = doc.signals.textSummary.length > 500 
          ? doc.signals.textSummary.substring(0, 500) + "..."
          : doc.signals.textSummary
        parts.push(`Text Extract: ${truncated}`)
      }
    }

    return parts.join("\n")
  }

  /**
   * Process a V1 reconciliation with mixed file types
   * Handles Excel, PDF, and images with signal extraction
   */
  static async processV1Reconciliation(
    reconciliationId: string,
    anchorRole?: string,
    intentDescription?: string
  ): Promise<V1ReconciliationResult> {
    // Update status to PROCESSING
    await prisma.reconciliation.update({
      where: { id: reconciliationId },
      data: { status: ReconciliationStatus.PROCESSING }
    })

    try {
      // Fetch reconciliation with task and board info
      const reconciliation = await prisma.reconciliation.findUnique({
        where: { id: reconciliationId },
        include: {
          taskInstance: { include: { board: true } },
          template: true
        }
      })

      if (!reconciliation) {
        throw new Error("Reconciliation not found")
      }

      // Build accounting context
      const context = await this.buildAccountingContext(
        reconciliationId,
        anchorRole,
        intentDescription
      )

      // Extract signals from anchor document
      const anchorMimeType = reconciliation.document1MimeType || "application/octet-stream"
      const anchorCategory = getFileCategory(anchorMimeType)
      
      const anchorUrl = reconciliation.document1Url || reconciliation.document1Key
      const anchorBuffer = await this.fetchDocumentBuffer(anchorUrl)
      
      let anchorSignals: ExtractedSignals | undefined
      let anchorSheetData: SheetData | undefined

      if (anchorCategory === "structured") {
        // For structured files, use existing extraction
        const extractResult = await AttachmentExtractionService.extractFromBuffer(
          anchorBuffer, anchorMimeType
        )
        if (extractResult.success && (extractResult as ExcelExtractionResult).sheets) {
          anchorSheetData = (extractResult as ExcelExtractionResult).sheets[0]
        }
        // Also extract signals from text
        anchorSignals = AttachmentExtractionService.extractSignalsFromText(extractResult.text)
      } else {
        // For PDF/images, use signal extraction
        const signalResult = await AttachmentExtractionService.extractSignals(
          anchorBuffer, anchorMimeType
        )
        if (signalResult.success) {
          anchorSignals = signalResult.signals
        }
      }

      const anchorDoc: DocumentWithSignals = {
        name: reconciliation.document1Name,
        url: anchorUrl,
        key: reconciliation.document1Key,
        mimeType: anchorMimeType,
        fileCategory: anchorCategory,
        signals: anchorSignals,
        sheetData: anchorSheetData
      }

      // Build list of supporting documents
      const supportingDocsList: Array<{ name: string; url: string; key: string; mimeType: string }> = [
        {
          name: reconciliation.document2Name,
          url: reconciliation.document2Url || reconciliation.document2Key,
          key: reconciliation.document2Key,
          mimeType: reconciliation.document2MimeType || "application/octet-stream"
        }
      ]

      // Add additional supporting docs
      const additionalDocs = (reconciliation.supportingDocuments as unknown as SupportingDocument[]) || []
      for (const doc of additionalDocs) {
        supportingDocsList.push({
          name: doc.name,
          url: doc.url || doc.key,
          key: doc.key,
          mimeType: (doc as any).mimeType || "application/octet-stream"
        })
      }

      // Extract signals from all supporting documents
      const supportingDocs: DocumentWithSignals[] = []
      for (const doc of supportingDocsList) {
        const category = getFileCategory(doc.mimeType)
        const buffer = await this.fetchDocumentBuffer(doc.url)
        
        let signals: ExtractedSignals | undefined
        let sheetData: SheetData | undefined

        if (category === "structured") {
          const extractResult = await AttachmentExtractionService.extractFromBuffer(
            buffer, doc.mimeType
          )
          if (extractResult.success && (extractResult as ExcelExtractionResult).sheets) {
            sheetData = (extractResult as ExcelExtractionResult).sheets[0]
          }
          signals = AttachmentExtractionService.extractSignalsFromText(extractResult.text)
        } else {
          const signalResult = await AttachmentExtractionService.extractSignals(buffer, doc.mimeType)
          if (signalResult.success) {
            signals = signalResult.signals
          }
        }

        supportingDocs.push({
          name: doc.name,
          url: doc.url,
          key: doc.key,
          mimeType: doc.mimeType,
          fileCategory: category,
          signals,
          sheetData
        })
      }

      // Run V1 AI analysis
      const v1Result = await this.analyzeWithV1Output(context, anchorDoc, supportingDocs)

      // If we have structured data, also run traditional comparison for backwards compat
      if (anchorDoc.fileCategory === "structured" && anchorDoc.sheetData) {
        const structuredSupporting = supportingDocs.filter(d => d.fileCategory === "structured" && d.sheetData)
        
        if (structuredSupporting.length > 0) {
          // Run existing row-level comparison logic
          let totalMatched = 0
          let totalUnmatched = 0
          const allDiscrepancies: Discrepancy[] = []
          const allMappings: ColumnMapping[] = []

          for (const supportingDoc of structuredSupporting) {
            if (!supportingDoc.sheetData) continue

            const deterministicMappings = this.detectColumnMappings(anchorDoc.sheetData, supportingDoc.sheetData)
            let columnMappings: ColumnMapping[]
            try {
              columnMappings = await this.detectColumnMappingsWithAI(
                anchorDoc.sheetData,
                supportingDoc.sheetData,
                deterministicMappings
              )
            } catch {
              columnMappings = deterministicMappings
            }

            const keyColumn = this.detectKeyColumn(anchorDoc.sheetData, supportingDoc.sheetData, columnMappings)
            const comparison = this.compareSheets(
              anchorDoc.sheetData,
              supportingDoc.sheetData,
              columnMappings,
              keyColumn
            )

            totalMatched += comparison.matchedCount
            totalUnmatched += comparison.unmatchedCount
            allDiscrepancies.push(...comparison.discrepancies)
            allMappings.push(...columnMappings)
          }

          v1Result.matchedCount = totalMatched
          v1Result.unmatchedCount = totalUnmatched
          v1Result.discrepancies = allDiscrepancies
          v1Result.columnMappings = allMappings
        }
      }

      // Update the reconciliation record with V1 results
      await prisma.reconciliation.update({
        where: { id: reconciliationId },
        data: {
          status: v1Result.success ? ReconciliationStatus.COMPLETED : ReconciliationStatus.FAILED,
          summary: v1Result.explanation,
          confidenceScore: v1Result.confidenceScore,
          keyFindings: v1Result.keyFindings,
          suggestedNextSteps: v1Result.suggestedNextSteps,
          matchedCount: v1Result.matchedCount,
          unmatchedCount: v1Result.unmatchedCount,
          result: v1Result as any,
          discrepancies: v1Result.discrepancies as any,
          processedAt: new Date(),
          errorMessage: v1Result.error
        }
      })

      return v1Result
    } catch (error: any) {
      console.error("[ReconciliationProcessor] V1 processing error:", error)

      await prisma.reconciliation.update({
        where: { id: reconciliationId },
        data: {
          status: ReconciliationStatus.FAILED,
          errorMessage: error.message
        }
      })

      return {
        success: false,
        reconciliationType: "UNKNOWN",
        confidenceScore: 0,
        confidenceLabel: "Low",
        explanation: "Processing failed.",
        keyFindings: [],
        suggestedNextSteps: ["Review error and retry"],
        anchorSummary: { role: "Unknown", filename: "Unknown", fileType: "structured" },
        supportingSummaries: [],
        error: error.message
      }
    }
  }

  /**
   * Helper to fetch document buffer from URL
   */
  static async fetchDocumentBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.statusText}`)
    }
    return Buffer.from(await response.arrayBuffer())
  }
}
