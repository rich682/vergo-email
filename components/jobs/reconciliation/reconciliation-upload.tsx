"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, ArrowRight } from "lucide-react"

interface ReconciliationUploadProps {
  configId: string
  runId: string
  sourceALabel: string
  sourceBLabel: string
  sourceAFileName?: string | null
  sourceBFileName?: string | null
  onBothUploaded: () => void
  matching?: boolean
}

export function ReconciliationUpload({
  configId,
  runId,
  sourceALabel,
  sourceBLabel,
  sourceAFileName,
  sourceBFileName,
  onBothUploaded,
  matching = false,
}: ReconciliationUploadProps) {
  const [uploading, setUploading] = useState<"A" | "B" | null>(null)
  const [fileA, setFileA] = useState<{ name: string; rowCount: number } | null>(
    sourceAFileName ? { name: sourceAFileName, rowCount: 0 } : null
  )
  const [fileB, setFileB] = useState<{ name: string; rowCount: number } | null>(
    sourceBFileName ? { name: sourceBFileName, rowCount: 0 } : null
  )
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState("")

  const handleUpload = useCallback(
    async (file: File, source: "A" | "B") => {
      setUploading(source)
      setError("")
      setWarnings([])

      try {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("source", source)

        const res = await fetch(`/api/reconciliations/${configId}/runs/${runId}/upload`, {
          method: "POST",
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Upload failed")
        }

        const data = await res.json()

        if (source === "A") {
          setFileA({ name: file.name, rowCount: data.rowCount })
        } else {
          setFileB({ name: file.name, rowCount: data.rowCount })
        }

        if (data.warnings?.length) {
          setWarnings(data.warnings)
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setUploading(null)
      }
    },
    [configId, runId]
  )

  const DropZone = ({ source, label, uploaded }: { source: "A" | "B"; label: string; uploaded: { name: string; rowCount: number } | null }) => {
    const [dragOver, setDragOver] = useState(false)
    const isUploading = uploading === source

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleUpload(file, source)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleUpload(file, source)
    }

    if (uploaded) {
      return (
        <div className="border border-green-200 bg-green-50 rounded-lg p-6 text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-green-800">{label}</p>
          <p className="text-xs text-green-600 mt-1">{uploaded.name}</p>
          {uploaded.rowCount > 0 && (
            <p className="text-xs text-green-500 mt-0.5">{uploaded.rowCount} rows parsed</p>
          )}
          <label className="mt-3 inline-block text-xs text-green-600 hover:text-green-700 cursor-pointer underline">
            Replace file
            <input type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleFileSelect} />
          </label>
        </div>
      )
    }

    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragOver ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-gray-300 bg-white"
        }`}
      >
        {isUploading ? (
          <>
            <Loader2 className="w-8 h-8 text-orange-500 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-gray-600">Uploading and parsing...</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">{label}</p>
            <p className="text-xs text-gray-400 mt-1">Drop CSV, Excel, or PDF here</p>
            <label className="mt-3 inline-block">
              <span className="text-xs text-orange-500 hover:text-orange-600 cursor-pointer underline">
                Or browse files
              </span>
              <input type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleFileSelect} />
            </label>
          </>
        )}
      </div>
    )
  }

  const bothReady = fileA && fileB

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Upload Source Files</h3>
        <p className="text-sm text-gray-500">
          Upload the two files you want to reconcile. {sourceALabel} is the source of truth — unmatched rows will appear in &ldquo;Not Matched&rdquo;.
          Supported formats: CSV, Excel (.xlsx/.xls), PDF.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <DropZone source="A" label={sourceALabel} uploaded={fileA} />
        <DropZone source="B" label={sourceBLabel} uploaded={fileB} />
      </div>

      {warnings.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-700">{warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {bothReady && (
        <div className="flex justify-end">
          <Button onClick={onBothUploaded} disabled={matching} className="bg-orange-500 hover:bg-orange-600 text-white">
            {matching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Reconciling...
              </>
            ) : (
              <>
                Run Matching <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
