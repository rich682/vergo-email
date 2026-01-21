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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Upload, 
  FileSpreadsheet, 
  FileImage,
  FileText,
  X, 
  Loader2, 
  CheckCircle,
  AlertCircle,
  Info,
  Plus,
  Anchor,
  Files
} from "lucide-react"
import { 
  RECONCILIATION_LIMITS, 
  RECONCILIATION_MESSAGES,
  ANCHOR_ROLE_OPTIONS
} from "@/lib/constants/reconciliation"

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

// Helper to get file icon based on MIME type
function getFileIcon(mimeType: string) {
  if (mimeType.includes("pdf")) {
    return <FileText className="w-6 h-6 text-red-600" />
  }
  if (mimeType.startsWith("image/")) {
    return <FileImage className="w-6 h-6 text-purple-600" />
  }
  return <FileSpreadsheet className="w-6 h-6 text-green-600" />
}

function getLargeFileIcon(mimeType: string) {
  if (mimeType.includes("pdf")) {
    return <FileText className="w-8 h-8 text-red-600" />
  }
  if (mimeType.startsWith("image/")) {
    return <FileImage className="w-8 h-8 text-purple-600" />
  }
  return <FileSpreadsheet className="w-8 h-8 text-green-600" />
}

export function ReconciliationUploadModal({
  open,
  onOpenChange,
  jobId,
  jobName,
  onReconciliationCreated
}: ReconciliationUploadModalProps) {
  // Anchor document (source of truth) - exactly one required
  const [anchorDocument, setAnchorDocument] = useState<UploadedFile | null>(null)
  // Anchor role - what kind of document is the anchor
  const [anchorRole, setAnchorRole] = useState<string>("")
  const [customAnchorRole, setCustomAnchorRole] = useState<string>("")
  // Supporting documents - at least one required, can have multiple
  const [supportingDocuments, setSupportingDocuments] = useState<UploadedFile[]>([])
  // Intent description - optional free-text describing what user wants to reconcile
  const [intentDescription, setIntentDescription] = useState("")
  
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const onDropAnchor = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setAnchorDocument({
        file: acceptedFiles[0],
        preview: acceptedFiles[0].name
      })
      setError(null)
    }
  }, [])

  const onDropSupporting = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const newFiles = acceptedFiles.map(file => ({
        file,
        preview: file.name
      }))
      setSupportingDocuments(prev => [...prev, ...newFiles])
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

  const dropzoneConfig = {
    accept: {
      // Excel/CSV (structured)
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "text/csv": [".csv"],
      // PDF (unstructured - V1)
      "application/pdf": [".pdf"],
      // Images (unstructured - V1)
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"]
    },
    maxSize: RECONCILIATION_LIMITS.MAX_FILE_SIZE_BYTES,
  }

  const anchorDropzone = useDropzone({
    onDrop: onDropAnchor,
    onDropRejected,
    ...dropzoneConfig,
    maxFiles: 1,
    multiple: false
  })

  const supportingDropzone = useDropzone({
    onDrop: onDropSupporting,
    onDropRejected,
    ...dropzoneConfig,
    maxFiles: 10,
    multiple: true
  })

  const removeSupporting = (index: number) => {
    setSupportingDocuments(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!anchorDocument) {
      setError("Please upload an anchor document (source of truth)")
      return
    }
    if (supportingDocuments.length === 0) {
      setError("Please upload at least one supporting document")
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      // Anchor document
      formData.append("anchor", anchorDocument.file)
      // Supporting documents (can be multiple)
      supportingDocuments.forEach(doc => {
        formData.append("supporting", doc.file)
      })
      // Anchor role
      const resolvedAnchorRole = anchorRole === "custom" ? customAnchorRole : 
        ANCHOR_ROLE_OPTIONS.find(o => o.value === anchorRole)?.label || ""
      if (resolvedAnchorRole.trim()) {
        formData.append("anchorRole", resolvedAnchorRole.trim())
      }
      // Intent description (optional)
      if (intentDescription.trim()) {
        formData.append("intentDescription", intentDescription.trim())
      }

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
    setAnchorDocument(null)
    setAnchorRole("")
    setCustomAnchorRole("")
    setSupportingDocuments([])
    setIntentDescription("")
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
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            New Reconciliation
          </DialogTitle>
          <DialogDescription>
            Upload documents to reconcile for: <strong>{jobName}</strong>
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

            <div className="space-y-5">
              {/* Step 1: Anchor Document */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Anchor className="w-4 h-4 text-green-600" />
                  <label className="text-sm font-medium text-gray-700">
                    Step 1: Anchor Document (Source of Truth)
                  </label>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  Upload the primary document you are reconciling against (e.g., General Ledger, trial balance, control account)
                </p>
                {anchorDocument ? (
                  <div className="border rounded-lg p-4 bg-green-50 border-green-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getLargeFileIcon(anchorDocument.file.type)}
                        <div>
                          <p className="font-medium text-gray-900">{anchorDocument.file.name}</p>
                          <p className="text-sm text-gray-500">{formatFileSize(anchorDocument.file.size)}</p>
                          <span className="text-xs text-green-700 font-medium">Anchor (Source of Truth)</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAnchorDocument(null)}
                        disabled={uploading}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    {/* Anchor Role Selection */}
                    <div className="pt-2 border-t border-green-200">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Document Role
                      </label>
                      <Select value={anchorRole} onValueChange={setAnchorRole}>
                        <SelectTrigger className="w-full bg-white">
                          <SelectValue placeholder="Select document role (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {ANCHOR_ROLE_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {anchorRole === "custom" && (
                        <input
                          type="text"
                          placeholder="Specify document role..."
                          value={customAnchorRole}
                          onChange={(e) => setCustomAnchorRole(e.target.value)}
                          className="mt-2 w-full px-3 py-2 text-sm border rounded-md bg-white"
                          disabled={uploading}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    {...anchorDropzone.getRootProps()}
                    className={`
                      border-2 border-dashed rounded-lg p-5 text-center cursor-pointer
                      transition-colors
                      ${anchorDropzone.isDragActive 
                        ? "border-green-400 bg-green-50" 
                        : "border-gray-300 hover:border-green-400 hover:bg-green-50/50"
                      }
                    `}
                  >
                    <input {...anchorDropzone.getInputProps()} />
                    <Anchor className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      Drop anchor document here, or click to browse
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Excel (.xlsx, .xls), CSV, PDF, or Image (.png, .jpg)
                    </p>
                  </div>
                )}
              </div>

              {/* Step 2: Supporting Documents */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Files className="w-4 h-4 text-blue-600" />
                  <label className="text-sm font-medium text-gray-700">
                    Step 2: Supporting Documents
                  </label>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  Upload one or more documents to compare (e.g., bank statements, credit card statements, payroll registers). Any format supported.
                </p>
                
                {/* List of uploaded supporting docs */}
                {supportingDocuments.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {supportingDocuments.map((doc, index) => (
                      <div 
                        key={index}
                        className="border rounded-lg p-3 bg-blue-50 border-blue-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getFileIcon(doc.file.type)}
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{doc.file.name}</p>
                              <p className="text-xs text-gray-500">{formatFileSize(doc.file.size)}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSupporting(index)}
                            disabled={uploading}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Dropzone for adding more */}
                <div
                  {...supportingDropzone.getRootProps()}
                  className={`
                    border-2 border-dashed rounded-lg p-4 text-center cursor-pointer
                    transition-colors
                    ${supportingDropzone.isDragActive 
                      ? "border-blue-400 bg-blue-50" 
                      : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50"
                    }
                  `}
                >
                  <input {...supportingDropzone.getInputProps()} />
                  <div className="flex items-center justify-center gap-2">
                    <Plus className="w-5 h-5 text-blue-500" />
                    <span className="text-sm text-gray-600">
                      {supportingDocuments.length === 0 
                        ? "Drop supporting documents here, or click to browse"
                        : "Add more supporting documents"
                      }
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Excel, CSV, PDF, or Image files
                  </p>
                </div>
              </div>

              {/* Step 3: Reconciliation Intent */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-purple-600" />
                  <label className="text-sm font-medium text-gray-700">
                    Step 3: Reconciliation Intent (Optional)
                  </label>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  Describe what you are trying to reconcile. This helps AI provide better analysis.
                </p>
                <Textarea
                  placeholder="e.g., Match bank transactions to GL entries line by line, or verify that total amounts match..."
                  value={intentDescription}
                  onChange={(e) => setIntentDescription(e.target.value)}
                  rows={2}
                  className="resize-none"
                  disabled={uploading}
                />
                <div className="mt-2 text-xs text-gray-400">
                  <span className="font-medium">Examples:</span> "Match transactions line by line" | "Verify totals only" | "Reconcile detailed to monthly summary"
                </div>
              </div>

              {/* Requirements info */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-600">
                    <p className="font-medium">Supported Formats & Limits</p>
                    <ul className="mt-1 text-xs space-y-0.5">
                      <li><strong>Excel/CSV:</strong> Single sheet only, max {RECONCILIATION_LIMITS.MAX_ROWS_PER_SHEET.toLocaleString()} rows</li>
                      <li><strong>PDF:</strong> Bank statements, credit card statements, confirmations</li>
                      <li><strong>Images:</strong> Screenshots, scanned documents</li>
                      <li>Max file size: {RECONCILIATION_LIMITS.MAX_FILE_SIZE_MB}MB per file</li>
                      <li>AI will analyze each document and extract key signals (totals, dates, references)</li>
                    </ul>
                  </div>
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
              disabled={!anchorDocument || supportingDocuments.length === 0 || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Reconcile
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
