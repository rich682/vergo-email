"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface StatesCSVUploadProps {
  onSuccess: () => void
}

type ParsedRow = {
  email: string
  stateKey?: string
  metadata: Record<string, string>
}

export function StatesCSVUpload({ onSuccess }: StatesCSVUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [stateKeyOverride, setStateKeyOverride] = useState("")
  const [replaceForStateKey, setReplaceForStateKey] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ParsedRow[]>([])

  const parseCSV = async (file: File) => {
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 2) {
      throw new Error("CSV must have headers and at least one data row")
    }
    const headers = lines[0].split(",").map((h) => h.trim())
    const emailIdx = headers.findIndex((h) => ["email", "recipient_email", "recipientEmail"].includes(h))
    if (emailIdx === -1) throw new Error("CSV must include an email column")

    const stateKeyIdx = stateKeyOverride ? -1 : headers.findIndex((h) => h === "stateKey")
    if (stateKeyIdx === -1 && !stateKeyOverride) {
      throw new Error("Provide a stateKey column or choose a State Key for this upload")
    }

    const rows: ParsedRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",")
      if (cols.length !== headers.length) continue
      const email = cols[emailIdx]?.trim()
      if (!email) continue
      const stateKey = stateKeyOverride || (stateKeyIdx >= 0 ? cols[stateKeyIdx].trim() : "")
      if (!stateKey) continue
      const metadata: Record<string, string> = {}
      headers.forEach((h, idx) => {
        if (idx === emailIdx || idx === stateKeyIdx) return
        const val = cols[idx]?.trim()
        if (val) metadata[h] = val
      })
      rows.push({ email, stateKey, metadata })
    }
    setPreview(rows.slice(0, 5))
    return rows
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError("Please select a CSV file")
      return
    }
    setUploading(true)
    setError(null)
    try {
      const rows = await parseCSV(file)
      const res = await fetch("/api/contacts/states/bulk-upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          stateKeyOverride: stateKeyOverride || undefined,
          replaceForStateKey,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Upload failed")
      }
      onSuccess()
      setFile(null)
      setPreview([])
    } catch (err: any) {
      setError(err?.message || "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const downloadTemplate = () => {
    const headers = ["email", "stateKey", "invoiceNumber", "amount", "dueDate"]
    const sample = ["vendor@example.com", "unpaid_invoice", "INV-1001", "500", "2026-02-01"]
    const csv = `${headers.join(",")}\n${sample.join(",")}`
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "states-template.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Upload States CSV</Label>
        <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
          Download template
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="state-key">State Key (optional override)</Label>
        <Input
          id="state-key"
          placeholder='e.g. "unpaid_invoice"'
          value={stateKeyOverride}
          onChange={(e) => setStateKeyOverride(e.target.value)}
        />
        <p className="text-xs text-gray-500">
          If provided, this applies to all rows. Otherwise, CSV must include a stateKey column.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="csv-file">CSV File</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <p className="text-xs text-gray-500">Required columns: email. Optional: stateKey (unless overridden), metadata columns.</p>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={replaceForStateKey}
          onChange={(e) => setReplaceForStateKey(e.target.checked)}
        />
        Replace existing states for this stateKey not in this upload
      </label>

      {preview.length > 0 && (
        <div className="text-xs text-gray-700 border border-gray-200 rounded-md p-2 bg-gray-50">
          <div className="font-semibold mb-1">Preview (first 5 rows)</div>
          <pre className="whitespace-pre-wrap text-xs">
            {preview.map((r, idx) => `${idx + 1}. ${r.email} | ${r.stateKey} | ${JSON.stringify(r.metadata || {})}`).join("\n")}
          </pre>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <Button type="submit" disabled={uploading}>
        {uploading ? "Uploading..." : "Upload States"}
      </Button>
    </form>
  )
}

