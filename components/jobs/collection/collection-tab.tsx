"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Upload, Download, FileText, Filter, RefreshCw, Trash2,
  FileImage, FileSpreadsheet, File, Archive, Eye, X, ExternalLink,
  CheckCircle, XCircle, RotateCcw
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { CollectionUploadModal } from "./collection-upload-modal"
import { PDFViewer, ImageViewer } from "@/components/ui/pdf-viewer"

// Types
interface CollectedItem {
  id: string
  filename: string
  fileKey: string
  fileUrl: string | null
  fileSize: number | null
  mimeType: string | null
  source: "EMAIL_REPLY" | "MANUAL_UPLOAD"
  submittedBy: string | null
  submittedByName: string | null
  receivedAt: string
  messageId: string | null // Direct reference for navigation
  task?: {
    id: string
    campaignName: string | null
    entity?: {
      id: string
      firstName: string
      lastName: string | null
      email: string | null
    } | null
  } | null
  message?: {
    id: string
    subject: string | null
    createdAt: string
  } | null
}

interface CollectionTabProps {
  jobId: string
}

// Helper to get file icon based on mime type
function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="w-5 h-5 text-gray-400" />
  
  if (mimeType.startsWith("image/")) {
    return <FileImage className="w-5 h-5 text-blue-500" />
  }
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) {
    return <FileSpreadsheet className="w-5 h-5 text-green-500" />
  }
  if (mimeType.includes("pdf")) {
    return <FileText className="w-5 h-5 text-red-500" />
  }
  if (mimeType.includes("zip") || mimeType.includes("archive")) {
    return <Archive className="w-5 h-5 text-yellow-500" />
  }
  return <File className="w-5 h-5 text-gray-400" />
}

// Helper to format file size
function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Check if file is previewable
function isPreviewable(mimeType: string | null): boolean {
  if (!mimeType) return false
  return mimeType.startsWith("image/") || mimeType.includes("pdf")
}

