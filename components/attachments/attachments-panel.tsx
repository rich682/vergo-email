"use client"

import { useState, useEffect, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, Loader2, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AttachmentRow } from "./attachment-row"

interface Attachment {
  id: string
  filename: string
  fileSize: number | null
  mimeType: string | null
  createdAt: string
  uploadedBy: {
    id: string
    name: string | null
    email: string
  }
}

interface AttachmentsPanelProps {
  // Either jobId or subtaskId must be provided
  jobId?: string
  subtaskId?: string
  className?: string
}

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

export function AttachmentsPanel({
  jobId,
  subtaskId,
  className
}: AttachmentsPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apiBase = jobId
    ? `/api/jobs/${jobId}/attachments`
    : `/api/subtasks/${subtaskId}/attachments`

  useEffect(() => {
    fetchAttachments()
  }, [jobId, subtaskId])

  const fetchAttachments = async () => {
    try {
      const response = await fetch(apiBase)
      if (response.ok) {
        const data = await response.json()
        setAttachments(data.attachments || [])
      }
    } catch (error) {
      console.error("Error fetching attachments:", error)
      setError("Failed to load attachments")
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return

    setUploading(true)
    setError(null)
    const uploadedAttachments: Attachment[] = []
    const errors: string[] = []

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} exceeds the 25MB limit`)
        continue
      }

      try {
        const formData = new FormData()
        formData.append("file", file)

        const response = await fetch(apiBase, {
          method: "POST",
          body: formData
        })

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`)
        }

        const data = await response.json()
        uploadedAttachments.push(data.attachment)
      } catch (error) {
        errors.push(`Failed to upload ${file.name}`)
      }
    }

    if (uploadedAttachments.length > 0) {
      setAttachments([...uploadedAttachments, ...attachments])
    }

    if (errors.length > 0) {
      setError(errors.join(", "))
    }

    setUploading(false)
  }

  const handleDownload = async (id: string) => {
    try {
      // Redirect to download endpoint
      window.open(`/api/attachments/download/${id}`, "_blank")
    } catch (error) {
      console.error("Failed to download file:", error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this attachment?")) return

    try {
      const response = await fetch(`/api/attachments/delete/${id}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        throw new Error("Failed to delete attachment")
      }

      setAttachments(attachments.filter(a => a.id !== id))
    } catch (error) {
      console.error("Failed to delete attachment:", error)
      setError("Failed to delete attachment")
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    handleUpload(acceptedFiles)
  }, [apiBase])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: attachments.length > 0, // Only allow click when empty
    noKeyboard: true
  })

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className={cn("border rounded-lg", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium">Attachments</h3>
          {attachments.length > 0 && (
            <span className="text-sm text-gray-500">
              ({attachments.length})
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => document.getElementById("file-upload")?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-1" />
          )}
          Upload
        </Button>
        <input
          id="file-upload"
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              handleUpload(Array.from(e.target.files))
              e.target.value = ""
            }
          }}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-sm border-b">
          {error}
        </div>
      )}

      {/* Content */}
      <div
        {...getRootProps()}
        className={cn(
          "min-h-[100px] relative",
          isDragActive && "bg-blue-50 ring-2 ring-blue-400 ring-inset"
        )}
      >
        <input {...getInputProps()} />

        {attachments.length > 0 ? (
          <div className="divide-y">
            {attachments.map((attachment) => (
              <AttachmentRow
                key={attachment.id}
                attachment={attachment}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Upload className="w-8 h-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">
              {isDragActive
                ? "Drop files here..."
                : "Drag & drop files here, or click to upload"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Max file size: 25MB
            </p>
          </div>
        )}

        {/* Drag overlay */}
        {isDragActive && attachments.length > 0 && (
          <div className="absolute inset-0 bg-blue-100/80 flex items-center justify-center rounded-lg">
            <p className="text-sm font-medium text-blue-600">
              Drop files to upload
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
