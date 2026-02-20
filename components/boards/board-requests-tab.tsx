"use client"

import { useState, useEffect, useCallback } from "react"
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
  Filter, RefreshCw, Mail, Clock,
  CheckCircle, MessageSquare, BookOpen,
  Search, X, Calendar, Tag, Paperclip, AlertTriangle, RotateCcw
} from "lucide-react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow, format, isAfter, isBefore, parseISO } from "date-fns"
import { usePermissions } from "@/components/permissions-context"

// Types
interface RequestTask {
  id: string
  campaignName: string | null
  requestType: string | null
  status: string
  createdAt: string
  updatedAt: string
  remindersEnabled: boolean
  remindersFrequencyHours: number | null
  readStatus: string | null
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
  _isFormRequest?: boolean
  _formRequestId?: string
  formStatus?: string
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

// Auto-derived status display for standard/data requests
const ALL_STATUS_DISPLAY: Record<string, { label: string; icon: any; bgColor: string; textColor: string }> = {
  NO_REPLY: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  REPLIED: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  READ: { label: "Read", icon: BookOpen, bgColor: "bg-purple-100", textColor: "text-purple-700" },
  SEND_FAILED: { label: "Failed", icon: AlertTriangle, bgColor: "bg-red-100", textColor: "text-red-700" },
  COMPLETE: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  AWAITING_RESPONSE: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  IN_PROGRESS: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  HAS_ATTACHMENTS: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  VERIFYING: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  FULFILLED: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  REJECTED: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  FLAGGED: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  MANUAL_REVIEW: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  ON_HOLD: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
}

const FORM_STATUS_DISPLAY: Record<string, { label: string; icon: any; bgColor: string; textColor: string }> = {
  PENDING:   { label: "Pending",   icon: Clock,          bgColor: "bg-amber-100",  textColor: "text-amber-700" },
  SUBMITTED: { label: "Submitted", icon: CheckCircle,    bgColor: "bg-green-100",  textColor: "text-green-700" },
  EXPIRED:   { label: "Expired",   icon: AlertTriangle,  bgColor: "bg-red-100",    textColor: "text-red-700" },
}

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

function getEffectiveStatus(status: string, readStatus: string | null): string {
  const repliedStatuses = ["REPLIED", "HAS_ATTACHMENTS", "VERIFYING"]
  if (repliedStatuses.includes(status) && readStatus === "read") {
    return "READ"
  }
  return status
}

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
        onRetry()
      } else {
        console.error("Retry failed:", data.error || data.message)
        alert(`Retry failed: ${data.message || data.error || "Unknown error"}`)
        onRetry()
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

function hasReply(status: string): boolean {
  return ["REPLIED", "HAS_ATTACHMENTS", "VERIFYING", "FULFILLED", "COMPLETE"].includes(status)
}

interface BoardRequestsTabProps {
  boardId: string
}

export function BoardRequestsTab({ boardId }: BoardRequestsTabProps) {
  const router = useRouter()
  const { can } = usePermissions()
  const canManageRequests = can("requests:manage")

  // State
  const [requests, setRequests] = useState<RequestTask[]>([])
  const [total, setTotal] = useState(0)
  const [replyMessageIds, setReplyMessageIds] = useState<Record<string, string>>({})
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [labels, setLabels] = useState<LabelOption[]>([])
  const [statusSummary, setStatusSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters (no board filter — implicit via boardId prop)
  const [jobFilter, setJobFilter] = useState<string>("all")
  const [ownerFilter, setOwnerFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [labelFilter, setLabelFilter] = useState<string>("all")
  const [contactSearch, setContactSearch] = useState<string>("")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [attachmentFilter, setAttachmentFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")

  const hasActiveFilters = jobFilter !== "all" || ownerFilter !== "all" || statusFilter !== "all" ||
    labelFilter !== "all" || contactSearch !== "" || dateFrom !== "" || dateTo !== "" || attachmentFilter !== "all" || typeFilter !== "all"

  // Fetch all requests for this board
  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const baseParams = new URLSearchParams()
      baseParams.set("boardId", boardId)
      if (jobFilter !== "all") baseParams.set("jobId", jobFilter)
      if (ownerFilter !== "all") baseParams.set("ownerId", ownerFilter)
      if (dateFrom) baseParams.set("dateFrom", dateFrom)
      if (dateTo) baseParams.set("dateTo", dateTo)

      const fetchStandardData = typeFilter !== "form"
      const fetchFormData = typeFilter !== "standard" && typeFilter !== "data"

      const requestsParams = new URLSearchParams(baseParams)
      if (typeFilter === "standard" || typeFilter === "data") {
        requestsParams.set("requestType", typeFilter)
      }
      if (fetchFormData && fetchStandardData) {
        requestsParams.set("excludeFormRequests", "true")
      }
      if (statusFilter !== "all" && statusFilter !== "READ") requestsParams.set("status", statusFilter)
      if (statusFilter === "READ") requestsParams.set("status", "REPLIED")
      if (labelFilter !== "all") requestsParams.set("labelId", labelFilter)
      if (attachmentFilter !== "all") requestsParams.set("hasAttachments", attachmentFilter)

      const formParams = new URLSearchParams(baseParams)
      if (contactSearch) formParams.set("contactSearch", contactSearch)
      if (statusFilter === "NO_REPLY") formParams.set("status", "PENDING")

      const promises: Promise<Response>[] = []
      if (fetchStandardData) {
        promises.push(fetch(`/api/requests?${requestsParams.toString()}`, { credentials: "include" }))
      }
      if (fetchFormData) {
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

      if (fetchFormData && responseIdx < responses.length) {
        const res = responses[responseIdx++]
        if (res.ok) {
          const formData = await res.json()
          const formRequests = formData.formRequests || []

          formRequestsNormalized = formRequests.map((fr: any) => ({
            id: `form-${fr.id}`,
            campaignName: fr.formDefinition?.name || "Form Request",
            requestType: "form" as const,
            status: fr.status === "SUBMITTED" ? "COMPLETE" : fr.status === "EXPIRED" ? "SEND_FAILED" : "NO_REPLY",
            formStatus: fr.status,
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

      let allRequests = [...emailRequests, ...formRequestsNormalized]

      if (statusFilter === "READ") {
        allRequests = allRequests.filter((r: RequestTask) => r.readStatus === "read")
      }

      if (contactSearch) {
        const searchLower = contactSearch.toLowerCase()
        allRequests = allRequests.filter((r: RequestTask) => {
          const name = `${r.entity?.firstName || ""} ${r.entity?.lastName || ""}`.toLowerCase()
          const email = (r.entity?.email || "").toLowerCase()
          return name.includes(searchLower) || email.includes(searchLower)
        })
      }

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

      allRequests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      setRequests(allRequests)
      setTotal(allRequests.length)
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
  }, [boardId, jobFilter, ownerFilter, statusFilter, labelFilter, contactSearch, dateFrom, dateTo, attachmentFilter, typeFilter])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  // Fetch message IDs for replied requests
  useEffect(() => {
    const fetchReplyMessageIds = async () => {
      const repliedRequests = requests.filter(r => hasReply(r.status) && !r._isFormRequest)
      if (repliedRequests.length === 0) return

      const messageIds: Record<string, string> = {}

      for (const request of repliedRequests) {
        if (replyMessageIds[request.id]) continue
        try {
          const response = await fetch(`/api/requests/detail/${request.id}/messages`, { credentials: "include" })
          if (response.ok) {
            const messages = await response.json()
            const inboundMessage = messages
              .filter((m: any) => m.direction === "INBOUND")
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
            if (inboundMessage) {
              messageIds[request.id] = inboundMessage.id
            }
          }
        } catch (err) {}
      }

      if (Object.keys(messageIds).length > 0) {
        setReplyMessageIds(prev => ({ ...prev, ...messageIds }))
      }
    }

    if (requests.length > 0) {
      fetchReplyMessageIds()
    }
  }, [requests])

  const clearFilters = () => {
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

  const handleOpenThread = (request: RequestTask) => {
    if (request._isFormRequest) {
      if (request.job?.id) {
        router.push(`/dashboard/jobs/${request.job.id}`)
      }
      return
    }

    const hasReplies = hasReply(request.status) || (request._count?.messages || 0) > 1
    const messageId = replyMessageIds[request.id]

    if (hasReplies && messageId) {
      router.push(`/dashboard/review/${messageId}`)
      return
    }

    if (hasReplies && !messageId) {
      fetch(`/api/requests/detail/${request.id}/messages`, { credentials: "include" })
        .then(res => res.json())
        .then(messages => {
          const inboundMessage = messages
            .filter((m: any) => m.direction === "INBOUND")
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
          if (inboundMessage) {
            router.push(`/dashboard/review/${inboundMessage.id}`)
          } else if (request.job?.id) {
            router.push(`/dashboard/jobs/${request.job.id}`)
          }
        })
        .catch(() => {
          if (request.job?.id) {
            router.push(`/dashboard/jobs/${request.job.id}`)
          }
        })
      return
    }

    if (request.job?.id) {
      router.push(`/dashboard/jobs/${request.job.id}`)
    }
  }

  if (loading && requests.length === 0) {
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
        <Button variant="outline" onClick={fetchRequests}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4">
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
              {requests.map(request => (
                <tr
                  key={request.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleOpenThread(request)}
                >
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
