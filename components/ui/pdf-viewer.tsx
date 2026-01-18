"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Download,
  ExternalLink,
  Loader2,
  AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface PDFViewerProps {
  url: string
  filename: string
  fallbackUrl?: string // Direct URL to file (e.g., Vercel Blob URL) as fallback
  onDownload?: () => void
}

/**
 * PDF Viewer Component using PDF.js
 * Renders PDFs client-side to canvas, avoiding iframe/X-Frame-Options issues
 */
export function PDFViewer({ url, filename, fallbackUrl, onDownload }: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [pdfDoc, setPdfDoc] = useState<any>(null)

  // Load PDF.js dynamically (it's a large library)
  useEffect(() => {
    let cancelled = false

    const loadPDF = async () => {
      try {
        setLoading(true)
        setError(null)

        // Dynamic import of PDF.js
        const pdfjsLib = await import("pdfjs-dist")
        
        // Set worker source - use unpkg CDN which is more reliable
        // Version must match the installed pdfjs-dist package
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

        // Try primary URL first, then fallback
        let arrayBuffer: ArrayBuffer | null = null
        
        // Try API URL first
        try {
          const response = await fetch(url, { credentials: "include" })
          if (response.ok) {
            arrayBuffer = await response.arrayBuffer()
          }
        } catch (e) {
          console.warn("Primary URL failed, trying fallback:", e)
        }
        
        // If primary failed and we have a fallback, try it
        if (!arrayBuffer && fallbackUrl) {
          console.log("Trying fallback URL:", fallbackUrl)
          const fallbackResponse = await fetch(fallbackUrl)
          if (!fallbackResponse.ok) {
            throw new Error(`Failed to load PDF: ${fallbackResponse.status}`)
          }
          arrayBuffer = await fallbackResponse.arrayBuffer()
        }
        
        if (!arrayBuffer) {
          throw new Error("Failed to load PDF: No valid source")
        }
        
        if (cancelled) return

        // Load PDF document
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
        const pdf = await loadingTask.promise

        if (cancelled) return

        setPdfDoc(pdf)
        setNumPages(pdf.numPages)
        setCurrentPage(1)
        setLoading(false)
      } catch (err: any) {
        if (!cancelled) {
          console.error("PDF load error:", err)
          setError(err.message || "Failed to load PDF")
          setLoading(false)
        }
      }
    }

    loadPDF()

    return () => {
      cancelled = true
    }
  }, [url, fallbackUrl])

  // Render current page
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return

    try {
      const page = await pdfDoc.getPage(currentPage)
      const canvas = canvasRef.current
      const context = canvas.getContext("2d")

      if (!context) return

      // Calculate scale to fit container width
      const containerWidth = containerRef.current?.clientWidth || 800
      const viewport = page.getViewport({ scale: 1 })
      const fitScale = (containerWidth - 48) / viewport.width // 48px for padding
      const actualScale = fitScale * scale

      const scaledViewport = page.getViewport({ scale: actualScale })

      // Set canvas dimensions
      canvas.height = scaledViewport.height
      canvas.width = scaledViewport.width

      // Render page
      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport
      }

      await page.render(renderContext).promise
    } catch (err) {
      console.error("Page render error:", err)
    }
  }, [pdfDoc, currentPage, scale])

  // Re-render when page or scale changes
  useEffect(() => {
    renderPage()
  }, [renderPage])

  // Navigation handlers
  const goToPrevPage = () => {
    if (currentPage > 1) setCurrentPage(prev => prev - 1)
  }

  const goToNextPage = () => {
    if (currentPage < numPages) setCurrentPage(prev => prev + 1)
  }

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3))
  }

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5))
  }

  const openInNewTab = () => {
    window.open(url, "_blank")
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 rounded-lg p-8">
        <Loader2 className="w-10 h-10 animate-spin text-orange-500 mb-4" />
        <p className="text-gray-600">Loading PDF...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 rounded-lg p-8">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="font-medium text-gray-900 mb-2">Unable to load PDF</h3>
        <p className="text-sm text-gray-500 mb-4 text-center max-w-md">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openInNewTab}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open in new tab
          </Button>
          {onDownload && (
            <Button onClick={onDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-100" ref={containerRef}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          {/* Page Navigation */}
          <Button
            variant="ghost"
            size="sm"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-gray-600 min-w-[80px] text-center">
            Page {currentPage} of {numPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="h-8 w-8 p-0"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm text-gray-600 w-14 text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomIn}
            disabled={scale >= 3}
            className="h-8 w-8 p-0"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>

          <div className="w-px h-4 bg-gray-300 mx-2" />

          {/* Actions */}
          <Button variant="ghost" size="sm" onClick={openInNewTab}>
            <ExternalLink className="w-4 h-4" />
          </Button>
          {onDownload && (
            <Button variant="ghost" size="sm" onClick={onDownload}>
              <Download className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Canvas Container */}
      <div className="flex-1 overflow-auto flex justify-center p-4">
        <canvas
          ref={canvasRef}
          className="shadow-lg bg-white"
          style={{ maxWidth: "100%" }}
        />
      </div>
    </div>
  )
}

/**
 * Image Viewer Component
 * Simple image preview with zoom controls
 */
interface ImageViewerProps {
  url: string
  filename: string
  fallbackUrl?: string // Direct URL to file as fallback
  onDownload?: () => void
}

export function ImageViewer({ url, filename, fallbackUrl, onDownload }: ImageViewerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3))
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.25))
  const rotate = () => setRotation(prev => (prev + 90) % 360)

  // Use fallback URL if primary fails
  const imageUrl = useFallback && fallbackUrl ? fallbackUrl : url

  const openInNewTab = () => {
    window.open(imageUrl, "_blank")
  }

  const handleImageError = () => {
    // If primary URL fails and we have a fallback, try it
    if (!useFallback && fallbackUrl) {
      console.log("Primary image URL failed, trying fallback")
      setUseFallback(true)
    } else {
      setLoading(false)
      setError(true)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 rounded-lg p-8">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="font-medium text-gray-900 mb-2">Unable to load image</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openInNewTab}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open in new tab
          </Button>
          {onDownload && (
            <Button onClick={onDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Toolbar */}
      <div className="flex items-center justify-end px-4 py-2 bg-white border-b border-gray-200 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={zoomOut}
          disabled={scale <= 0.25}
          className="h-8 w-8 p-0"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-sm text-gray-600 w-14 text-center">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={zoomIn}
          disabled={scale >= 3}
          className="h-8 w-8 p-0"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>

        <Button variant="ghost" size="sm" onClick={rotate} className="h-8 w-8 p-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </Button>

        <div className="w-px h-4 bg-gray-300 mx-2" />

        <Button variant="ghost" size="sm" onClick={openInNewTab}>
          <ExternalLink className="w-4 h-4" />
        </Button>
        {onDownload && (
          <Button variant="ghost" size="sm" onClick={onDownload}>
            <Download className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Image Container */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {loading && (
          <div className="absolute">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        )}
        <img
          src={imageUrl}
          alt={filename}
          className="max-w-full h-auto shadow-lg transition-transform duration-200"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            opacity: loading ? 0 : 1
          }}
          onLoad={() => setLoading(false)}
          onError={handleImageError}
        />
      </div>
    </div>
  )
}
