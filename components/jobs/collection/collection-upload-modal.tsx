"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Upload, X, FileText, Loader2 } from "lucide-react"

interface CollectionUploadModalProps {
  jobId: string
  taskId?: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface FileWithPreview extends File {
  preview?: string
}

export function CollectionUploadModal({
  jobId,
  taskId,
  isOpen,
  onClose,
  onSuccess
}: CollectionUploadModalProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, "pending" | "uploading" | "done" | "error">>({})

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [
      ...prev,
      ...acceptedFiles.map(file => Object.assign(file, {
        preview: file.type.startsWith("image/") 
          ? URL.createObjectURL(file) 
          : undefined
      }))
    ])
    setError(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 25 * 1024 * 1024, // 25MB
    onDropRejected: (rejections) => {
      const errors = rejections.map(r => r.errors.map(e => e.message).join(", ")).join("; ")
      setError(errors)
    }
  })

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev]
      const removed = newFiles.splice(index, 1)[0]
      if (removed.preview) {
        URL.revokeObjectURL(removed.preview)
      }
      return newFiles
    })
  }

  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)
    setError(null)

    // Initialize progress
    const progress: Record<string, "pending" | "uploading" | "done" | "error"> = {}
    files.forEach((_, i) => { progress[i] = "pending" })
    setUploadProgress(progress)

    let hasError = false

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      setUploadProgress(prev => ({ ...prev, [i]: "uploading" }))

      try {
        const formData = new FormData()
        formData.append("file", file)
        if (taskId) {
          formData.append("taskId", taskId)
        }

        const response = await fetch(`/api/task-instances/${jobId}/collection`, {
          method: "POST",
          credentials: "include",
          body: formData
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Upload failed")
        }

        setUploadProgress(prev => ({ ...prev, [i]: "done" }))
      } catch (err: any) {
        console.error(`Error uploading ${file.name}:`, err)
        setUploadProgress(prev => ({ ...prev, [i]: "error" }))
        hasError = true
      }
    }

    setUploading(false)

    if (!hasError) {
      // Clean up previews
      files.forEach(file => {
        if (file.preview) URL.revokeObjectURL(file.preview)
      })
      setFiles([])
      setUploadProgress({})
      onSuccess()
    } else {
      setError("Some files failed to upload. Please try again.")
    }
  }

  const handleClose = () => {
    if (uploading) return
    
    // Clean up previews
    files.forEach(file => {
      if (file.preview) URL.revokeObjectURL(file.preview)
    })
    setFiles([])
    setError(null)
    setUploadProgress({})
    onClose()
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors
              ${isDragActive 
                ? "border-orange-500 bg-orange-50" 
                : "border-gray-300 hover:border-gray-400"
              }
            `}
          >
            <input {...getInputProps()} />
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            {isDragActive ? (
              <p className="text-orange-600 font-medium">Drop files here...</p>
            ) : (
              <>
                <p className="text-gray-600 font-medium">
                  Drag & drop files here, or click to select
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Maximum file size: 25MB
                </p>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
                >
                  {file.preview ? (
                    <img
                      src={file.preview}
                      alt={file.name}
                      className="w-10 h-10 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                      <FileText className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  {uploadProgress[index] === "uploading" && (
                    <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                  )}
                  {uploadProgress[index] === "done" && (
                    <span className="text-green-600 text-sm">Done</span>
                  )}
                  {uploadProgress[index] === "error" && (
                    <span className="text-red-600 text-sm">Failed</span>
                  )}
                  {!uploading && (
                    <button
                      onClick={() => removeFile(index)}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpload} 
            disabled={files.length === 0 || uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload {files.length > 0 ? `(${files.length})` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
