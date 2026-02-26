"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
  Search, X
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import Link from "next/link"
import { useRouter } from "next/navigation"

// Types
interface CollectedItem {
  id: string
  jobId: string
  filename: string
  fileKey: string
  fileUrl: string | null
  fileSize: number | null
  mimeType: string | null
  source: "EMAIL_REPLY" | "MANUAL_UPLOAD" | "FORM_SUBMISSION"
  submittedBy: string | null
  submittedByName: string | null
  receivedAt: string
  job?: {
    id: string
    name: string
    ownerId?: string
    boardId?: string
    board?: {
      id: string
      name: string
    }
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
      companyName: string | null
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

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="w-5 h-5 text-gray-400" />
  if (mimeType.startsWith("image/")) return <FileImage className="w-5 h-5 text-blue-500" />
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return <FileSpreadsheet className="w-5 h-5 text-green-500" />
  if (mimeType.includes("pdf")) return <FileText className="w-5 h-5 text-red-500" />
  if (mimeType.includes("zip") || mimeType.includes("archive")) return <Archive className="w-5 h-5 text-yellow-500" />
  return <File className="w-5 h-5 text-gray-400" />
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface BoardDocumentsTabProps {
  boardId: string
}

export function BoardDocumentsTab({ boardId }: BoardDocumentsTabProps) {
  const router = useRouter()

  // State
  const [items, setItems] = useState<CollectedItem[]>([])
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters (no board filter — implicit via boardId prop)
  const [jobFilter, setJobFilter] = useState<string>("all")
  const [submitterSearch, setSubmitterSearch] = useState<string>("")

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)

  const hasActiveFilters = jobFilter !== "all" || submitterSearch !== ""

  // AbortController ref for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null)

  // Fetch items for this board
  const fetchItems = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.set("boardId", boardId)
      if (jobFilter !== "all") params.set("jobId", jobFilter)
      if (submitterSearch) params.set("submitter", submitterSearch)

      console.log("[DocumentsTab] fetchItems start", { boardId, jobFilter, submitterSearch })
      const response = await fetch(
        `/api/collection?${params.toString()}`,
        { credentials: "include", signal }
      )

      if (!response.ok) {
        const data = await response.json()
        console.error("[DocumentsTab] fetchItems failed", { status: response.status, error: data.error })
        throw new Error(data.error || "Failed to fetch collection")
      }

      if (signal?.aborted) return

      const data = await response.json()
      console.log("[DocumentsTab] fetchItems success", { itemCount: data.items?.length, jobCount: data.jobs?.length })
      setItems(data.items || [])
      setJobs(data.jobs || [])
    } catch (err: any) {
      if (err.name === "AbortError") return
      console.error("[DocumentsTab] fetchItems error:", err.message)
      setError(err.message)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [boardId, jobFilter, submitterSearch])

  // Fetch with AbortController — cancels previous in-flight request on re-fetch
  useEffect(() => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    fetchItems(controller.signal)
    return () => controller.abort()
  }, [fetchItems])

  const handleDownload = async (item: CollectedItem) => {
    try {
      const response = await fetch(
        `/api/collection/download/${item.id}`,
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

  const handleBulkDownload = async () => {
    if (selectedIds.length === 0) return
    setBulkLoading(true)
    try {
      for (const id of selectedIds) {
        const item = items.find(i => i.id === id)
        if (item) {
          await handleDownload(item)
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

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(items.map(i => i.id))
    }
  }

  const clearFilters = () => {
    setJobFilter("all")
    setSubmitterSearch("")
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
        <Button variant="outline" onClick={() => {
          abortControllerRef.current?.abort()
          const controller = new AbortController()
          abortControllerRef.current = controller
          fetchItems(controller.signal)
        }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Task Filter */}
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Tasks" />
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

          {/* Submitter Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by email..."
              value={submitterSearch}
              onChange={(e) => setSubmitterSearch(e.target.value)}
              className="pl-9 w-[180px]"
            />
          </div>

          <Button variant="ghost" size="sm" onClick={() => {
            abortControllerRef.current?.abort()
            const controller = new AbortController()
            abortControllerRef.current = controller
            fetchItems(controller.signal)
          }}>
            <RefreshCw className="w-4 h-4" />
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500">
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

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
              Download All
            </Button>
          </div>
        )}
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
                <th className="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === items.length && items.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                <th className="w-16 px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">View</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Received By</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Submitted By</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="w-20 px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={(e) => {
                    const target = e.target as HTMLElement
                    if (target.closest('input, select, button, a')) return
                    if (item.message?.id) {
                      router.push(`/dashboard/review/${item.message.id}?tab=attachments&attachmentId=${item.id}`)
                    }
                  }}
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelection(item.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      {getFileIcon(item.mimeType)}
                      <div>
                        <div className="text-sm font-medium text-gray-900 truncate max-w-[180px]">
                          {item.filename}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatFileSize(item.fileSize)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      item.source === 'EMAIL_REPLY'
                        ? 'bg-blue-100 text-blue-700'
                        : item.source === 'FORM_SUBMISSION'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}>
                      {item.source === 'EMAIL_REPLY'
                        ? 'Email Reply'
                        : item.source === 'FORM_SUBMISSION'
                          ? 'Form'
                          : 'Manual'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {item.job ? (
                      <span className="text-sm text-gray-900">
                        {item.job.name}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {item.message?.id ? (
                      <Link
                        href={`/dashboard/review/${item.message.id}?tab=attachments`}
                        className="inline-flex items-center justify-center p-1.5 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                        title="View attachment in reply"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {item.job?.owner ? (
                      <div className="text-sm text-gray-600">
                        {item.job.owner.email}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-sm text-gray-900">
                      {item.submittedBy || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm text-gray-600">
                      {item.task?.entity?.companyName || "—"}
                    </span>
                    {item.submittedByName && (
                      <div className="text-xs text-gray-500">{item.submittedByName}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-sm text-gray-900">
                      {format(new Date(item.receivedAt), "MMM d, yyyy")}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(item.receivedAt), { addSuffix: true })}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        handleDownload(item)
                      }}
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
