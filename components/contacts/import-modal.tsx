"use client"

import { useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type ImportSummary = {
  contactsCreated: number
  contactsUpdated: number
  groupsCreated: number
  customFieldsCreated: number
  customFieldsUpdated: number
  customFieldsDeleted: number
  skipped: number
  skippedMissingEmail: number
  totalRows: number
  rowsWithEmail: number
  distinctEmailsProcessed: number
  headers: string[]
  skippedSamples?: Array<{ rowNumber: number; reason: string }>
  sampleMissingEmailRowNumbers?: number[]
}

type Props = {
  onClose: () => void
  onSuccess: () => void
}

export function ImportModal({ onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncCustomFields, setSyncCustomFields] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)

  const detectedColumns = useMemo(() => headers.join(", "), [headers])

  const handleFileChange = async (selected: File | null) => {
    setFile(selected)
    setSummary(null)
    setError(null)
    setHeaders([])
    setSyncCustomFields(false)
    setSelectedFileName(selected ? selected.name : null)

    if (!selected) return

    try {
      const buffer = await selected.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array" })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
      const firstRow = rows[0] || []
      const cols = firstRow.map((c) => (c ? c.toString() : "")).filter(Boolean)
      setHeaders(cols)
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
      formData.append("syncCustomFields", syncCustomFields ? "true" : "false")

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
          Email is required; all other columns are optional. Unknown columns become custom fields.
          Existing contacts matched by email will be updated (values may be overwritten).
        </p>
      </div>

      <a
        className="text-sm text-gray-600 underline"
        href="/api/templates/contacts"
        target="_blank"
        rel="noreferrer"
      >
        Download template
      </a>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="import-file">CSV or Excel file</Label>
          <div className="flex items-center gap-3">
            <label
              htmlFor="import-file"
              className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
            >
              Choose File
            </label>
            <span className="text-sm text-gray-600">
              {selectedFileName || "No file chosen"}
            </span>
            <input
              id="import-file"
              type="file"
              className="sr-only"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            />
          </div>
          <p className="text-xs text-gray-500">
            Supported formats: CSV, XLSX, XLS. Columns: email (required), firstName, lastName, phone, type, groups, plus any custom fields.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="syncCustomFields"
            type="checkbox"
            checked={syncCustomFields}
            onChange={(e) => setSyncCustomFields(e.target.checked)}
          />
          <Label htmlFor="syncCustomFields" className="text-sm font-normal">
            Sync custom fields from this file (remove values not present)
          </Label>
        </div>

        {headers.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <div className="font-medium">Detected headers</div>
            <div className="mt-1 break-words">{detectedColumns}</div>
          </div>
        )}


        {summary && (
          <div className="rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-800 space-y-1">
            <div className="font-medium">Import summary</div>
            <div>Total rows: {summary.totalRows}</div>
            <div>Rows with email: {summary.rowsWithEmail}</div>
            <div>Distinct emails: {summary.distinctEmailsProcessed}</div>
            <div>Contacts created: {summary.contactsCreated}</div>
            <div>Contacts updated: {summary.contactsUpdated}</div>
            <div>Groups created: {summary.groupsCreated}</div>
            <div>Custom fields created: {summary.customFieldsCreated}</div>
            <div>Custom fields overwritten: {summary.customFieldsUpdated}</div>
            <div>Custom fields deleted: {summary.customFieldsDeleted}</div>
            <div>Rows skipped (missing email): {summary.skippedMissingEmail}</div>
            {summary.skippedSamples && summary.skippedSamples.length > 0 && (
              <div className="text-xs text-gray-600">
                Examples:{" "}
                {summary.skippedSamples
                  .map((s) => `Row ${s.rowNumber}: ${s.reason}`)
                  .join("; ")}
              </div>
            )}
            {summary.sampleMissingEmailRowNumbers && summary.sampleMissingEmailRowNumbers.length > 0 && (
              <div className="text-xs text-gray-600">
                Missing email rows (samples): {summary.sampleMissingEmailRowNumbers.join(", ")}
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
