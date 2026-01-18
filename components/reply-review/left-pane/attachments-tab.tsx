"use client"

import { useState, useEffect } from "react"
import { 
  FileText, 
  FileImage, 
  FileSpreadsheet, 
  File, 
  Download,
  ExternalLink,
  Loader2,
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
  const [loading, setLoading] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    if (!attachment) {
      setDownloadUrl(null)
      setPreviewFailed(false)
      return
    }

    // Reset state
    setZoom(100)
    setRotation(0)
    setPreviewFailed(false)
    setLoading(true)

    // Use fileUrl directly if available (Vercel Blob URLs are publicly accessible)
    if (attachment.fileUrl) {
      try {
        const previewUrl = new URL(attachment.fileUrl)
        previewUrl.searchParams.delete("download")
        setDownloadUrl(previewUrl.toString())
      } catch {
        setDownloadUrl(attachment.fileUrl)
      }
      setLoading(false)
      return
    }

    // Fallback: Fetch URL from API
    const fetchUrl = async () => {
      try {
        // Try attachments API first
        const attachResponse = await fetch(
          `/api/attachments/download/${attachment.id}`,
          { credentials: "include" }
        )
        
        if (attachResponse.ok) {
          const data = await attachResponse.json()
          if (data.url) {
            setDownloadUrl(data.url)
            return
          }
        }

        // Try collection API with jobId
        const effectiveJobId = jobId || (attachment.fileKey ? attachment.fileKey.split('/')[1] : null)
        if (effectiveJobId) {
          const collectionResponse = await fetch(
            `/api/jobs/${effectiveJobId}/collection/download?itemId=${attachment.id}`,
            { credentials: "include", redirect: "follow" }
          )
          
          if (collectionResponse.ok && collectionResponse.url !== window.location.href) {
            setDownloadUrl(collectionResponse.url)
            return
          }
        }

        setPreviewFailed(true)
      } catch {
        setPreviewFailed(true)
      } finally {
        setLoading(false)
      }
    }

    fetchUrl()
  }, [attachment?.id, attachment?.fileUrl, jobId])

  const isImage = attachment.mimeType?.startsWith("image/")
  const isPdf = attachment.mimeType?.includes("pdf")
  const canPreview = (isImage || isPdf) && !previewFailed

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200))
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50))
  const handleRotate = () => setRotation(prev => (prev + 90) % 360)

  const handleDownload = () => {
    if (downloadUrl) {
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = attachment.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } else if (attachment.fileUrl) {
      window.open(attachment.fileUrl, '_blank')
    }
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
          {canPreview && downloadUrl && (
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
        {loading ? (
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading preview...</p>
          </div>
        ) : isImage && downloadUrl && !previewFailed ? (
          <div 
            className="transition-transform"
            style={{ 
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              transformOrigin: 'center center'
            }}
          >
            <img
              src={downloadUrl}
              alt={attachment.filename}
              className="max-w-full h-auto rounded-lg shadow-lg"
              onError={() => setPreviewFailed(true)}
            />
          </div>
        ) : isPdf && downloadUrl && !previewFailed ? (
          // Use object tag with iframe fallback for better PDF compatibility
          <object
            data={downloadUrl}
            type="application/pdf"
            className="w-full h-full rounded-lg bg-white shadow-lg"
            style={{ 
              minHeight: '500px',
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top left',
              width: `${100 / (zoom / 100)}%`,
              height: `${100 / (zoom / 100)}%`
            }}
          >
            {/* Fallback to Google Docs viewer if native PDF doesn't work */}
            <iframe
              src={`https://docs.google.com/gview?url=${encodeURIComponent(downloadUrl)}&embedded=true`}
              className="w-full h-full"
              style={{ minHeight: '500px' }}
              title={attachment.filename}
            />
          </object>
        ) : (
          // Graceful fallback - offer to open in new tab
          <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
            <File className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="font-medium text-gray-900 mb-1">{attachment.filename}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {attachment.mimeType || "Document"}
            </p>
            {downloadUrl || attachment.fileUrl ? (
              <div className="flex flex-col gap-2">
                <a
                  href={downloadUrl || attachment.fileUrl || "#"}
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
            ) : (
              <Button onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
