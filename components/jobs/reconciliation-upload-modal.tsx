"use client"

import { useState, useCallback } from "react"
import { useDropzone, FileRejection } from "react-dropzone"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { 
  Upload, 
  FileSpreadsheet, 
  X, 
  Loader2, 
  CheckCircle,
  AlertCircle,
  Info
} from "lucide-react"
import { RECONCILIATION_LIMITS, RECONCILIATION_MESSAGES } from "@/lib/constants/reconciliation"

interface ReconciliationUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  jobName: string
  onReconciliationCreated?: (reconciliation: any) => void
}

interface UploadedFile {
  file: File
  preview: string
}

export function ReconciliationUploadModal({
  open,
  onOpenChange,
  jobId,
  jobName,
  onReconciliationCreated
}: ReconciliationUploadModalProps) {
  const [document1, setDocument1] = useState<UploadedFile | null>(null)
  const [document2, setDocument2] = useState<UploadedFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const onDropDocument1 = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setDocument1({
        file: acceptedFiles[0],
        preview: acceptedFiles[0].name
      })
      setError(null)
    }
  }, [])

  const onDropDocument2 = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setDocument2({
        file: acceptedFiles[0],
        preview: acceptedFiles[0].name
      })
      setError(null)
    }
  }, [])

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const rejection = rejections[0]
    if (rejection) {
      const errorCode = rejection.errors[0]?.code
      if (errorCode === "file-too-large") {
        setError(RECONCILIATION_MESSAGES.FILE_TOO_LARGE)
      } else if (errorCode === "file-invalid-type") {
        setError(RECONCILIATION_MESSAGES.INVALID_FILE_TYPE)
      } else {
        setError(rejection.errors[0]?.message || "File rejected")
      }
    }
  }, [])

  const dropzone1 = useDropzone({
    onDrop: onDropDocument1,
    onDropRejected,
    accept: {
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "text/csv": [".csv"]
    },
    maxFiles: 1,
    maxSize: RECONCILIATION_LIMITS.MAX_FILE_SIZE_BYTES,
    multiple: false
  })

  const dropzone2 = useDropzone({
    onDrop: onDropDocument2,
    onDropRejected,
    accept: {
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "text/csv": [".csv"]
    },
    maxFiles: 1,
    maxSize: RECONCILIATION_LIMITS.MAX_FILE_SIZE_BYTES,
    multiple: false
  })

  const handleSubmit = async () => {
    if (!document1 || !document2) {
      setError("Please upload both documents")
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("document1", document1.file)
      formData.append("document2", document2.file)

      const response = await fetch(`/api/task-instances/${jobId}/reconciliations`, {
        method: "POST",
        body: formData,
        credentials: "include"
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create reconciliation")
      }

      const data = await response.json()
      setSuccess(true)
      onReconciliationCreated?.(data.reconciliation)

      // Close after a short delay
      setTimeout(() => {
        handleClose()
      }, 1500)
    } catch (err: any) {
      setError(err.message || "Failed to upload documents")
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    setDocument1(null)
    setDocument2(null)
    setError(null)
    setSuccess(false)
    onOpenChange(false)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            New Reconciliation
          </DialogTitle>
          <DialogDescription>
            Upload two documents to compare and reconcile for: <strong>{jobName}</strong>
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Reconciliation Complete
            </h3>
            <p className="text-gray-500">
              Documents uploaded and processed. View results below.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="grid gap-4">
              {/* Document 1 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Document 1 (Source A)
                </label>
                {document1 ? (
                  <div className="border rounded-lg p-4 bg-green-50 border-green-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="w-8 h-8 text-green-600" />
                        <div>
                          <p className="font-medium text-gray-900">{document1.file.name}</p>
                          <p className="text-sm text-gray-500">{formatFileSize(document1.file.size)}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDocument1(null)}
                        disabled={uploading}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    {...dropzone1.getRootProps()}
                    className={`
                      border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                      transition-colors
                      ${dropzone1.isDragActive 
                        ? "border-green-400 bg-green-50" 
                        : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                      }
                    `}
                  >
                    <input {...dropzone1.getInputProps()} />
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      Drag & drop an Excel or CSV file, or click to browse
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      .xlsx, .xls, or .csv (max {RECONCILIATION_LIMITS.MAX_FILE_SIZE_MB}MB)
                    </p>
                  </div>
                )}
              </div>

              {/* Document 2 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Document 2 (Source B)
                </label>
                {document2 ? (
                  <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="w-8 h-8 text-blue-600" />
                        <div>
                          <p className="font-medium text-gray-900">{document2.file.name}</p>
                          <p className="text-sm text-gray-500">{formatFileSize(document2.file.size)}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDocument2(null)}
                        disabled={uploading}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    {...dropzone2.getRootProps()}
                    className={`
                      border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                      transition-colors
                      ${dropzone2.isDragActive 
                        ? "border-blue-400 bg-blue-50" 
                        : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                      }
                    `}
                  >
                    <input {...dropzone2.getInputProps()} />
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      Drag & drop an Excel or CSV file, or click to browse
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      .xlsx, .xls, or .csv (max {RECONCILIATION_LIMITS.MAX_FILE_SIZE_MB}MB)
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium">Requirements</p>
                  <ul className="mt-1 text-xs space-y-0.5">
                    <li>Each file must contain <strong>exactly one sheet</strong></li>
                    <li>Max file size: {RECONCILIATION_LIMITS.MAX_FILE_SIZE_MB}MB per file</li>
                    <li>Max rows: {RECONCILIATION_LIMITS.MAX_ROWS_PER_SHEET.toLocaleString()} per sheet</li>
                    <li>AI will automatically process and identify discrepancies on upload</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          {!success && (
            <Button
              onClick={handleSubmit}
              disabled={!document1 || !document2 || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Compare
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
