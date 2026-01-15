"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Upload, Download, FileText, CheckCircle, XCircle, 
  Clock, Filter, RefreshCw, Trash2, MoreHorizontal,
  FileImage, FileSpreadsheet, File, Archive
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { CollectionUploadModal } from "./collection-upload-modal"
import { CollectionApprovalModal } from "./collection-approval-modal"

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
  status: "UNREVIEWED" | "APPROVED" | "REJECTED"
  reviewedBy: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  notes: string | null
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
  reviewer?: {
    id: string
    name: string | null
    email: string
  } | null
}

interface ApprovalSummary {
  total: number
  approved: number
  rejected: number
  unreviewed: number
  canComplete: boolean
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

// Status badge component
function StatusBadge({ status }: { status: CollectedItem["status"] }) {
  switch (status) {
    case "APPROVED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3" />
          Approved
        </span>
      )
    case "REJECTED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <XCircle className="w-3 h-3" />
          Rejected
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <Clock className="w-3 h-3" />
          Unreviewed
        </span>
      )
  }
}

export function CollectionTab({ jobId }: CollectionTabProps) {
  // State
  const [items, setItems] = useState<CollectedItem[]>([])
  const [summary, setSummary] = useState<ApprovalSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  
  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [approvalItem, setApprovalItem] = useState<CollectedItem | null>(null)
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve")
  
  // Bulk action loading
  const [bulkLoading, setBulkLoading] = useState(false)

  // Fetch items
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (sourceFilter !== "all") params.set("source", sourceFilter)
      
      const response = await fetch(
        `/api/jobs/${jobId}/collection?${params.toString()}`,
        { credentials: "include" }
      )
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to fetch collection")
      }
      
      const data = await response.json()
      setItems(data.items || [])
      setSummary(data.summary || null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [jobId, statusFilter, sourceFilter])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Handle status update
  const handleStatusUpdate = async (itemId: string, status: "APPROVED" | "REJECTED", reason?: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/collection/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, rejectionReason: reason })
      })
      
      if (!response.ok) {
        throw new Error("Failed to update status")
      }
      
      await fetchItems()
      setApprovalItem(null)
    } catch (err: any) {
      console.error("Error updating status:", err)
    }
  }

  // Handle bulk action
  const handleBulkAction = async (action: "approve" | "reject" | "reset" | "download" | "delete") => {
    if (selectedIds.length === 0) return
    
    try {
      setBulkLoading(true)
      
      if (action === "download") {
        // Download files individually
        for (const id of selectedIds) {
          const item = items.find(i => i.id === id)
          if (item) {
            await handleDownload(id, item.filename)
          }
        }
        setSelectedIds([])
      } else {
        const response = await fetch(`/api/jobs/${jobId}/collection/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action, ids: selectedIds })
        })
        
        if (!response.ok) throw new Error(`Failed to ${action}`)
        
        await fetchItems()
        setSelectedIds([])
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
        `/api/jobs/${jobId}/collection/download?itemId=${itemId}`,
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
    if (!confirm("Are you sure you want to delete this item?")) return
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/collection/${itemId}`, {
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

  // Export CSV
  const handleExport = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/collection/export`, {
        credentials: "include"
      })
      
      if (!response.ok) throw new Error("Export failed")
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `collection-export-${Date.now()}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error("Export error:", err)
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
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
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
              <div className="text-sm text-gray-500">Total Items</div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-700">{summary.approved}</div>
              <div className="text-sm text-green-600">Approved</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-700">{summary.rejected}</div>
              <div className="text-sm text-red-600">Rejected</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-700">{summary.unreviewed}</div>
              <div className="text-sm text-amber-600">Pending Review</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {/* Filters */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="UNREVIEWED">Unreviewed</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px]">
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
              >
                <CheckCircle className="w-4 h-4 text-green-600" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleBulkAction("reject")}
                disabled={bulkLoading}
              >
                <XCircle className="w-4 h-4 text-red-600" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleBulkAction("download")}
                disabled={bulkLoading}
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleBulkAction("delete")}
                disabled={bulkLoading}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>

          <Button onClick={() => setIsUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload File
          </Button>
        </div>
      </div>

      {/* Items Table */}
      {items.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No items collected yet</h3>
          <p className="text-gray-500 mb-4">
            Items will appear here when stakeholders reply with attachments or you upload files manually.
          </p>
          <Button onClick={() => setIsUploadOpen(true)}>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="w-20 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelection(item.id)}
                      className="rounded border-gray-300"
                    />
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
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                    {item.rejectionReason && (
                      <div className="text-xs text-red-600 mt-1 truncate max-w-[150px]" title={item.rejectionReason}>
                        {item.rejectionReason}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {item.status === "UNREVIEWED" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setApprovalItem(item)
                              setApprovalAction("approve")
                            }}
                            title="Approve"
                          >
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setApprovalItem(item)
                              setApprovalAction("reject")
                            }}
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(item.id, item.filename)}
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
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

      {/* Approval Modal */}
      {approvalItem && (
        <CollectionApprovalModal
          item={approvalItem}
          action={approvalAction}
          isOpen={true}
          onClose={() => setApprovalItem(null)}
          onConfirm={(reason) => {
            handleStatusUpdate(
              approvalItem.id,
              approvalAction === "approve" ? "APPROVED" : "REJECTED",
              reason
            )
          }}
        />
      )}
    </div>
  )
}
