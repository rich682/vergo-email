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
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCw
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface Attachment {
  id: string
  filename: string
  fileKey: string
  fileUrl: string | null
  fileSize: number | null
  mimeType: string | null
  source: string
  status: string
  receivedAt: string
}

interface AttachmentPreviewProps {
  attachment: Attachment | null
}

export function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    if (!attachment) {
      setDownloadUrl(null)
      setError(null)
      return
    }

    // Reset state
    setZoom(100)
    setRotation(0)
    setError(null)

    // Fetch download URL
    const fetchUrl = async () => {
      setLoading(true)
      try {
        // Use collected item download endpoint
        const jobId = attachment.fileKey.split('/')[1] // Extract jobId from fileKey
        const response = await fetch(
          `/api/jobs/${jobId}/collection/download?itemId=${attachment.id}`,
          { credentials: "include" }
        )

        if (!response.ok) {
          // Try alternate endpoint
          if (attachment.fileUrl) {
            setDownloadUrl(attachment.fileUrl)
          } else {
            throw new Error("Failed to fetch download URL")
          }
        } else {
          // Create blob URL for preview
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          setDownloadUrl(url)
        }
      } catch (err: any) {
        console.error("Error fetching attachment:", err)
        // Fallback to fileUrl if available
        if (attachment.fileUrl) {
          setDownloadUrl(attachment.fileUrl)
        } else {
          setError("Could not load preview")
        }
      } finally {
        setLoading(false)
      }
    }

    fetchUrl()

    // Cleanup blob URL on unmount
    return () => {
      if (downloadUrl && downloadUrl.startsWith('blob:')) {
        URL.revokeObjectURL(downloadUrl)
      }
    }
  }, [attachment?.id])

  if (!attachment) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <File className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select an attachment to preview</p>
        </div>
      </div>
    )
  }

  const isImage = attachment.mimeType?.startsWith("image/")
  const isPdf = attachment.mimeType?.includes("pdf")
  const canPreview = isImage || isPdf

  // Zoom controls
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200))
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50))
  const handleRotate = () => setRotation(prev => (prev + 90) % 360)

  // Download handler
  const handleDownload = () => {
    if (downloadUrl) {
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = attachment.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
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
          {canPreview && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoom <= 50}
                className="h-8 w-8 p-0"
                aria-label="Zoom out"
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
                aria-label="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              {isImage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRotate}
                  className="h-8 w-8 p-0"
                  aria-label="Rotate image"
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
            disabled={!downloadUrl}
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
        ) : error ? (
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-600 mb-2">{error}</p>
            {attachment.fileUrl && (
              <a
                href={attachment.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Open in new tab
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : isImage && downloadUrl ? (
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
            />
          </div>
        ) : isPdf && downloadUrl ? (
          <iframe
            src={downloadUrl}
            className="w-full h-full rounded-lg bg-white shadow-lg"
            style={{ 
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top left',
              width: `${100 / (zoom / 100)}%`,
              height: `${100 / (zoom / 100)}%`
            }}
            title={attachment.filename}
          />
        ) : (
          // Non-previewable file
          <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
            <File className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="font-medium text-gray-900 mb-1">{attachment.filename}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {attachment.mimeType || "Unknown file type"}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Preview not available for this file type
            </p>
            <Button onClick={handleDownload} disabled={!downloadUrl}>
              <Download className="w-4 h-4 mr-2" />
              Download File
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
