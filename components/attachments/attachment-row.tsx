"use client"

import { useState, useRef, useEffect } from "react"
import { format } from "date-fns"
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Download,
  Trash2,
  MoreHorizontal,
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

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

interface AttachmentRowProps {
  attachment: Attachment
  onDownload: (id: string) => void
  onDelete: (id: string) => void
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File
  if (mimeType.startsWith("image/")) return FileImage
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) {
    return FileSpreadsheet
  }
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) {
    return FileText
  }
  return File
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentRow({
  attachment,
  onDownload,
  onDelete
}: AttachmentRowProps) {
  const [downloading, setDownloading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const FileIcon = getFileIcon(attachment.mimeType)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleDownload = () => {
    setDownloading(true)
    onDownload(attachment.id)
    setTimeout(() => setDownloading(false), 1000)
  }

  const handleDelete = () => {
    setMenuOpen(false)
    onDelete(attachment.id)
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors",
        downloading && "opacity-50 pointer-events-none"
      )}
    >
      {/* File Icon */}
      <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center shrink-0">
        <FileIcon className="w-4 h-4 text-gray-500" />
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{attachment.filename}</p>
        <p className="text-xs text-gray-500">
          {formatFileSize(attachment.fileSize)}
          {attachment.fileSize && " • "}
          {attachment.uploadedBy.name || attachment.uploadedBy.email}
          {" • "}
          {format(new Date(attachment.createdAt), "MMM d, yyyy")}
        </p>
      </div>

      {/* Download Button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={handleDownload}
        disabled={downloading}
      >
        {downloading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </Button>

      {/* More Actions */}
      <div className="relative" ref={menuRef}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-white border rounded-lg shadow-lg z-10">
            <button
              onClick={handleDownload}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={handleDelete}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
