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
  Filter, RefreshCw, Mail, ExternalLink, Clock, 
  CheckCircle, AlertCircle, MessageSquare, Bell,
  Pause, PlayCircle, Search, X, Calendar, Tag, Paperclip,
  MailOpen, Eye, EyeOff, FileSearch
} from "lucide-react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow, format, isAfter, isBefore, parseISO } from "date-fns"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

// Types
interface BoardOption {
  id: string
  name: string
}

interface RequestTask {
  id: string
  campaignName: string | null
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
  } | null
  job?: {
    id: string
    name: string
    ownerId: string
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

// Status options for the dropdown - No reply, Replied, Complete
const STATUS_OPTIONS = [
  { value: "NO_REPLY", label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  { value: "REPLIED", label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  { value: "COMPLETE", label: "Complete", icon: CheckCircle, bgColor: "bg-green-100", textColor: "text-green-700" },
]

// All possible statuses for display (including legacy ones for backward compatibility)
const ALL_STATUS_DISPLAY: Record<string, { label: string; icon: any; bgColor: string; textColor: string }> = {
  // New statuses
  NO_REPLY: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  REPLIED: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  COMPLETE: { label: "Complete", icon: CheckCircle, bgColor: "bg-green-100", textColor: "text-green-700" },
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

// Status badge component - cleaner display
function StatusBadge({ status }: { status: string }) {
  const config = ALL_STATUS_DISPLAY[status] || { 
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
  onStatusChange 
}: { 
  taskId: string
  currentStatus: string
  onStatusChange: () => void 
}) {
  const [updating, setUpdating] = useState(false)

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return
    
    setUpdating(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
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
      value={currentStatus} 
      onValueChange={handleStatusChange}
      disabled={updating}
    >
      <SelectTrigger className="w-[150px] h-8 text-xs border-0 bg-transparent p-0 hover:bg-gray-50 rounded-full">
        <SelectValue>
          <StatusBadge status={currentStatus} />
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

// Format reminder frequency
function formatReminderFrequency(hours: number | null): string {
  if (!hours) return "—"
  if (hours < 24) return `Every ${hours}h`
  const days = Math.round(hours / 24)
  return `Every ${days}d`
}

// Check if request has a reply based on status
function hasReply(status: string): boolean {
  return ["REPLIED", "HAS_ATTACHMENTS", "VERIFYING", "FULFILLED", "COMPLETE"].includes(status)
}

export default function RequestsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const boardIdFromUrl = searchParams.get("boardId")
  
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
  const [hasReminders, setHasReminders] = useState<string>("all")
  const [attachmentFilter, setAttachmentFilter] = useState<string>("all")


  // Check if any filters are active
  const hasActiveFilters = boardFilter !== "all" || jobFilter !== "all" || ownerFilter !== "all" || statusFilter !== "all" || 
    labelFilter !== "all" || contactSearch !== "" || dateFrom !== "" || dateTo !== "" || hasReminders !== "all" ||
    attachmentFilter !== "all"

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

  // Fetch all requests
  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams()
      if (boardFilter !== "all") params.set("boardId", boardFilter)
      if (jobFilter !== "all") params.set("jobId", jobFilter)
      if (ownerFilter !== "all") params.set("ownerId", ownerFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (labelFilter !== "all") params.set("labelId", labelFilter)
      if (attachmentFilter !== "all") params.set("hasAttachments", attachmentFilter)
      
      const response = await fetch(
        `/api/requests?${params.toString()}`,
        { credentials: "include" }
      )
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to fetch requests")
      }
      
      const data = await response.json()
      let filteredRequests = data.requests || []
      
      // Client-side filtering for contact search
      if (contactSearch) {
        const searchLower = contactSearch.toLowerCase()
        filteredRequests = filteredRequests.filter((r: RequestTask) => {
          const name = `${r.entity?.firstName || ""} ${r.entity?.lastName || ""}`.toLowerCase()
          const email = (r.entity?.email || "").toLowerCase()
          return name.includes(searchLower) || email.includes(searchLower)
        })
      }
      
      // Client-side filtering for date range
      if (dateFrom) {
        const fromDate = parseISO(dateFrom)
        filteredRequests = filteredRequests.filter((r: RequestTask) => 
          isAfter(parseISO(r.createdAt), fromDate) || format(parseISO(r.createdAt), 'yyyy-MM-dd') === dateFrom
        )
      }
      if (dateTo) {
        const toDate = parseISO(dateTo)
        filteredRequests = filteredRequests.filter((r: RequestTask) => 
          isBefore(parseISO(r.createdAt), toDate) || format(parseISO(r.createdAt), 'yyyy-MM-dd') === dateTo
        )
      }
      
      // Client-side filtering for reminders
      if (hasReminders === "yes") {
        filteredRequests = filteredRequests.filter((r: RequestTask) => r.remindersEnabled)
      } else if (hasReminders === "no") {
        filteredRequests = filteredRequests.filter((r: RequestTask) => !r.remindersEnabled)
      }
      
      setRequests(filteredRequests)
      setTotal(data.total || 0)
      setJobs(data.jobs || [])
      setOwners(data.owners || [])
      setLabels(data.labels || [])
      setStatusSummary(data.statusSummary || {})
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [boardFilter, jobFilter, ownerFilter, statusFilter, labelFilter, contactSearch, dateFrom, dateTo, hasReminders, attachmentFilter])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  // Fetch message IDs for replied requests (for Review button)
  useEffect(() => {
    const fetchReplyMessageIds = async () => {
      const repliedRequests = requests.filter(r => hasReply(r.status))
      if (repliedRequests.length === 0) return

      const messageIds: Record<string, string> = {}
      
      // Batch fetch - only get IDs we don't have yet
      for (const request of repliedRequests) {
        if (replyMessageIds[request.id]) continue
        
        try {
          const response = await fetch(`/api/tasks/${request.id}/messages`, {
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
    setHasReminders("all")
    setAttachmentFilter("all")
  }

  // Handle opening request - go directly to review page if replies exist
  const handleOpenThread = (request: RequestTask) => {
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
      fetch(`/api/tasks/${request.id}/messages`, { credentials: "include" })
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
            }
          }
        })
        .catch(() => {
          if (request.job?.id) {
            router.push(`/dashboard/jobs/${request.job.id}`)
          }
        })
      return
    }
    
    // No replies - go to job detail page
    if (request.job?.id) {
      router.push(`/dashboard/jobs/${request.job.id}`)
    }
  }


  // Get read status display
  const getReadStatusDisplay = (readStatus: string | null, messageCount: number) => {
    if (readStatus === "replied" || messageCount > 1) {
      return { icon: MessageSquare, label: "Replied", color: "text-green-600", bgColor: "bg-green-50" }
    }
    if (readStatus === "read") {
      return { icon: MailOpen, label: "Read", color: "text-blue-600", bgColor: "bg-blue-50" }
    }
    return { icon: Mail, label: "Unread", color: "text-gray-400", bgColor: "bg-gray-50" }
  }

  // Calculate summary stats - No reply, Replied, Complete
  const noReplyStatuses = ["NO_REPLY", "AWAITING_RESPONSE", "IN_PROGRESS", "FLAGGED", "MANUAL_REVIEW", "ON_HOLD"]
  const repliedStatuses = ["REPLIED", "HAS_ATTACHMENTS", "VERIFYING"]
  const completeStatuses = ["COMPLETE", "FULFILLED", "REJECTED"]
  
  const noReplyCount = Object.entries(statusSummary)
    .filter(([status]) => noReplyStatuses.includes(status))
    .reduce((sum, [, count]) => sum + count, 0)
  const repliedCount = Object.entries(statusSummary)
    .filter(([status]) => repliedStatuses.includes(status))
    .reduce((sum, [, count]) => sum + count, 0)
  const completeCount = Object.entries(statusSummary)
    .filter(([status]) => completeStatuses.includes(status))
    .reduce((sum, [, count]) => sum + count, 0)

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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Requests</h1>
        <p className="text-gray-500 mt-1">
          All requests sent to contacts across your tasks
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-gray-900">{total}</div>
            <div className="text-sm text-gray-500">Total Requests</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-700">{noReplyCount}</div>
            <div className="text-sm text-amber-600">No reply</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-700">{repliedCount}</div>
            <div className="text-sm text-blue-600">Replied</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-700">{completeCount}</div>
            <div className="text-sm text-green-600">Complete</div>
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
              <SelectItem value="COMPLETE">Complete</SelectItem>
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

          {/* Reminders Filter */}
          <Select value={hasReminders} onValueChange={setHasReminders}>
            <SelectTrigger className="w-[130px]">
              <Bell className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="yes">With Reminders</SelectItem>
              <SelectItem value="no">No Reminders</SelectItem>
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
        </div>

        {/* Second row - Date filters */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">Sent:</span>
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
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Request</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reminders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map(request => {
                const readDisplay = getReadStatusDisplay(request.readStatus, request._count?.messages || 0)
                const ReadIcon = readDisplay.icon
                return (
                <tr 
                  key={request.id} 
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleOpenThread(request)}
                >
                  {/* Indicators Column */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <span 
                        className={`p-1 rounded ${readDisplay.bgColor}`}
                        title={readDisplay.label}
                      >
                        <ReadIcon className={`w-3.5 h-3.5 ${readDisplay.color}`} />
                      </span>
                      {request.hasAttachments && (
                        <span 
                          className="p-1 rounded bg-purple-50"
                          title="Has attachments"
                        >
                          <Paperclip className="w-3.5 h-3.5 text-purple-600" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 truncate max-w-[200px]">
                      {request.campaignName || "Untitled Request"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {request.entity ? (
                      <div>
                        <div className="text-sm text-gray-900">
                          {request.entity.firstName} {request.entity.lastName || ""}
                        </div>
                        {request.entity.email && (
                          <div className="text-xs text-gray-500">{request.entity.email}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {request.job ? (
                      <div>
                        <Link 
                          href={`/dashboard/jobs/${request.job.id}`}
                          className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                        >
                          {request.job.name}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                        {/* Show labels if any */}
                        {request.job.jobLabels && request.job.jobLabels.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {request.job.jobLabels.slice(0, 2).map(label => (
                              <span 
                                key={label.id}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ 
                                  backgroundColor: `${label.color || "#6B7280"}20`,
                                  color: label.color || "#6B7280"
                                }}
                              >
                                {label.name}
                              </span>
                            ))}
                            {request.job.jobLabels.length > 2 && (
                              <span className="text-xs text-gray-400">
                                +{request.job.jobLabels.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {request.job?.owner ? (
                      <div className="text-sm text-gray-900">
                        {request.job.owner.name || request.job.owner.email}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusDropdown 
                      taskId={request.id}
                      currentStatus={request.status}
                      onStatusChange={fetchRequests}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">
                      {format(new Date(request.createdAt), "MMM d, yyyy")}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {request.remindersEnabled ? (
                      <span className="inline-flex items-center gap-1 text-sm text-gray-700">
                        <Bell className="w-3 h-3 text-amber-500" />
                        {formatReminderFrequency(request.remindersFrequencyHours)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Off</span>
                    )}
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
