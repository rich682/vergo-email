"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { 
  Upload, AlertCircle, CheckCircle2, 
  Plus, Minus
} from "lucide-react"
import { parseDatasetCSV } from "@/lib/utils/csv-parser"

interface SchemaColumn {
  key: string
  label: string
  type: string
  required: boolean
}

interface DiffSummary {
  addedCount: number
  removedCount: number
  addedIdentities: string[]
  removedIdentities: string[]
}

interface PreviewResult {
  parsedRows: Record<string, unknown>[]
  rowCount: number
  columnValidation: Array<{ column: string; valid: boolean; errors?: string[] }>
  identityValidation: { valid: boolean; duplicates: string[]; emptyCount: number }
  diffSummary?: DiffSummary
}

interface UploadDataModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  datasetId: string
  schema: SchemaColumn[]
  identityKey: string
  onUploaded: () => void
  // Period info for tagging the snapshot
  periodLabel?: string
  periodStart?: string
  periodEnd?: string
}

export function UploadDataModal({
  open,
  onOpenChange,
  datasetId,
  schema,
  identityKey,
  onUploaded,
  periodLabel,
  periodStart,
  periodEnd,
}: UploadDataModalProps) {
  const [step, setStep] = useState<"upload" | "preview" | "success">("upload")
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([])
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setStep("upload")
    setFile(null)
    setParsedRows([])
    setPreview(null)
    setError(null)
  }

  const parseExcelFile = async (file: File): Promise<Array<Record<string, string>>> => {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: "array" })
    
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error("No sheets found in workbook")
    
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 }) as unknown[][]
    
    if (data.length === 0) throw new Error("Sheet is empty")
    
    const headers = (data[0] || []).map(h => String(h || "").trim())
    if (headers.length === 0) throw new Error("No column headers found")
    
    const rows: Array<Record<string, string>> = []
    for (let i = 1; i < data.length && rows.length < 10000; i++) {
      const rowData = data[i] || []
      const row: Record<string, string> = {}
      for (let j = 0; j < headers.length; j++) {
        const value = rowData[j]
        row[headers[j]] = value !== null && value !== undefined ? String(value).trim() : ""
      }
      rows.push(row)
    }
    
    return rows
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const uploadFile = acceptedFiles[0]
    if (!uploadFile) return

    setFile(uploadFile)
    setError(null)
    setLoading(true)

    try {
      let rawRows: Array<Record<string, string>>
      const fileName = uploadFile.name.toLowerCase()
      
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        // Parse Excel file
        rawRows = await parseExcelFile(uploadFile)
      } else {
        // Parse CSV file
        const text = await uploadFile.text()
        const result = parseDatasetCSV(text)

        if ("code" in result) {
          throw new Error(result.message)
        }
        rawRows = result.rows
      }

      // Map rows to schema keys
      const schemaKeyMap = new Map(schema.map(col => [col.label.toLowerCase(), col.key]))
      const rows = rawRows.map(row => {
        const mapped: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(row)) {
          // Try to find matching schema column by label or key
          const schemaKey = schemaKeyMap.get(key.toLowerCase()) || 
                           schema.find(c => c.key.toLowerCase() === key.toLowerCase())?.key ||
                           key
          mapped[schemaKey] = value
        }
        return mapped
      })

      setParsedRows(rows)

      // Get preview from server
      const response = await fetch(`/api/datasets/${datasetId}/snapshots/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to preview import")
      }

      const data = await response.json()
      setPreview(data.preview)
      setStep("preview")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to parse file"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [datasetId, schema])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    maxFiles: 1,
  })

  const handleConfirmUpload = async () => {
    if (!preview) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/datasets/${datasetId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rows: parsedRows,
          sourceFilename: file?.name,
          periodLabel,
          periodStart,
          periodEnd,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create snapshot")
      }

      setStep("success")
      setTimeout(() => {
        reset()
        onUploaded()
      }, 1500)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Upload Data"}
            {step === "preview" && "Preview Import"}
            {step === "success" && "Upload Complete"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6 py-4">
            {/* File Dropzone */}
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}
                ${loading ? "opacity-50 pointer-events-none" : ""}
              `}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              {isDragActive ? (
                <p className="text-blue-600">Drop the file here...</p>
              ) : (
                <>
                  <p className="text-gray-600 mb-2">
                    Drag and drop a CSV or Excel file here, or click to select
                  </p>
                  <p className="text-sm text-gray-400">
                    File should match the dataset schema (max 10,000 rows)
                  </p>
                </>
              )}
            </div>

            {/* Schema Reference */}
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Expected Columns:</p>
              <div className="flex flex-wrap gap-2">
                {schema.map((col) => (
                  <span
                    key={col.key}
                    className={`px-2 py-1 text-xs rounded ${
                      col.key === identityKey
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {col.label}
                    {col.key === identityKey && " *"}
                  </span>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-6 py-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-semibold text-gray-900">
                  {preview.rowCount.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500">Total Rows</p>
              </div>
              
              {preview.diffSummary && (
                <>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-semibold text-green-700 flex items-center justify-center gap-1">
                      <Plus className="w-5 h-5" />
                      {preview.diffSummary.addedCount}
                    </p>
                    <p className="text-sm text-green-600">New Rows</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-semibold text-red-700 flex items-center justify-center gap-1">
                      <Minus className="w-5 h-5" />
                      {preview.diffSummary.removedCount}
                    </p>
                    <p className="text-sm text-red-600">Removed Rows</p>
                  </div>
                </>
              )}
            </div>

            {/* Validation Results */}
            <div className="space-y-4">
              {/* Identity Key Validation */}
              <div className={`p-4 rounded-lg border ${
                preview.identityValidation.valid
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center gap-2">
                  {preview.identityValidation.valid ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span className={preview.identityValidation.valid ? "text-green-700" : "text-red-700"}>
                    {preview.identityValidation.valid
                      ? "All identity keys are unique and non-empty"
                      : preview.identityValidation.emptyCount > 0 && preview.identityValidation.duplicates.length > 0
                        ? `${preview.identityValidation.emptyCount} rows with empty identity key, ${preview.identityValidation.duplicates.length} duplicates`
                        : preview.identityValidation.emptyCount > 0
                          ? `${preview.identityValidation.emptyCount} rows have empty identity key`
                          : `${preview.identityValidation.duplicates.length} duplicate identity keys found`}
                  </span>
                </div>
                {preview.identityValidation.duplicates.length > 0 && (
                  <p className="mt-2 text-sm text-red-600">
                    Duplicates: {preview.identityValidation.duplicates.slice(0, 5).join(", ")}
                    {preview.identityValidation.duplicates.length > 5 && "..."}
                  </p>
                )}
                {preview.identityValidation.emptyCount > 0 && (
                  <p className="mt-2 text-sm text-red-600">
                    Every row must have a non-empty identity key value.
                  </p>
                )}
              </div>

              {/* Column Validation */}
              {preview.columnValidation.some(c => !c.valid) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="font-medium text-yellow-800 mb-2">Column Warnings</p>
                  {preview.columnValidation
                    .filter(c => !c.valid)
                    .map((col) => (
                      <div key={col.column} className="text-sm text-yellow-700">
                        <span className="font-medium">{col.column}:</span>{" "}
                        {col.errors?.join(", ")}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Warnings */}
            {preview.diffSummary && preview.diffSummary.addedCount > 20 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Heads up:</strong> {preview.diffSummary.addedCount} new rows will be added
                  compared to the previous snapshot.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        )}

        {step === "success" && (
          <div className="py-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900">Upload Successful!</p>
            <p className="text-sm text-gray-500">Your snapshot has been created.</p>
          </div>
        )}

        {step !== "success" && (
          <DialogFooter>
            {step === "preview" && (
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
            )}
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {step === "preview" && (
              <Button
                onClick={handleConfirmUpload}
                disabled={loading || !preview?.identityValidation.valid}
              >
                {loading ? "Uploading..." : "Confirm Upload"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
