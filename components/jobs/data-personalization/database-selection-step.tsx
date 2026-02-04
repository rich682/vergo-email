"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Database,
  AlertCircle,
  CheckCircle,
  Loader2,
  Users,
  AlertTriangle,
  Calendar,
} from "lucide-react"

// Types from database service
interface DatabaseSchemaColumn {
  key: string
  label: string
  dataType: "text" | "number" | "date" | "boolean" | "currency"
  required: boolean
  order: number
}

interface DatabaseSchema {
  columns: DatabaseSchemaColumn[]
  version: number
}

interface DatabaseRow {
  [key: string]: string | number | boolean | null
}

interface EligibleDatabase {
  id: string
  name: string
  description: string | null
  rowCount: number
  schema: DatabaseSchema
  hasEmailColumn: boolean
  hasFirstNameColumn: boolean
  hasPeriodColumn: boolean
  emailColumnKey: string | null
  firstNameColumnKey: string | null
  periodColumnKey: string | null
}

interface DatabaseSelectionStepProps {
  jobId: string
  boardPeriod?: string | null // e.g., "Q1 2026" or null if not recurring
  onDatabaseSelected: (data: {
    databaseId: string
    databaseName: string
    schema: DatabaseSchema
    rows: DatabaseRow[]
    emailColumnKey: string
    firstNameColumnKey: string
    recipientCount: number
  }) => void
  onCancel: () => void
}

// Helper to normalize column keys for matching
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, "")
}

// Check if a column matches email patterns
function isEmailColumn(col: DatabaseSchemaColumn): boolean {
  const key = normalizeKey(col.key)
  const emailPatterns = ["email", "emailaddress", "recipientemail", "contactemail", "mail"]
  return emailPatterns.some(p => key.includes(p))
}

// Check if a column matches first name patterns
function isFirstNameColumn(col: DatabaseSchemaColumn): boolean {
  const key = normalizeKey(col.key)
  const namePatterns = ["firstname", "first", "name"]
  // Avoid matching "company_name" or "last_name"
  if (key.includes("company") || key.includes("last")) return false
  return namePatterns.some(p => key === p || key.includes("firstname"))
}

// Check if a column matches period patterns
function isPeriodColumn(col: DatabaseSchemaColumn): boolean {
  const key = normalizeKey(col.key)
  const periodPatterns = ["period", "timeperiod", "reportingperiod"]
  return periodPatterns.some(p => key.includes(p))
}

// Month names for parsing
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
]
const MONTH_ABBREVS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec"
]

/**
 * Parse a period value and extract month and year
 * Supports formats:
 * - "February 2026", "Feb 2026" (month name + year)
 * - "2/1/26", "02/01/2026" (date formats MM/DD/YY or MM/DD/YYYY)
 * - "2026-02", "2026-02-01" (ISO format)
 * - "Q1 2026" (quarterly - returns quarter info)
 * Returns { month: 1-12, year: YYYY, quarter?: 1-4 } or null if can't parse
 */
function parsePeriodValue(value: string): { month?: number; year: number; quarter?: number } | null {
  const trimmed = value.trim()
  
  // Try "Month YYYY" or "Mon YYYY" format (e.g., "February 2026", "Feb 2026")
  const monthYearMatch = trimmed.match(/^([a-zA-Z]+)\s+(\d{4})$/i)
  if (monthYearMatch) {
    const monthStr = monthYearMatch[1].toLowerCase()
    const year = parseInt(monthYearMatch[2])
    let month = MONTH_NAMES.indexOf(monthStr) + 1
    if (month === 0) {
      month = MONTH_ABBREVS.indexOf(monthStr.substring(0, 3)) + 1
    }
    if (month > 0) {
      return { month, year }
    }
  }
  
  // Try "QN YYYY" format (e.g., "Q1 2026")
  const quarterMatch = trimmed.match(/^Q([1-4])\s+(\d{4})$/i)
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1])
    const year = parseInt(quarterMatch[2])
    return { year, quarter }
  }
  
  // Try MM/DD/YY or MM/DD/YYYY format (e.g., "2/1/26", "02/01/2026")
  const dateSlashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (dateSlashMatch) {
    const month = parseInt(dateSlashMatch[1])
    let year = parseInt(dateSlashMatch[3])
    // Convert 2-digit year to 4-digit
    if (year < 100) {
      year = year >= 50 ? 1900 + year : 2000 + year
    }
    if (month >= 1 && month <= 12) {
      return { month, year }
    }
  }
  
  // Try YYYY-MM or YYYY-MM-DD format (e.g., "2026-02", "2026-02-01")
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (isoMatch) {
    const year = parseInt(isoMatch[1])
    const month = parseInt(isoMatch[2])
    if (month >= 1 && month <= 12) {
      return { month, year }
    }
  }
  
  return null
}

/**
 * Check if two period values match semantically
 * Handles different formats: "February 2026" matches "2/1/26"
 */
