"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Filter, RefreshCw, Mail, Clock, 
  CheckCircle, MessageSquare, BookOpen,
  Search, X, Calendar, Tag, Paperclip, AlertTriangle, RotateCcw
} from "lucide-react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow, format, isAfter, isBefore, parseISO } from "date-fns"
import { useSearchParams } from "next/navigation"
import { usePermissions } from "@/components/permissions-context"

// Types
interface BoardOption {
  id: string
  name: string
}

interface RequestTask {
  id: string
  campaignName: string | null
  requestType: string | null // "standard" | "data" | "form"
  status: string
  createdAt: string
  updatedAt: string
  remindersEnabled: boolean
  remindersFrequencyHours: number | null
  readStatus: string | null // unread | read | replied
  hasAttachments: boolean
  _count?: {
    messages: number
  }
  entity?: {
    id: string
    firstName: string
    lastName: string | null
    email: string | null
    companyName: string | null
  } | null
  job?: {
    id: string
    name: string
    ownerId: string
    boardId: string | null
    board?: {
      id: string
      name: string
    } | null
    owner?: {
      id: string
      name: string | null
      email: string
    }
    jobLabels?: Array<{
      id: string
      name: string
      color: string | null
    }>
  } | null
  // Form request specific fields (populated when row comes from form-requests API)
  _isFormRequest?: boolean
  _formRequestId?: string
  formStatus?: string // "PENDING" | "SUBMITTED" | "EXPIRED" - original form status
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

interface LabelOption {
  id: string
  name: string
  color: string | null
}

// Status options for the dropdown - No reply, Replied, Read, Complete
const STATUS_OPTIONS = [
  { value: "NO_REPLY", label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  { value: "REPLIED", label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  { value: "READ", label: "Read", icon: BookOpen, bgColor: "bg-purple-100", textColor: "text-purple-700" },
  { value: "COMPLETE", label: "Complete", icon: CheckCircle, bgColor: "bg-green-100", textColor: "text-green-700" },
]

// All possible statuses for display (including legacy ones for backward compatibility)
const ALL_STATUS_DISPLAY: Record<string, { label: string; icon: any; bgColor: string; textColor: string }> = {
  // New statuses
  NO_REPLY: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  REPLIED: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  READ: { label: "Read", icon: BookOpen, bgColor: "bg-purple-100", textColor: "text-purple-700" },
  COMPLETE: { label: "Complete", icon: CheckCircle, bgColor: "bg-green-100", textColor: "text-green-700" },
  SEND_FAILED: { label: "Failed", icon: AlertTriangle, bgColor: "bg-red-100", textColor: "text-red-700" },
  // Legacy statuses (mapped to new display)
  AWAITING_RESPONSE: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  IN_PROGRESS: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  HAS_ATTACHMENTS: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  VERIFYING: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  FULFILLED: { label: "Complete", icon: CheckCircle, bgColor: "bg-green-100", textColor: "text-green-700" },
  REJECTED: { label: "Complete", icon: CheckCircle, bgColor: "bg-green-100", textColor: "text-green-700" },
  FLAGGED: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  MANUAL_REVIEW: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  ON_HOLD: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
}

// Form request statuses (read-only, not manually editable)
const FORM_STATUS_DISPLAY: Record<string, { label: string; icon: any; bgColor: string; textColor: string }> = {
  PENDING:   { label: "Pending",   icon: Clock,          bgColor: "bg-amber-100",  textColor: "text-amber-700" },
  SUBMITTED: { label: "Submitted", icon: CheckCircle,    bgColor: "bg-green-100",  textColor: "text-green-700" },
  EXPIRED:   { label: "Expired",   icon: AlertTriangle,  bgColor: "bg-red-100",    textColor: "text-red-700" },
}

// Form status badge component (read-only)
function FormStatusBadge({ status }: { status: string }) {
  const config = FORM_STATUS_DISPLAY[status] || {
    label: status,
    icon: Clock,
    bgColor: "bg-gray-100",
    textColor: "text-gray-700"
  }
  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

/**
 * Get the effective display status for a request.
 * If the DB status is REPLIED but readStatus is "read", show as READ.
 */
function getEffectiveStatus(status: string, readStatus: string | null): string {
  const repliedStatuses = ["REPLIED", "HAS_ATTACHMENTS", "VERIFYING"]
  if (repliedStatuses.includes(status) && readStatus === "read") {
    return "READ"
  }
  return status
}

// Status badge component - cleaner display
function StatusBadge({ status, readStatus }: { status: string; readStatus?: string | null }) {
  const effectiveStatus = getEffectiveStatus(status, readStatus ?? null)
  const config = ALL_STATUS_DISPLAY[effectiveStatus] || { 
    label: status, 
    icon: Clock, 
    bgColor: "bg-gray-100", 
    textColor: "text-gray-700" 
  }
  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

// Status dropdown for changing status
function StatusDropdown({ 
  taskId, 
  currentStatus,
  readStatus,
  onStatusChange 
}: { 
  taskId: string
  currentStatus: string
  readStatus?: string | null
  onStatusChange: () => void 
}) {
  const [updating, setUpdating] = useState(false)
  const effectiveStatus = getEffectiveStatus(currentStatus, readStatus ?? null)

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === effectiveStatus) return
    
    setUpdating(true)
    try {
      const response = await fetch(`/api/requests/detail/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus })
      })
      
      if (!response.ok) {
        throw new Error("Failed to update status")
      }
      
      onStatusChange()
    } catch (err) {
      console.error("Error updating status:", err)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Select 
      value={effectiveStatus} 
      onValueChange={handleStatusChange}
      disabled={updating}
    >
      <SelectTrigger className="w-[150px] h-8 text-xs border-0 bg-transparent p-0 hover:bg-gray-50 rounded-full">
        <SelectValue>
          <StatusBadge status={currentStatus} readStatus={readStatus} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map(option => {
          const Icon = option.icon
          return (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center gap-2">
                <Icon className="w-3 h-3" />
                {option.label}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

// Retry button for failed requests
function RetryButton({ requestId, onRetry }: { requestId: string; onRetry: () => void }) {
  const [retrying, setRetrying] = useState(false)

  const handleRetry = async () => {
    setRetrying(true)
    try {
      const response = await fetch(`/api/requests/detail/${requestId}/retry`, {
        method: "POST",
        credentials: "include",
      })
      const data = await response.json()
      if (response.ok && data.success) {
        onRetry() // Refresh the list
      } else {
        console.error("Retry failed:", data.error || data.message)
        alert(`Retry failed: ${data.message || data.error || "Unknown error"}`)
        onRetry() // Refresh anyway to show updated error
      }
    } catch (err) {
      console.error("Retry error:", err)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <button
      onClick={handleRetry}
      disabled={retrying}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-full border border-orange-200 transition-colors disabled:opacity-50"
      title="Retry sending this email"
    >
      <RotateCcw className={`w-3 h-3 ${retrying ? "animate-spin" : ""}`} />
      {retrying ? "Retrying..." : "Retry"}
    </button>
  )
}

// Check if request has a reply based on status
function hasReply(status: string): boolean {
  return ["REPLIED", "HAS_ATTACHMENTS", "VERIFYING", "FULFILLED", "COMPLETE"].includes(status)
}

export default function RequestsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const boardIdFromUrl = searchParams.get("boardId")
  const { can } = usePermissions()
  const canManageRequests = can("requests:manage")
  
  // State
  const [requests, setRequests] = useState<RequestTask[]>([])
  const [total, setTotal] = useState(0)
  const [replyMessageIds, setReplyMessageIds] = useState<Record<string, string>>({})
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [labels, setLabels] = useState<LabelOption[]>([])
  const [boards, setBoards] = useState<BoardOption[]>([])
  const [statusSummary, setStatusSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [boardFilter, setBoardFilter] = useState<string>(boardIdFromUrl || "all")
  const [jobFilter, setJobFilter] = useState<string>("all")
  const [ownerFilter, setOwnerFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [labelFilter, setLabelFilter] = useState<string>("all")
  const [contactSearch, setContactSearch] = useState<string>("")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [attachmentFilter, setAttachmentFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")


  // Check if any filters are active
  const hasActiveFilters = boardFilter !== "all" || jobFilter !== "all" || ownerFilter !== "all" || statusFilter !== "all" ||
    labelFilter !== "all" || contactSearch !== "" || dateFrom !== "" || dateTo !== "" || attachmentFilter !== "all" || typeFilter !== "all"

  // Fetch boards for filter
  useEffect(() => {
    const fetchBoards = async () => {
      try {
        // Fetch all active boards (exclude only ARCHIVED)
        const response = await fetch("/api/boards?status=NOT_STARTED,IN_PROGRESS,COMPLETE,BLOCKED,OPEN,CLOSED", { credentials: "include" })
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

  // Fetch all requests (standard/data from /api/requests + form from /api/form-requests/list)
  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Build shared filter params
      const baseParams = new URLSearchParams()
      if (boardFilter !== "all") baseParams.set("boardId", boardFilter)
      if (jobFilter !== "all") baseParams.set("jobId", jobFilter)
      if (ownerFilter !== "all") baseParams.set("ownerId", ownerFilter)
      if (dateFrom) baseParams.set("dateFrom", dateFrom)
      if (dateTo) baseParams.set("dateTo", dateTo)

      // Determine which APIs to call based on type filter
      const fetchStandardData = typeFilter !== "form"
      const fetchFormData = typeFilter !== "standard" && typeFilter !== "data"

      // Build requests API params
      const requestsParams = new URLSearchParams(baseParams)
      if (typeFilter === "standard" || typeFilter === "data") {
        requestsParams.set("requestType", typeFilter)
      }
      // Exclude form-type from requests API when also fetching from form-requests API
      if (fetchFormData && fetchStandardData) {
        requestsParams.set("excludeFormRequests", "true")
      }
      // For READ filter, fetch REPLIED from server and filter client-side
      if (statusFilter !== "all" && statusFilter !== "READ") requestsParams.set("status", statusFilter)
      if (statusFilter === "READ") requestsParams.set("status", "REPLIED")
      if (labelFilter !== "all") requestsParams.set("labelId", labelFilter)
      if (attachmentFilter !== "all") requestsParams.set("hasAttachments", attachmentFilter)

      // Build form-requests API params
      const formParams = new URLSearchParams(baseParams)
      if (contactSearch) formParams.set("contactSearch", contactSearch)
      // Map status filter to form statuses
      if (statusFilter === "NO_REPLY") formParams.set("status", "PENDING")
      else if (statusFilter === "COMPLETE") formParams.set("status", "SUBMITTED")

      // Fetch in parallel
      const promises: Promise<Response>[] = []
      if (fetchStandardData) {
        promises.push(fetch(`/api/requests?${requestsParams.toString()}`, { credentials: "include" }))
      }
      if (fetchFormData) {
        // Skip form fetch for statuses that don't apply to forms (REPLIED, READ)
        const skipFormFetch = statusFilter === "REPLIED" || statusFilter === "READ"
        if (!skipFormFetch) {
          promises.push(fetch(`/api/form-requests/list?${formParams.toString()}`, { credentials: "include" }))
        }
      }

      const responses = await Promise.all(promises)

      let emailRequests: RequestTask[] = []
      let formRequestsNormalized: RequestTask[] = []
      let apiJobs: JobOption[] = []
      let apiOwners: OwnerOption[] = []
      let apiLabels: LabelOption[] = []
      let apiStatusSummary: Record<string, number> = {}

      let responseIdx = 0

      // Parse standard/data requests response
      if (fetchStandardData) {
        const res = responses[responseIdx++]
        if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.error || "Failed to fetch requests")
        }
        const data = await res.json()
        emailRequests = data.requests || []
        apiJobs = data.jobs || []
        apiOwners = data.owners || []
        apiLabels = data.labels || []
        apiStatusSummary = data.statusSummary || {}
      }

      // Parse form requests response
      if (fetchFormData && responseIdx < responses.length) {
        const res = responses[responseIdx++]
        if (res.ok) {
          const formData = await res.json()
          const formRequests = formData.formRequests || []

          // Normalize FormRequest rows to match RequestTask shape
          formRequestsNormalized = formRequests.map((fr: any) => ({
            id: `form-${fr.id}`,
            campaignName: fr.formDefinition?.name || "Form Request",
            requestType: "form" as const,
            status: fr.status === "SUBMITTED" ? "COMPLETE" : fr.status === "EXPIRED" ? "SEND_FAILED" : "NO_REPLY",
            formStatus: fr.status, // Keep original for display
            createdAt: fr.createdAt,
            updatedAt: fr.updatedAt || fr.createdAt,
            remindersEnabled: fr.remindersEnabled || false,
            remindersFrequencyHours: null,
            readStatus: null,
            hasAttachments: (fr._count?.attachments || 0) > 0,
            _count: { messages: 0 },
            entity: fr.recipientEntity ? {
              id: fr.recipientEntity.id,
              firstName: fr.recipientEntity.firstName,
              lastName: fr.recipientEntity.lastName,
              email: fr.recipientEntity.email,
              companyName: fr.recipientEntity.companyName,
            } : fr.recipientUser ? {
              id: fr.recipientUser.id,
              firstName: fr.recipientUser.name?.split(' ')[0] || fr.recipientUser.email,
              lastName: fr.recipientUser.name?.split(' ').slice(1).join(' ') || null,
              email: fr.recipientUser.email,
              companyName: null,
            } : null,
            job: fr.taskInstance ? {
              id: fr.taskInstance.id,
              name: fr.taskInstance.name,
              ownerId: fr.taskInstance.ownerId,
              boardId: fr.taskInstance.boardId,
              board: fr.taskInstance.board,
              owner: fr.taskInstance.owner,
              jobLabels: fr.taskInstance.taskInstanceLabels,
            } : null,
            _isFormRequest: true,
            _formRequestId: fr.id,
          }))
        }
      }

      // Merge both datasets
      let allRequests = [...emailRequests, ...formRequestsNormalized]

      // Client-side filtering for READ status (readStatus === "read" within REPLIED)
      if (statusFilter === "READ") {
        allRequests = allRequests.filter((r: RequestTask) => r.readStatus === "read")
      }

      // Client-side filtering for contact search
      if (contactSearch) {
        const searchLower = contactSearch.toLowerCase()
        allRequests = allRequests.filter((r: RequestTask) => {
          const name = `${r.entity?.firstName || ""} ${r.entity?.lastName || ""}`.toLowerCase()
          const email = (r.entity?.email || "").toLowerCase()
          return name.includes(searchLower) || email.includes(searchLower)
        })
      }

      // Client-side filtering for date range (for email requests; form requests filtered server-side)
      if (dateFrom) {
        const fromDate = parseISO(dateFrom)
        allRequests = allRequests.filter((r: RequestTask) =>
          isAfter(parseISO(r.createdAt), fromDate) || format(parseISO(r.createdAt), 'yyyy-MM-dd') === dateFrom
        )
      }
      if (dateTo) {
        const toDate = parseISO(dateTo)
        allRequests = allRequests.filter((r: RequestTask) =>
          isBefore(parseISO(r.createdAt), toDate) || format(parseISO(r.createdAt), 'yyyy-MM-dd') === dateTo
        )
      }

      // Sort merged results by date descending
      allRequests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      setRequests(allRequests)
      setTotal(allRequests.length)
      // Only update filter dropdowns when we fetched from the requests API (which provides them)
      if (fetchStandardData) {
        setJobs(apiJobs)
        setOwners(apiOwners)
        setLabels(apiLabels)
        setStatusSummary(apiStatusSummary)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [boardFilter, jobFilter, ownerFilter, statusFilter, labelFilter, contactSearch, dateFrom, dateTo, attachmentFilter, typeFilter])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  // Fetch message IDs for replied requests (for Review button) - skip form requests
  useEffect(() => {
    const fetchReplyMessageIds = async () => {
      const repliedRequests = requests.filter(r => hasReply(r.status) && !r._isFormRequest)
      if (repliedRequests.length === 0) return

      const messageIds: Record<string, string> = {}
      
      // Batch fetch - only get IDs we don't have yet
      for (const request of repliedRequests) {
        if (replyMessageIds[request.id]) continue
        
        try {
          const response = await fetch(`/api/requests/detail/${request.id}/messages`, {
            credentials: "include"
          })
          if (response.ok) {
            const messages = await response.json()
            const inboundMessage = messages
              .filter((m: any) => m.direction === "INBOUND")
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
            if (inboundMessage) {
              messageIds[request.id] = inboundMessage.id
            }
          }
        } catch (err) {
          // Silently fail - Review button just won't show
        }
      }
      
      if (Object.keys(messageIds).length > 0) {
        setReplyMessageIds(prev => ({ ...prev, ...messageIds }))
      }
    }

    if (requests.length > 0) {
      fetchReplyMessageIds()
    }
  }, [requests])

  // Clear all filters
  const clearFilters = () => {
    setBoardFilter("all")
    setJobFilter("all")
    setOwnerFilter("all")
    setStatusFilter("all")
    setLabelFilter("all")
    setContactSearch("")
    setDateFrom("")
    setDateTo("")
    setAttachmentFilter("all")
    setTypeFilter("all")
  }

  // Handle opening request - go directly to review page if replies exist
  const handleOpenThread = (request: RequestTask) => {
    // Form requests: navigate to task page
    if (request._isFormRequest) {
      if (request.job?.id) {
        router.push(`/dashboard/jobs/${request.job.id}`)
      }
      return
    }

    const hasReplies = hasReply(request.status) || (request._count?.messages || 0) > 1
    const messageId = replyMessageIds[request.id]

    // If request has replies and we have the message ID, go to review page
    if (hasReplies && messageId) {
      router.push(`/dashboard/review/${messageId}`)
      return
    }

    // If request has replies but we're still loading message ID, fetch and navigate
    if (hasReplies && !messageId) {
      // Fetch the message ID and navigate
      fetch(`/api/requests/detail/${request.id}/messages`, { credentials: "include" })
        .then(res => res.json())
        .then(messages => {
          const inboundMessage = messages
            .filter((m: any) => m.direction === "INBOUND")
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
          if (inboundMessage) {
            router.push(`/dashboard/review/${inboundMessage.id}`)
          } else {
            // Fallback to job page
            if (request.job?.id) {
              router.push(`/dashboard/jobs/${request.job.id}`)
            } else {
              alert("This request is not associated with a task.")
            }
          }
        })
        .catch(() => {
          if (request.job?.id) {
            router.push(`/dashboard/jobs/${request.job.id}`)
          } else {
            alert("This request is not associated with a task.")
          }
        })
      return
    }

    // No replies - go to job detail page
    if (request.job?.id) {
      router.push(`/dashboard/jobs/${request.job.id}`)
    } else {
      alert("This request is not associated with a task.")
    }
  }


  // Calculate summary stats - No reply, Replied, Read, Complete
  // Use client-side data to properly split Replied vs Read based on readStatus
  const noReplyStatuses = ["NO_REPLY", "AWAITING_RESPONSE", "IN_PROGRESS", "FLAGGED", "MANUAL_REVIEW", "ON_HOLD"]
  const repliedStatuses = ["REPLIED", "HAS_ATTACHMENTS", "VERIFYING"]
  const completeStatuses = ["COMPLETE", "FULFILLED", "REJECTED"]

  // Form requests: PENDING counts as "no reply", SUBMITTED as "complete", EXPIRED as "failed"
  const noReplyCount = requests.filter(r => noReplyStatuses.includes(r.status) || r.formStatus === "PENDING").length
  const repliedCount = requests.filter(r => repliedStatuses.includes(r.status) && r.readStatus !== "read" && !r._isFormRequest).length
  const readCount = requests.filter(r => repliedStatuses.includes(r.status) && r.readStatus === "read" && !r._isFormRequest).length
  const completeCount = requests.filter(r => completeStatuses.includes(r.status) || r.formStatus === "SUBMITTED").length

  if (loading && requests.length === 0) {
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
          <Button variant="outline" onClick={fetchRequests}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Toolbar */}
      <div className="mb-4">
        {/* Filters - single row with wrap */}
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

          {/* Task Filter - Only shows tasks with requests */}
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

          {/* Owner Filter */}
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Owners" />
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

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="NO_REPLY">No reply</SelectItem>
              <SelectItem value="REPLIED">Replied</SelectItem>
              <SelectItem value="READ">Read</SelectItem>
              <SelectItem value="COMPLETE">Complete</SelectItem>
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="data">Data</SelectItem>
              <SelectItem value="form">Form</SelectItem>
            </SelectContent>
          </Select>

          {/* Labels Filter */}
          {labels.length > 0 && (
            <Select value={labelFilter} onValueChange={setLabelFilter}>
              <SelectTrigger className="w-[140px]">
                <Tag className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Labels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Labels</SelectItem>
                {labels.map(label => (
                  <SelectItem key={label.id} value={label.id}>
                    <span className="flex items-center gap-2">
                      <span 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: label.color || "#6B7280" }}
                      />
                      {label.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}


          {/* Attachment Filter */}
          <Select value={attachmentFilter} onValueChange={setAttachmentFilter}>
            <SelectTrigger className="w-[150px]">
              <Paperclip className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="yes">Has Attachments</SelectItem>
              <SelectItem value="no">No Attachments</SelectItem>
            </SelectContent>
          </Select>

          {/* Contact Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search contact..."
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              className="pl-9 w-[150px]"
            />
          </div>

          <Button variant="ghost" size="sm" onClick={fetchRequests}>
            <RefreshCw className="w-4 h-4" />
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500">
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}

          {/* Date filters */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500 whitespace-nowrap">Sent:</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[140px] h-8 text-sm"
              placeholder="From"
            />
            <span className="text-gray-400">—</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[140px] h-8 text-sm"
              placeholder="To"
            />
          </div>
        </div>
      </div>

      {/* Requests Table */}
      {requests.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {hasActiveFilters ? "No matching requests" : "No requests found"}
          </h3>
          <p className="text-gray-500 mb-4">
            {hasActiveFilters 
              ? "Try adjusting your filters to see more results."
              : "Requests will appear here when you send them from your tasks."
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
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Board</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Attachments</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map(request => {
                return (
                <tr 
                  key={request.id} 
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleOpenThread(request)}
                >
                  <td className="px-4 py-2">
                    <span className="text-sm text-gray-600 truncate max-w-[150px] block">
                      {request.job?.board?.name || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm text-gray-900 truncate max-w-[180px] block">
                      {request.job?.name || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-sm text-gray-900 truncate max-w-[200px]">
                      {request.campaignName || "Untitled"}
                    </div>
                  </td>

                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      request.requestType === 'data' 
                        ? 'bg-purple-100 text-purple-700' 
                        : request.requestType === 'form'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}>
                      {request.requestType === 'data' 
                        ? 'Data' 
                        : request.requestType === 'form' 
                          ? 'Form' 
                          : 'Standard'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {request.entity ? (
                      <div>
                        <span className="text-sm text-gray-900">
                          {request.entity.firstName} {request.entity.lastName || ""}
                        </span>
                        {request.entity.email && (
                          <span className="text-xs text-gray-400 ml-1">({request.entity.email})</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm text-gray-600">
                      {request.entity?.companyName || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {request.job?.owner ? (
                      <span className="text-sm text-gray-900">
                        {request.job.owner.name || request.job.owner.email}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {request._isFormRequest && request.formStatus ? (
                        <FormStatusBadge status={request.formStatus} />
                      ) : canManageRequests ? (
                        <StatusDropdown
                          taskId={request.id}
                          currentStatus={request.status}
                          readStatus={request.readStatus}
                          onStatusChange={fetchRequests}
                        />
                      ) : (
                        <StatusBadge status={request.status} readStatus={request.readStatus} />
                      )}
                      {canManageRequests && request.status === "SEND_FAILED" && !request._isFormRequest && (
                        <RetryButton requestId={request.id} onRetry={fetchRequests} />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {request.hasAttachments ? (
                      <span className="inline-flex items-center gap-1 text-sm text-purple-700">
                        <Paperclip className="w-3.5 h-3.5" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm text-gray-900">
                      {format(new Date(request.createdAt), "MMM d, yyyy")}
                    </span>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
