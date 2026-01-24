"use client"

/**
 * Attachments Cell Editor
 * 
 * File attachment management for grid cells.
 * Click to view/add attachments, supports file upload.
 * 
 * Note: This is a simplified V1 implementation.
 * Full attachment storage integration will come in a later phase.
 */

import { useState, useRef } from "react"
import { Paperclip, Plus, X, FileText, Loader2, ExternalLink } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

export interface AttachmentRef {
  id: string
  filename: string
  mimeType?: string
  sizeBytes?: number
  url?: string
}

interface AttachmentsCellProps {
  value: { files: AttachmentRef[] } | null
  rowIdentity: string
  onSave: (value: { files: AttachmentRef[] }) => Promise<void>
  onUpload?: (file: File) => Promise<AttachmentRef>
  readOnly?: boolean
}

export function AttachmentsCell({
  value,
  rowIdentity,
  onSave,
  onUpload,
  readOnly = false,
}: AttachmentsCellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const files = value?.files || []
  const fileCount = files.length

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onUpload) return

    setIsUploading(true)
    setError(null)

    try {
      const attachment = await onUpload(file)
      await onSave({ files: [...files, attachment] })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file")
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRemove = async (attachmentId: string) => {
    try {
      await onSave({
        files: files.filter((f) => f.id !== attachmentId),
      })
    } catch (err) {
      console.error("Failed to remove attachment:", err)
    }
  }

  const handleClick = () => {
    if (readOnly && fileCount === 0) return
    setIsOpen(true)
  }

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            className={`
              w-full h-full flex items-center gap-1 text-left
              rounded px-1 transition-colors
              ${!readOnly ? "hover:bg-gray-100" : ""}
              ${fileCount > 0 ? "text-blue-600" : "text-gray-400"}
            `}
            onClick={handleClick}
          >
            <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-xs truncate">
              {fileCount === 0
                ? readOnly
                  ? "None"
                  : "Add files"
                : `${fileCount} file${fileCount !== 1 ? "s" : ""}`}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="px-3 py-2 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-700">Attachments</h3>
          </div>

          {/* File list */}
          <div className="max-h-48 overflow-y-auto">
            {files.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                No files attached
              </div>
            ) : (
              <div className="p-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 group"
                  >
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{file.filename}</div>
                      {file.sizeBytes !== undefined && (
                        <div className="text-xs text-gray-400">
                          {formatFileSize(file.sizeBytes)}
                        </div>
                      )}
                    </div>
                    {file.url && (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {!readOnly && (
                      <button
                        className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleRemove(file.id)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upload button */}
          {!readOnly && onUpload && (
            <div className="p-2 border-t border-gray-100">
              {error && (
                <div className="text-xs text-red-600 mb-2 px-2">{error}</div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3 mr-1" />
                    Add File
                  </>
                )}
              </Button>
            </div>
          )}

          {!readOnly && !onUpload && (
            <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
              File upload not configured
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  )
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
