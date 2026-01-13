"use client"

import { useState, useRef, useMemo } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { AlertTriangle, Download, Upload, CheckCircle2 } from "lucide-react"

// Core fields that should be ignored (not treated as tags)
const CORE_FIELDS = new Set([
  "email",
  "firstname", "first_name", "first name",
  "lastname", "last_name", "last name",
  "phone",
  "type", "contacttype", "contact_type",
  "groups", "group"
])

type ImportSummary = {
  contactsUpdated: number
  tagsCreated: number
  tagValuesSet: number
  tagValuesRemoved: number
  skippedUnknownEmails: number
  unknownEmails: string[]
}

type Props = {
  onClose: () => void
  onSuccess: () => void
  existingTags: Array<{ id: string; name: string; displayName: string }>
}

export function TagImportModal({ onClose, onSuccess, existingTags }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<any[][]>([])
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Identify tag columns (non-core fields)
  const { tagColumns, newTagColumns, existingTagColumns } = useMemo(() => {
    const tags: string[] = []
    const newTags: string[] = []
    const existingTags_: string[] = []
    
    const existingTagNames = new Set(existingTags.map(t => t.name.toLowerCase()))
    
    headers.forEach(h => {
      const normalized = h.toLowerCase().replace(/\s+/g, "_")
      if (!CORE_FIELDS.has(normalized) && !CORE_FIELDS.has(h.toLowerCase())) {
        tags.push(h)
        if (existingTagNames.has(normalized)) {
          existingTags_.push(h)
        } else {
          newTags.push(h)
        }
      }
    })
    return { tagColumns: tags, newTagColumns: newTags, existingTagColumns: existingTags_ }
  }, [headers, existingTags])

  // Maximum file size (5MB)
  const MAX_FILE_SIZE_MB = 5
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

  const handleFileChange = async (selected: File | null) => {
    setFile(selected)
    setSummary(null)
    setError(null)
    setHeaders([])
    setSelectedFileName(selected ? selected.name : null)
    setShowPreview(false)

    if (!selected) return

    // Check file size
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (selected.size / (1024 * 1024)).toFixed(2)
      setError(`File too large (${sizeMB}MB). Maximum allowed size is ${MAX_FILE_SIZE_MB}MB.`)
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
      
      // Check for email column
      const hasEmail = cols.some(c => c.toLowerCase() === "email")
      if (!hasEmail) {
        setError("File must have an EMAIL column to match contacts")
        setFile(null)
        setSelectedFileName(null)
        return
      }
      
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
      setError("Please select a file")
      return
    }

    if (tagColumns.length === 0) {
      setError("No tag columns found in the file. Add columns beyond EMAIL, FIRST_NAME, LAST_NAME.")
      return
    }

    setUploading(true)
    setError(null)
    setSummary(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/contacts/tags/import", {
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
        <h3 className="text-lg font-semibold">Import Tag Data</h3>
        <p className="text-sm text-gray-600">
          Bulk-update personalization data for existing contacts.
          Contacts are matched by email address.
        </p>
      </div>

      {/* Download template */}
      <a
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
        href="/api/templates/tags"
        target="_blank"
        rel="noreferrer"
      >
        <Download className="w-4 h-4" />
        Download Contact List
        <span className="text-xs text-blue-500">(includes all contacts & existing tags)</span>
      </a>

      {/* Warning banner */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <div className="font-medium">Important</div>
            <p className="text-amber-700 mt-1">
              Uploading will <strong>replace all tag values</strong> for contacts in this file.
              Leave cells blank to remove existing values.
            </p>
          </div>
        </div>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label>Upload filled spreadsheet</Label>
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
              <Upload className="w-4 h-4 mr-2" />
              Choose File
            </Button>
            <span className="text-sm text-gray-600">
              {selectedFileName || "No file chosen"}
            </span>
          </div>
        </div>

        {/* Preview Section */}
        {showPreview && headers.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-white p-3 text-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-gray-900">Preview</div>
              <span className="text-xs text-gray-500">{previewRows.length} rows shown</span>
            </div>
            
            {/* Tag columns detected */}
            <div className="space-y-2">
              {existingTagColumns.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Existing tags to update:</div>
                  <div className="flex flex-wrap gap-1">
                    {existingTagColumns.map((h, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {newTagColumns.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">New tags to create:</div>
                  <div className="flex flex-wrap gap-1">
                    {newTagColumns.map((h, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
                        {h} <span className="text-green-600">(new)</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {tagColumns.length === 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                  No tag columns detected. Add columns beyond EMAIL, FIRST_NAME, LAST_NAME.
                </div>
              )}
            </div>
            
            {/* Data preview table */}
            {previewRows.length > 0 && tagColumns.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border border-gray-200 rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium text-gray-600 border-b">Email</th>
                      {tagColumns.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-left font-medium text-gray-600 border-b">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIdx) => {
                      const emailIdx = headers.findIndex(h => h.toLowerCase() === "email")
                      return (
                        <tr key={rowIdx} className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="px-2 py-1 text-gray-700 border-b truncate max-w-[200px]">
                            {row[emailIdx] || ""}
                          </td>
                          {tagColumns.map((tagCol, colIdx) => {
                            const tagIdx = headers.findIndex(h => h === tagCol)
                            return (
                              <td key={colIdx} className="px-2 py-1 text-gray-700 border-b truncate max-w-[150px]">
                                {row[tagIdx] !== undefined && row[tagIdx] !== null ? String(row[tagIdx]) : ""}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Success Summary */}
        {summary && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-green-800">Import Complete</span>
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
              <div className="flex justify-between">
                <span>Contacts updated:</span>
                <span className="font-medium">{summary.contactsUpdated}</span>
              </div>
              {summary.tagsCreated > 0 && (
                <div className="flex justify-between">
                  <span>New tags created:</span>
                  <span className="font-medium">{summary.tagsCreated}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tag values set:</span>
                <span className="font-medium">{summary.tagValuesSet}</span>
              </div>
              {summary.tagValuesRemoved > 0 && (
                <div className="flex justify-between">
                  <span>Tag values removed:</span>
                  <span className="font-medium">{summary.tagValuesRemoved}</span>
                </div>
              )}
            </div>
            
            {summary.skippedUnknownEmails > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                <span className="font-medium">{summary.skippedUnknownEmails} email(s) not found</span> - skipped
                {summary.unknownEmails && summary.unknownEmails.length > 0 && (
                  <span className="block mt-1 text-amber-600">
                    {summary.unknownEmails.slice(0, 5).join(", ")}
                    {summary.unknownEmails.length > 5 ? "..." : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={uploading || !file || tagColumns.length === 0}>
            {uploading ? "Importing..." : "Import Tag Data"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
