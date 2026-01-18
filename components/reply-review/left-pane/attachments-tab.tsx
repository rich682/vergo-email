"use client"

import { useState, useEffect } from "react"
import { 
  FileText, 
  FileImage, 
  FileSpreadsheet, 
  File, 
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2
} from "lucide-react"
import { Button } from "@/components/ui/button"

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

  // Auto-select first attachment if none selected
  useEffect(() => {
    if (!selectedId && attachments.length > 0) {
      onSelect(attachments[0].id)
    }
  }, [selectedId, attachments, onSelect])

  if (attachments.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">No attachments</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Attachment List Rail */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 p-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {attachments.map((attachment) => {
            const Icon = getFileIcon(attachment.mimeType)
            const iconColor = getIconColor(attachment.mimeType)
            const isSelected = attachment.id === selectedId

            return (
              <button
                key={attachment.id}
                onClick={() => onSelect(attachment.id)}
                className={`flex-shrink-0 min-w-[140px] p-3 rounded-lg border-2 transition-all text-left ${
                  isSelected
                    ? "border-orange-500 bg-orange-50"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
                <p className="text-xs font-medium text-gray-900 truncate" title={attachment.filename}>
                  {attachment.filename}
                </p>
                {attachment.fileSize && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {formatFileSize(attachment.fileSize)}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Preview Area */}
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

// Simplified Attachment Preview (graceful fallback, no error messaging)
function AttachmentPreview({ attachment, jobId }: { attachment: Attachment; jobId?: string }) {
  const [previewFailed, setPreviewFailed] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)

  // Use our preview API which streams files with inline headers
  // This works for both Vercel Blob and local storage, and avoids X-Frame-Options issues
  const previewUrl = `/api/collection/preview/${attachment.id}`
  
  // For download, use the fileUrl directly if available, otherwise use preview URL
  const downloadUrl = attachment.fileUrl || previewUrl

  useEffect(() => {
    // Reset state when attachment changes
    setZoom(100)
    setRotation(0)
    setPreviewFailed(false)
  }, [attachment?.id])

  const isImage = attachment.mimeType?.startsWith("image/")
  const isPdf = attachment.mimeType?.includes("pdf")
  const canPreview = (isImage || isPdf) && !previewFailed

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200))
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50))
  const handleRotate = () => setRotation(prev => (prev + 90) % 360)

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = attachment.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Preview Toolbar */}
      <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-900 truncate" title={attachment.filename}>
            {attachment.filename}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {canPreview && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoom <= 50}
                className="h-8 w-8 p-0"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-xs text-gray-500 w-12 text-center">{zoom}%</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoom >= 200}
                className="h-8 w-8 p-0"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              {isImage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRotate}
                  className="h-8 w-8 p-0"
                >
                  <RotateCw className="w-4 h-4" />
                </Button>
              )}
              <div className="w-px h-4 bg-gray-200" />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-8"
          >
            <Download className="w-4 h-4 mr-1" />
            Download
          </Button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {isImage && !previewFailed ? (
          <div 
            className="transition-transform"
            style={{ 
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              transformOrigin: 'center center'
            }}
          >
            <img
              src={previewUrl}
              alt={attachment.filename}
              className="max-w-full h-auto rounded-lg shadow-lg"
              onError={() => setPreviewFailed(true)}
            />
          </div>
        ) : isPdf && !previewFailed ? (
          // Use iframe to embed PDF from our preview API
          <iframe
            src={previewUrl}
            className="w-full h-full rounded-lg bg-white shadow-lg"
            style={{ 
              minHeight: '600px',
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top left',
              width: `${100 / (zoom / 100)}%`,
              height: `${100 / (zoom / 100)}%`
            }}
            title={attachment.filename}
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          // Graceful fallback - offer to open in new tab or download
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
        )}
      </div>
    </div>
  )
}
