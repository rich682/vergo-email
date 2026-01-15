"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Download, FileText, Filter, RefreshCw, FolderOpen,
  FileImage, FileSpreadsheet, File, Archive, ExternalLink
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import Link from "next/link"

// Types
interface CollectedItem {
  id: string
  jobId: string
  filename: string
  fileKey: string
  fileUrl: string | null
  fileSize: number | null
  mimeType: string | null
  source: "EMAIL_REPLY" | "MANUAL_UPLOAD"
  submittedBy: string | null
  submittedByName: string | null
  receivedAt: string
  job?: {
    id: string
    name: string
    owner?: {
      id: string
      name: string | null
      email: string
    }
  }
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
}

interface JobOption {
  id: string
  name: string
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

export default function CollectionPage() {
  // State
  const [items, setItems] = useState<CollectedItem[]>([])
  const [total, setTotal] = useState(0)
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [jobFilter, setJobFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  
  // Bulk action loading
  const [bulkLoading, setBulkLoading] = useState(false)

  // Fetch all items across all jobs
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams()
      if (jobFilter !== "all") params.set("jobId", jobFilter)
      if (sourceFilter !== "all") params.set("source", sourceFilter)
      
      const response = await fetch(
        `/api/collection?${params.toString()}`,
        { credentials: "include" }
      )
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to fetch collection")
      }
      
      const data = await response.json()
      setItems(data.items || [])
      setTotal(data.total || 0)
      setJobs(data.jobs || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [jobFilter, sourceFilter])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Handle single download
  const handleDownload = async (item: CollectedItem) => {
    try {
      const response = await fetch(
        `/api/jobs/${item.jobId}/collection/download?itemId=${item.id}`,
        { credentials: "include" }
      )
      
      if (!response.ok) throw new Error("Download failed")
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = item.filename
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error("Download error:", err)
    }
  }

  // Handle bulk download
  const handleBulkDownload = async () => {
    if (selectedIds.length === 0) return
    setBulkLoading(true)
    
    try {
      // Download each file individually
      for (const id of selectedIds) {
        const item = items.find(i => i.id === id)
        if (item) {
          await handleDownload(item)
          // Small delay between downloads
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }
      setSelectedIds([])
    } catch (err: any) {
      console.error("Bulk download error:", err)
    } finally {
      setBulkLoading(false)
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

  if (loading && items.length === 0) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchItems}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Collection</h1>
        <p className="text-gray-500 mt-1">
          All attachments received from email responses to your requests
        </p>
      </div>

      {/* Summary Card */}
      <div className="mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-gray-900">{total}</div>
            <div className="text-sm text-gray-500">Total Attachments</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          {/* Filters */}
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="w-[200px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by Task" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              {jobs.map(job => (
                <SelectItem key={job.id} value={job.id}>
                  {job.name}
                </SelectItem>
              ))}
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
                onClick={handleBulkDownload}
                disabled={bulkLoading}
              >
                <Download className="w-4 h-4 mr-1" />
                Download
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Items Table */}
      {items.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No attachments collected yet</h3>
          <p className="text-gray-500 mb-4">
            Attachments will appear here when stakeholders reply to your requests with files.
          </p>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task Owner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Received</th>
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
                    {item.job ? (
                      <Link 
                        href={`/dashboard/jobs/${item.jobId}`}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      >
                        {item.job.name}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.job?.owner ? (
                      <div className="text-sm text-gray-900">
                        {item.job.owner.name || item.job.owner.email}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    )}
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
                    <div className="text-sm text-gray-900">
                      {format(new Date(item.receivedAt), "MMM d, yyyy")}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(item.receivedAt), { addSuffix: true })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(item)}
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
