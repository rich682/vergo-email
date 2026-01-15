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
import { Input } from "@/components/ui/input"
import { 
  Download, FileText, Filter, RefreshCw, FolderOpen,
  FileImage, FileSpreadsheet, File, Archive, ExternalLink,
  Info, Search, X
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

// Types
interface BoardOption {
  id: string
  name: string
}

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
    ownerId?: string
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
  message?: {
    id: string
    isAutoReply: boolean
  } | null
}

interface JobOption {
  id: string
  name: string
}

interface OwnerOption {
  id: string
  name: string | null
  email: string
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
  const searchParams = useSearchParams()
  const boardIdFromUrl = searchParams.get("boardId")
  
  // State
  const [items, setItems] = useState<CollectedItem[]>([])
  const [total, setTotal] = useState(0)
  const [pdfCount, setPdfCount] = useState(0)
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [boards, setBoards] = useState<BoardOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [boardFilter, setBoardFilter] = useState<string>(boardIdFromUrl || "all")
  const [jobFilter, setJobFilter] = useState<string>("all")
  const [ownerFilter, setOwnerFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [fileTypeFilter, setFileTypeFilter] = useState<string>("pdf") // Default to PDF only
  const [submitterSearch, setSubmitterSearch] = useState<string>("")
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  
  // Bulk action loading
  const [bulkLoading, setBulkLoading] = useState(false)

  // Check if any filters are active
  const hasActiveFilters = boardFilter !== "all" || jobFilter !== "all" || ownerFilter !== "all" || sourceFilter !== "all" || fileTypeFilter !== "all" || submitterSearch !== ""

  // Fetch boards for filter
  useEffect(() => {
    const fetchBoards = async () => {
      try {
        const response = await fetch("/api/boards?status=OPEN,CLOSED", { credentials: "include" })
        if (response.ok) {
          const data = await response.json()
          setBoards(data.boards || [])
        }
      } catch (err) {
        console.error("Error fetching boards:", err)
      }
    }
    fetchBoards()
  }, [])

  // Fetch all items across all jobs
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams()
      if (boardFilter !== "all") params.set("boardId", boardFilter)
      if (jobFilter !== "all") params.set("jobId", jobFilter)
      if (ownerFilter !== "all") params.set("ownerId", ownerFilter)
      if (sourceFilter !== "all") params.set("source", sourceFilter)
      if (fileTypeFilter !== "all") params.set("fileType", fileTypeFilter)
      if (submitterSearch) params.set("submitter", submitterSearch)
      
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
      setPdfCount(data.pdfCount || 0)
      setJobs(data.jobs || [])
      setOwners(data.owners || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [boardFilter, jobFilter, ownerFilter, sourceFilter, fileTypeFilter, submitterSearch])

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

  // Clear all filters
  const clearFilters = () => {
    setBoardFilter("all")
    setJobFilter("all")
    setOwnerFilter("all")
    setSourceFilter("all")
    setFileTypeFilter("all")
    setSubmitterSearch("")
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-gray-900">{total}</div>
            <div className="text-sm text-gray-500">Total Attachments</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-700">{pdfCount}</div>
            <div className="text-sm text-red-600">PDF Documents</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="space-y-3 mb-4">
        {/* First row - Main filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Board Filter */}
          {boards.length > 0 && (
            <Select value={boardFilter} onValueChange={setBoardFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Boards" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Boards</SelectItem>
                {boards.map(board => (
                  <SelectItem key={board.id} value={board.id}>
                    {board.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Task Filter */}
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="w-[180px]">
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

          {/* Owner Filter */}
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {owners.map(owner => (
                <SelectItem key={owner.id} value={owner.id}>
                  {owner.name || owner.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* File Type Filter */}
          <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="File Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF Only</SelectItem>
              <SelectItem value="document">Documents</SelectItem>
              <SelectItem value="spreadsheet">Spreadsheets</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="all">All Types</SelectItem>
            </SelectContent>
          </Select>

          {/* Source Filter */}
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

          {/* Submitter Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search submitter..."
              value={submitterSearch}
              onChange={(e) => setSubmitterSearch(e.target.value)}
              className="pl-9 w-[180px]"
            />
          </div>

          <Button variant="ghost" size="sm" onClick={fetchItems}>
            <RefreshCw className="w-4 h-4" />
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500">
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Second row - Bulk actions and download tip */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-lg">
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

          {/* Download location tip */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Info className="w-3.5 h-3.5" />
            <span>Tip: Change your browser settings to &quot;Ask where to save&quot; for more control over downloads</span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      {items.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {hasActiveFilters ? "No matching attachments" : "No attachments collected yet"}
          </h3>
          <p className="text-gray-500 mb-4">
            {hasActiveFilters 
              ? "Try adjusting your filters to see more results."
              : "Attachments will appear here when stakeholders reply to your requests with files."
            }
          </p>
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
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
