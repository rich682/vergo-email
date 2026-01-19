"use client"

import { useMemo, useState, useRef } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { humanizeStateKey } from "@/lib/utils/humanize"
import { AlertTriangle } from "lucide-react"

// Core contact fields that are recognized
const CORE_FIELDS = new Set([
  "email",
  "firstname", "first_name", "first name",
  "lastname", "last_name", "last name",
  "company", "companyname", "company_name", "company name",
  "phone",
  "type", "contacttype", "contact_type",
  "groups", "group"
])

type ImportSummary = {
  contactsCreated: number
  contactsUpdated: number
  groupsCreated: number
  typesCreated: number
  skipped: number
  skippedMissingEmail: number
  totalRows: number
  rowsWithEmail: number
  distinctEmailsProcessed: number
  headers: string[]
  skippedSamples?: Array<{ rowNumber: number; reason: string }>
  sampleMissingEmailRowNumbers?: number[]
  ignoredColumns?: string[]
}

type Props = {
  onClose: () => void
  onSuccess: () => void
}

export function ImportModal({ onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<any[][]>([])
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Detect which columns are core vs unknown
  const { coreColumns, unknownColumns } = useMemo(() => {
    const core: string[] = []
    const unknown: string[] = []
    headers.forEach(h => {
      const normalized = h.toLowerCase().replace(/\s+/g, "_")
      if (CORE_FIELDS.has(normalized) || CORE_FIELDS.has(h.toLowerCase())) {
        core.push(h)
      } else {
        unknown.push(h)
      }
    })
    return { coreColumns: core, unknownColumns: unknown }
  }, [headers])

  // Maximum file size (5MB)
  const MAX_FILE_SIZE_MB = 5
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

  const handleFileChange = async (selected: File | null) => {
    setFile(selected)
    setSummary(null)
    setError(null)
    setHeaders([])
    setSelectedFileName(selected ? selected.name : null)

    if (!selected) return

    // Check file size
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (selected.size / (1024 * 1024)).toFixed(2)
      setError(`File too large (${sizeMB}MB). Maximum allowed size is ${MAX_FILE_SIZE_MB}MB. Please split the file or remove extra columns.`)
      setFile(null)
      setSelectedFileName(null)
      return
    }

    try {
      const buffer = await selected.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array" })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
      const firstRow = rows[0] || []
      const cols = firstRow.map((c) => (c ? c.toString() : "")).filter(Boolean)
      setHeaders(cols)
      
      // Store preview rows (first 5 data rows)
      const dataRows = rows.slice(1, 6)
      setPreviewRows(dataRows)
      setShowPreview(true)
    } catch (err: any) {
      setError(err?.message || "Failed to read file")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError("Please select a CSV or XLSX file")
      return
    }

    setUploading(true)
    setError(null)
    setSummary(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("coreFieldsOnly", "true") // Only import core fields

      const res = await fetch("/api/entities/import", {
        method: "POST",
        body: formData
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Import failed")
      }

      const data: ImportSummary = await res.json()
      setSummary(data)
      onSuccess()
    } catch (err: any) {
      setError(err?.message || "Import failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Import Contacts</h3>
        <p className="text-sm text-gray-600">
          Add or update contacts with their core information.
          Existing contacts matched by email will be updated.
        </p>
      </div>

      <a
        className="text-sm text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
        href="/api/templates/contacts"
        target="_blank"
        rel="noreferrer"
      >
        📥 Download template
      </a>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label>CSV or Excel file</Label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose File
            </Button>
            <span className="text-sm text-gray-600">
              {selectedFileName || "No file chosen"}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Supported formats: CSV, XLSX, XLS. Columns: email (required), first_name, last_name, phone, type, groups.
          </p>
        </div>

        {/* Preview Section */}
        {showPreview && headers.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-white p-3 text-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-gray-900">Preview</div>
              <span className="text-xs text-gray-500">{previewRows.length} of {previewRows.length}+ rows shown</span>
            </div>
            
            {/* Column mapping */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-600">Detected columns:</div>
              <div className="flex flex-wrap gap-1">
                {coreColumns.map((h, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800"
                  >
                    {humanizeStateKey(h)}
                  </span>
                ))}
              </div>
            </div>

            {/* Warning about unknown columns */}
            {unknownColumns.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <div className="font-medium mb-1">Unknown columns will be ignored:</div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {unknownColumns.map((h, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                          {humanizeStateKey(h)}
                        </span>
                      ))}
                    </div>
                    <p className="text-amber-700">
                      To add personalization data (like invoice numbers or due dates), use the <strong>Tags</strong> tab instead.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Data preview table - only show core columns */}
            {previewRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border border-gray-200 rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      {headers.map((h, i) => {
                        const normalized = h.toLowerCase().replace(/\s+/g, "_")
                        const isCore = CORE_FIELDS.has(normalized) || CORE_FIELDS.has(h.toLowerCase())
                        if (!isCore) return null
                        return (
                          <th key={i} className="px-2 py-1 text-left font-medium text-gray-600 border-b">
                            {humanizeStateKey(h)}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIdx) => (
                      <tr key={rowIdx} className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        {headers.map((h, colIdx) => {
                          const normalized = h.toLowerCase().replace(/\s+/g, "_")
                          const isCore = CORE_FIELDS.has(normalized) || CORE_FIELDS.has(h.toLowerCase())
                          if (!isCore) return null
                          return (
                            <td key={colIdx} className="px-2 py-1 text-gray-700 border-b truncate max-w-[150px]">
                              {row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]) : ""}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}


        {summary && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-semibold text-green-800">Import Complete</span>
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
              <div className="flex justify-between">
                <span>New contacts:</span>
                <span className="font-medium">{summary.contactsCreated}</span>
              </div>
              <div className="flex justify-between">
                <span>Updated contacts:</span>
                <span className="font-medium">{summary.contactsUpdated}</span>
              </div>
              {summary.groupsCreated > 0 && (
                <div className="flex justify-between">
                  <span>New groups created:</span>
                  <span className="font-medium">{summary.groupsCreated}</span>
                </div>
              )}
              {summary.typesCreated && summary.typesCreated > 0 && (
                <div className="flex justify-between">
                  <span>New types created:</span>
                  <span className="font-medium">{summary.typesCreated}</span>
                </div>
              )}
            </div>

            {summary.ignoredColumns && summary.ignoredColumns.length > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                <span className="font-medium">Ignored columns:</span> {summary.ignoredColumns.join(", ")}
              </div>
            )}
            
            {summary.skippedMissingEmail > 0 && (
              <div className="text-xs text-yellow-700 bg-yellow-50 rounded p-2">
                <span className="font-medium">{summary.skippedMissingEmail} row(s) skipped</span> - missing email address
                {summary.sampleMissingEmailRowNumbers && summary.sampleMissingEmailRowNumbers.length > 0 && (
                  <span className="block mt-1">Rows: {summary.sampleMissingEmailRowNumbers.slice(0, 5).join(", ")}{summary.sampleMissingEmailRowNumbers.length > 5 ? "..." : ""}</span>
                )}
              </div>
            )}
            
            <div className="text-xs text-gray-500 pt-2 border-t border-green-200">
              Processed {summary.rowsWithEmail} of {summary.totalRows} rows ({summary.distinctEmailsProcessed} unique emails)
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={uploading || !file}>
            {uploading ? "Importing..." : "Import"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
