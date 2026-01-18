"use client"

import { useState, useEffect, useRef } from "react"
import { 
  FileText, 
  FileImage, 
  FileSpreadsheet, 
  File, 
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PDFViewer, ImageViewer } from "@/components/ui/pdf-viewer"

interface Attachment {
  id: string
  filename: string
  fileKey: string
  fileUrl: string | null
  fileSize: number | null
  mimeType: string | null
}

interface AttachmentsTabProps {
  attachments: Attachment[]
  selectedId: string | null
  onSelect: (id: string) => void
  jobId?: string // Optional job ID for fetching from collection endpoint
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File
  if (mimeType.startsWith("image/")) return FileImage
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return FileSpreadsheet
  if (mimeType.includes("pdf")) return FileText
  return File
}

function getIconColor(mimeType: string | null) {
  if (!mimeType) return "text-gray-400"
  if (mimeType.startsWith("image/")) return "text-blue-500"
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "text-green-500"
  if (mimeType.includes("pdf")) return "text-red-500"
  return "text-gray-400"
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentsTab({ attachments, selectedId, onSelect, jobId }: AttachmentsTabProps) {
  const selectedAttachment = attachments.find(a => a.id === selectedId) || null
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Auto-select first attachment if none selected
  useEffect(() => {
    if (!selectedId && attachments.length > 0) {
      onSelect(attachments[0].id)
    }
  }, [selectedId, attachments, onSelect])

  // Check scroll state
  useEffect(() => {
    const checkScroll = () => {
      const el = scrollContainerRef.current
      if (el) {
        setCanScrollLeft(el.scrollLeft > 0)
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5)
      }
    }
    checkScroll()
    const el = scrollContainerRef.current
    el?.addEventListener("scroll", checkScroll)
    window.addEventListener("resize", checkScroll)
    return () => {
      el?.removeEventListener("scroll", checkScroll)
      window.removeEventListener("resize", checkScroll)
    }
  }, [attachments])

  const scroll = (direction: "left" | "right") => {
    const el = scrollContainerRef.current
    if (el) {
      const scrollAmount = 200
      el.scrollBy({ left: direction === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" })
    }
  }

  if (attachments.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">No attachments</p>
      </div>
    )
  }

  const selectedIndex = attachments.findIndex(a => a.id === selectedId)

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Compact Attachment Strip - Single Line */}
      <div className="flex-shrink-0 h-10 border-b border-gray-200 bg-gray-50 flex items-center px-2 gap-1">
        {/* Left scroll button */}
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        
        {/* Scrollable attachment pills */}
        <div
          ref={scrollContainerRef}
          className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {attachments.map((attachment, index) => {
            const Icon = getFileIcon(attachment.mimeType)
            const iconColor = getIconColor(attachment.mimeType)
            const isSelected = attachment.id === selectedId

            return (
              <button
                key={attachment.id}
                onClick={() => onSelect(attachment.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all ${
                  isSelected
                    ? "bg-orange-100 text-orange-700 border border-orange-300"
                    : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                }`}
                title={`${attachment.filename} (${formatFileSize(attachment.fileSize)})`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-orange-600" : iconColor}`} />
                <span className="max-w-[120px] truncate font-medium">
                  {attachment.filename}
                </span>
              </button>
            )
          })}
        </div>

        {/* Right scroll button */}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Attachment counter */}
        <span className="flex-shrink-0 text-[10px] text-gray-400 ml-1">
          {selectedIndex + 1}/{attachments.length}
        </span>
      </div>

      {/* Preview Area - Takes remaining space */}
      <div className="flex-1 overflow-hidden">
        {selectedAttachment ? (
          <AttachmentPreview attachment={selectedAttachment} jobId={jobId} />
        ) : (
          <div className="h-full flex items-center justify-center bg-gray-50">
            <p className="text-sm text-gray-500">Select an attachment to preview</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Attachment Preview using PDF.js for PDFs and native img for images
function AttachmentPreview({ attachment, jobId }: { attachment: Attachment; jobId?: string }) {
  // Use our preview API which streams files with proper headers
  const previewUrl = `/api/collection/preview/${attachment.id}`
  
  // Use the direct fileUrl as fallback (Vercel Blob URL)
  const fallbackUrl = attachment.fileUrl || undefined
  
  // For download, use the fileUrl directly if available, otherwise use preview URL
  const downloadUrl = attachment.fileUrl || previewUrl

  const isImage = attachment.mimeType?.startsWith("image/")
  const isPdf = attachment.mimeType?.includes("pdf")

  // Proper download function that fetches as blob and triggers download
  const handleDownload = async () => {
    try {
      // Fetch the file as a blob
      const response = await fetch(previewUrl, { credentials: "include" })
      if (!response.ok) {
        // Try fallback URL
        if (fallbackUrl) {
          const fallbackResponse = await fetch(fallbackUrl)
          if (!fallbackResponse.ok) throw new Error("Download failed")
          const blob = await fallbackResponse.blob()
          triggerDownload(blob, attachment.filename)
          return
        }
        throw new Error("Download failed")
      }
      const blob = await response.blob()
      triggerDownload(blob, attachment.filename)
    } catch (error) {
      console.error("Download error:", error)
      // Fallback: open in new tab
      window.open(downloadUrl, "_blank")
    }
  }

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // PDF Preview using PDF.js
  if (isPdf) {
    return (
      <PDFViewer
        url={previewUrl}
        filename={attachment.filename}
        fallbackUrl={fallbackUrl}
        onDownload={handleDownload}
      />
    )
  }

  // Image Preview
  if (isImage) {
    return (
      <ImageViewer
        url={previewUrl}
        filename={attachment.filename}
        fallbackUrl={fallbackUrl}
        onDownload={handleDownload}
      />
    )
  }

  // Fallback for other file types
  return (
    <div className="h-full flex items-center justify-center bg-gray-100 p-4">
      <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
        <File className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="font-medium text-gray-900 mb-1">{attachment.filename}</h3>
        <p className="text-sm text-gray-500 mb-4">
          {attachment.mimeType || "Document"}
        </p>
        <div className="flex flex-col gap-2">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open in new tab
          </a>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>
      </div>
    </div>
  )
}