function periodsMatch(boardPeriod: string, rowPeriod: string): boolean {
  const board = parsePeriodValue(boardPeriod)
  const row = parsePeriodValue(rowPeriod)
  
  if (!board || !row) {
    // Fall back to simple string comparison if can't parse
    return boardPeriod.toLowerCase().trim() === rowPeriod.toLowerCase().trim()
  }
  
  // If both have quarters, compare quarters
  if (board.quarter && row.quarter) {
    return board.year === row.year && board.quarter === row.quarter
  }
  
  // If board is quarterly and row has a month, check if month falls in quarter
  if (board.quarter && row.month) {
    const rowQuarter = Math.ceil(row.month / 3)
    return board.year === row.year && board.quarter === rowQuarter
  }
  
  // If row is quarterly and board has a month, check if month falls in quarter
  if (row.quarter && board.month) {
    const boardQuarter = Math.ceil(board.month / 3)
    return board.year === row.year && row.quarter === boardQuarter
  }
  
  // Both have month and year - compare them
  if (board.month && row.month) {
    return board.year === row.year && board.month === row.month
  }
  
  // Just compare years if that's all we have
  return board.year === row.year
}

export function DatabaseSelectionStep({
  jobId,
  boardPeriod,
  onDatabaseSelected,
  onCancel,
}: DatabaseSelectionStepProps) {
  const [loading, setLoading] = useState(true)
  const [databases, setDatabases] = useState<EligibleDatabase[]>([])
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>("")
  const [selectedDatabase, setSelectedDatabase] = useState<EligibleDatabase | null>(null)
  const [loadingRows, setLoadingRows] = useState(false)
  const [rows, setRows] = useState<DatabaseRow[]>([])
  const [filteredRows, setFilteredRows] = useState<DatabaseRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // Fetch eligible databases
  useEffect(() => {
    const fetchDatabases = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch("/api/databases", { credentials: "include" })
        if (!response.ok) {
          throw new Error("Failed to fetch databases")
        }
        const data = await response.json()
        
        // Process databases to identify eligible ones
        const eligible: EligibleDatabase[] = (data.databases || [])
          .map((db: any) => {
            const schema = db.schema as DatabaseSchema
            const columns = schema?.columns || []
            
            const emailCol = columns.find(isEmailColumn)
            const firstNameCol = columns.find(isFirstNameColumn)
            const periodCol = columns.find(isPeriodColumn)
            
            return {
              id: db.id,
              name: db.name,
              description: db.description,
              rowCount: db.rowCount || 0,
              schema,
              hasEmailColumn: !!emailCol,
              hasFirstNameColumn: !!firstNameCol,
              hasPeriodColumn: !!periodCol,
              emailColumnKey: emailCol?.key || null,
              firstNameColumnKey: firstNameCol?.key || null,
              periodColumnKey: periodCol?.key || null,
            }
          })
          .filter((db: EligibleDatabase) => db.hasEmailColumn && db.hasFirstNameColumn)
        
        setDatabases(eligible)
      } catch (err: any) {
        console.error("Error fetching databases:", err)
        setError(err.message || "Failed to load databases")
      } finally {
        setLoading(false)
      }
    }
    
    fetchDatabases()
  }, [])

  // Fetch database rows when selected
  const handleDatabaseSelect = useCallback(async (databaseId: string) => {
    setSelectedDatabaseId(databaseId)
    const db = databases.find(d => d.id === databaseId)
    setSelectedDatabase(db || null)
    
    if (!db) return
    
    setLoadingRows(true)
    setError(null)
    setRows([])
    setFilteredRows([])
    
    try {
      const response = await fetch(`/api/databases/${databaseId}`, { credentials: "include" })
      if (!response.ok) {
        throw new Error("Failed to fetch database data")
      }
      const data = await response.json()
      const allRows = (data.rows || []) as DatabaseRow[]
      setRows(allRows)
      
      // Filter by period if board has a period and database has period column
      if (boardPeriod && db.hasPeriodColumn && db.periodColumnKey) {
        const periodKey = db.periodColumnKey
        const filtered = allRows.filter(row => {
          const rowPeriod = row[periodKey]
          if (!rowPeriod) return false
          return periodsMatch(boardPeriod, String(rowPeriod))
        })
        setFilteredRows(filtered)
        
        if (filtered.length === 0) {
          setError(`No rows found matching period "${boardPeriod}". Make sure the database has data for this period.`)
        }
      } else {
        // No period filtering needed
        setFilteredRows(allRows)
      }
    } catch (err: any) {
      console.error("Error fetching database rows:", err)
      setError(err.message || "Failed to load database data")
    } finally {
      setLoadingRows(false)
    }
  }, [databases, boardPeriod])

  // Handle continue
  const handleContinue = () => {
    if (!selectedDatabase || filteredRows.length === 0) return
    
    onDatabaseSelected({
      databaseId: selectedDatabase.id,
      databaseName: selectedDatabase.name,
      schema: selectedDatabase.schema,
      rows: filteredRows,
      emailColumnKey: selectedDatabase.emailColumnKey!,
      firstNameColumnKey: selectedDatabase.firstNameColumnKey!,
      recipientCount: filteredRows.length,
    })
  }

  // Check if period filtering is needed
  const needsPeriodFilter = Boolean(boardPeriod)
  const selectedHasPeriod = selectedDatabase?.hasPeriodColumn ?? false

  // Preview rows (first 5)
  const previewRows = filteredRows.slice(0, 5)
  const previewColumns = selectedDatabase?.schema.columns.slice(0, 4) || []

  return (
    <div className="space-y-6">
      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin mr-2" />
          <span className="text-gray-600">Loading databases...</span>
        </div>
      )}

      {/* No Eligible Databases */}
      {!loading && databases.length === 0 && (
        <div className="text-center py-8">
          <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Eligible Databases</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            You need a database with <strong>email</strong> and <strong>first name</strong> columns to use data personalization.
            Create a database in the Databases section first.
          </p>
        </div>
      )}

      {/* Database Selection */}
      {!loading && databases.length > 0 && (
        <div className="space-y-4">
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-gray-500" />
              Select Database
            </Label>
            <Select value={selectedDatabaseId} onValueChange={handleDatabaseSelect}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a database with recipient data..." />
              </SelectTrigger>
              <SelectContent>
                {databases.map((db) => (
                  <SelectItem key={db.id} value={db.id}>
                    <div className="flex items-center gap-2">
                      <span>{db.name}</span>
                      <span className="text-xs text-gray-400">({db.rowCount} rows)</span>
                      {needsPeriodFilter && !db.hasPeriodColumn && (
                        <span className="text-xs text-amber-500">(no period column)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Period Warning */}
          {needsPeriodFilter && selectedDatabase && !selectedHasPeriod && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Period Column Missing</p>
                <p className="text-sm text-amber-600">
                  This database doesn't have a period column. All {rows.length} rows will be included.
                  For recurring boards, add a "period" column to filter by "{boardPeriod}".
                </p>
              </div>
            </div>
          )}

          {/* Board Period Info */}
          {boardPeriod && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-blue-700">
                Board Period: <strong>{boardPeriod}</strong>
                {selectedHasPeriod && ` - filtering to matching rows`}
              </span>
            </div>
          )}

          {/* Loading Rows */}
          {loadingRows && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-orange-500 animate-spin mr-2" />
              <span className="text-gray-500">Loading data...</span>
            </div>
          )}

          {/* Validation Summary */}
          {selectedDatabase && !loadingRows && filteredRows.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                  <Database className="w-3 h-3" />
                  Total Rows
                </div>
                <div className="text-lg font-semibold text-gray-900">
                  {rows.length}
                </div>
              </div>
              {needsPeriodFilter && selectedHasPeriod && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-blue-600 text-xs mb-1">
                    <Calendar className="w-3 h-3" />
                    Matching Period
                  </div>
                  <div className="text-lg font-semibold text-blue-700">
                    {filteredRows.length}
                  </div>
                </div>
              )}
              <div className="bg-green-50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
                  <Users className="w-3 h-3" />
                  Recipients
                </div>
                <div className="text-lg font-semibold text-green-700">
                  {filteredRows.length}
                </div>
              </div>
            </div>
          )}

          {/* Data Preview */}
          {selectedDatabase && !loadingRows && previewRows.length > 0 && (
            <div>
              <Label className="mb-2 block">Preview (first 5 rows)</Label>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Email</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Name</th>
                        {previewColumns
                          .filter(col => col.key !== selectedDatabase.emailColumnKey && col.key !== selectedDatabase.firstNameColumnKey)
                          .slice(0, 2)
                          .map((col) => (
                            <th key={col.key} className="px-3 py-2 text-left font-medium text-gray-600">
                              {col.label}
                            </th>
                          ))}
                        {selectedDatabase.schema.columns.length > 4 && (
                          <th className="px-3 py-2 text-left font-medium text-gray-400">
                            +{selectedDatabase.schema.columns.length - 4} more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewRows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          <td className="px-3 py-2 text-gray-900">
                            {row[selectedDatabase.emailColumnKey!] || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row[selectedDatabase.firstNameColumnKey!] || <span className="text-gray-300">—</span>}
                          </td>
                          {previewColumns
                            .filter(col => col.key !== selectedDatabase.emailColumnKey && col.key !== selectedDatabase.firstNameColumnKey)
                            .slice(0, 2)
                            .map((col) => (
                              <td key={col.key} className="px-3 py-2 text-gray-600 truncate max-w-[150px]">
                                {row[col.key] ?? <span className="text-gray-300">—</span>}
                              </td>
                            ))}
                          {selectedDatabase.schema.columns.length > 4 && (
                            <td className="px-3 py-2 text-gray-400">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleContinue}
          disabled={!selectedDatabase || filteredRows.length === 0 || loadingRows}
        >
          Continue
          <span className="ml-2 text-xs opacity-75">
            ({filteredRows.length} recipients)
          </span>
        </Button>
      </div>
    </div>
  )
}
