/**
 * Reconciliation Processor Service
 * Compares two Excel/CSV files and generates variance reports.
 * Uses attachment-extraction.service.ts for file parsing.
 */

import { prisma } from "@/lib/prisma"
import { ReconciliationStatus } from "@prisma/client"
import { AttachmentExtractionService, SheetData, ExcelExtractionResult } from "./attachment-extraction.service"
import OpenAI from "openai"
import { RECONCILIATION_LIMITS, RECONCILIATION_MESSAGES } from "@/lib/constants/reconciliation"

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
}