export function CollectionTab({ jobId }: CollectionTabProps) {
  const router = useRouter()
  
  // State
  const [items, setItems] = useState<CollectedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  
  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<CollectedItem | null>(null)
  
  // Bulk action loading
  const [bulkLoading, setBulkLoading] = useState(false)

  // Fetch items
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams()
      if (sourceFilter !== "all") params.set("source", sourceFilter)
      
      const response = await fetch(
        `/api/task-instances/${jobId}/collection?${params.toString()}`,
        { credentials: "include" }
      )
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to fetch collection")
      }
      
      const data = await response.json()
      setItems(data.items || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [jobId, sourceFilter])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Handle bulk download
  const handleBulkDownload = async () => {
    if (selectedIds.length === 0) return
    
    try {
      setBulkLoading(true)
      
      for (const id of selectedIds) {
        const item = items.find(i => i.id === id)
        if (item) {
          await handleDownload(item.id, item.filename)
        }
      }
      setSelectedIds([])
    } catch (err: any) {
      console.error("Bulk download error:", err)
    } finally {
      setBulkLoading(false)
    }
  }

  // Handle bulk status actions (approve/reject/reset/delete)
  const handleBulkAction = async (action: "approve" | "reject" | "reset" | "delete") => {
    if (selectedIds.length === 0) return
    
    if (action === "delete" && !confirm(`Are you sure you want to delete ${selectedIds.length} file(s)?`)) {
      return
    }
    
    setBulkLoading(true)
    try {
      const response = await fetch(`/api/task-instances/${jobId}/collection/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, ids: selectedIds })
      })
      
      if (response.ok) {
        setSelectedIds([])
        await fetchItems()
      } else {
        const data = await response.json()
        console.error("Bulk action error:", data.error)
      }
    } catch (err: any) {
      console.error("Bulk action error:", err)
    } finally {
      setBulkLoading(false)
    }
  }

  // Handle single download
  const handleDownload = async (itemId: string, filename: string) => {
    try {
      const response = await fetch(
        `/api/task-instances/${jobId}/collection/download?itemId=${itemId}`,
        { credentials: "include" }
      )
      
      if (!response.ok) throw new Error("Download failed")
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error("Download error:", err)
    }
  }

  // Handle delete
  const handleDelete = async (itemId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return
    
    try {
      const response = await fetch(`/api/task-instances/${jobId}/collection/${itemId}`, {
        method: "DELETE",
        credentials: "include"
      })
      
      if (!response.ok) throw new Error("Delete failed")
      
      await fetchItems()
    } catch (err: any) {
      console.error("Delete error:", err)
    }
  }

  // Toggle selection
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    )
  }

  // Select all
  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(items.map(i => i.id))
    }
  }

  // Check if item can navigate to review (has messageId from email reply)
  const canNavigateToReview = (item: CollectedItem) => {
    const messageId = item.message?.id || item.messageId
    return item.source === "EMAIL_REPLY" && !!messageId
  }

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <Button variant="outline" onClick={fetchItems}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {/* Source Filter */}
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="EMAIL_REPLY">Email Reply</SelectItem>
              <SelectItem value="MANUAL_UPLOAD">Manual Upload</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={fetchItems}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          
          <span className="text-sm text-gray-500">
            {items.length} file{items.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk Actions */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 mr-4 px-3 py-1 bg-gray-100 rounded-lg">
              <span className="text-sm text-gray-600">{selectedIds.length} selected</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleBulkAction("approve")}
                disabled={bulkLoading}
                title="Approve selected"
              >
                <CheckCircle className="w-4 h-4 text-green-600" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleBulkAction("reject")}
                disabled={bulkLoading}
                title="Reject selected"
              >
                <XCircle className="w-4 h-4 text-red-600" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleBulkAction("reset")}
                disabled={bulkLoading}
                title="Reset to unreviewed"
              >
                <RotateCcw className="w-4 h-4 text-gray-600" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBulkDownload}
                disabled={bulkLoading}
                title="Download selected"
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleBulkAction("delete")}
                disabled={bulkLoading}
                title="Delete selected"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            onClick={() => {
              window.location.href = `/api/task-instances/${jobId}/collection/export`
            }}
            disabled={items.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export All
          </Button>
          
          <Button onClick={() => setIsUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload File
          </Button>
        </div>
      </div>

      {/* Items Table */}
      {items.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900 mb-1">No files collected yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Files will appear here when stakeholders reply with attachments
          </p>
          <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload File
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === items.length && items.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="w-16 px-4 py-3"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received</th>
                <th className="w-12 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => {
                const navigable = canNavigateToReview(item)
                return (
                <tr 
                  key={item.id} 
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelection(item.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  {/* Open button column */}
                  <td className="px-4 py-3">
                    {navigable ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const msgId = item.message?.id || item.messageId
                          if (msgId) {
                            router.push(`/dashboard/review/${msgId}?tab=attachments&attachmentId=${item.id}`)
                          }
                        }}
                        title="Open reply"
                        className="h-7 px-2 text-xs text-gray-600 hover:text-orange-600 hover:bg-orange-50"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        Open
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewItem(item)}
                        title="Preview file"
                        className="h-7 px-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        View
                      </Button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {getFileIcon(item.mimeType)}
                      <div>
                        <div className="font-medium text-gray-900 truncate max-w-[200px]">
                          {item.filename}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatFileSize(item.fileSize)}
                        </div>
                      </div>
                    </div>
                  </td>
                  {/* Task column - plain text, no hyperlink */}
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">
                      {item.task?.campaignName || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">
                      {item.submittedByName || item.submittedBy || "—"}
                    </div>
                    {item.submittedByName && item.submittedBy && (
                      <div className="text-xs text-gray-500">{item.submittedBy}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      item.source === "EMAIL_REPLY" 
                        ? "bg-blue-100 text-blue-700" 
                        : "bg-gray-100 text-gray-700"
                    }`}>
                      {item.source === "EMAIL_REPLY" ? "Email" : "Upload"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">
                      {format(new Date(item.receivedAt), "MMM d, yyyy")}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(item.receivedAt), { addSuffix: true })}
                    </div>
                  </td>
                  {/* Download column */}
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(item.id, item.filename)}
                      title="Download"
                      className="h-7 w-7 p-0 text-gray-500 hover:text-gray-700"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      <CollectionUploadModal
        jobId={jobId}
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => {
          setIsUploadOpen(false)
          fetchItems()
        }}
      />

      {/* Preview Modal */}
      {previewItem && (
        <FilePreviewModal
          jobId={jobId}
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onDownload={() => handleDownload(previewItem.id, previewItem.filename)}
        />
      )}
    </div>
  )
}

// File Preview Modal Component using PDF.js
interface FilePreviewModalProps {
  jobId: string
  item: CollectedItem
  onClose: () => void
  onDownload: () => void
}

function FilePreviewModal({ jobId, item, onClose, onDownload }: FilePreviewModalProps) {
  const isImage = item.mimeType?.startsWith("image/")
  const isPdf = item.mimeType?.includes("pdf")
  
  // Use our preview API which streams files with proper headers
  const previewUrl = `/api/collection/preview/${item.id}`
  
  // Use the direct fileUrl as fallback (Vercel Blob URL)
  const fallbackUrl = item.fileUrl || undefined

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full h-full max-w-6xl max-h-[90vh] m-4 bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-3 min-w-0">
            {getFileIcon(item.mimeType)}
            <div className="min-w-0">
              <h3 className="font-medium text-gray-900 truncate">{item.filename}</h3>
              <p className="text-xs text-gray-500">{formatFileSize(item.fileSize)}</p>
            </div>
          </div>
          
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Preview Content */}
        <div className="flex-1 overflow-hidden">
          {isPdf ? (
            <PDFViewer
              url={previewUrl}
              filename={item.filename}
              fallbackUrl={fallbackUrl}
              onDownload={onDownload}
            />
          ) : isImage ? (
            <ImageViewer
              url={previewUrl}
              filename={item.filename}
              fallbackUrl={fallbackUrl}
              onDownload={onDownload}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-100">
              <div className="text-center p-8 bg-white rounded-lg shadow max-w-md">
                <File className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="font-medium text-gray-900 mb-2">{item.filename}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {item.mimeType || "Document"}
                </p>
                <Button onClick={onDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  Download File
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
