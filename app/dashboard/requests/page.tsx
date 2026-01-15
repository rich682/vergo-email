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
  Pause, PlayCircle, MoreHorizontal, Search, X, Calendar
} from "lucide-react"
import { formatDistanceToNow, format, isAfter, isBefore, parseISO } from "date-fns"
import Link from "next/link"

// Types
interface RequestTask {
  id: string
  campaignName: string | null
  status: string
  createdAt: string
  updatedAt: string
  remindersEnabled: boolean
  remindersFrequencyHours: number | null
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

// Status options for the dropdown
const STATUS_OPTIONS = [
  { value: "AWAITING_RESPONSE", label: "Awaiting", icon: Clock, color: "amber" },
  { value: "IN_PROGRESS", label: "In Progress", icon: PlayCircle, color: "blue" },
  { value: "FULFILLED", label: "Complete", icon: CheckCircle, color: "green" },
  { value: "REJECTED", label: "Rejected", icon: AlertCircle, color: "red" },
  { value: "ON_HOLD", label: "On Hold", icon: Pause, color: "gray" },
]

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const statusConfig = STATUS_OPTIONS.find(s => s.value === status)
  
  if (!statusConfig) {
    // Handle legacy statuses
    switch (status) {
      case "REPLIED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <MessageSquare className="w-3 h-3" />
            Replied
          </span>
        )
      case "HAS_ATTACHMENTS":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
            <Mail className="w-3 h-3" />
            Has Attachments
          </span>
        )
      case "FLAGGED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <AlertCircle className="w-3 h-3" />
            Flagged
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            <MoreHorizontal className="w-3 h-3" />
            {status}
          </span>
        )
    }
  }

  const Icon = statusConfig.icon
  const colorClasses = {
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    gray: "bg-gray-100 text-gray-700",
  }[statusConfig.color] || "bg-gray-100 text-gray-700"

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClasses}`}>
      <Icon className="w-3 h-3" />
      {statusConfig.label}
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
      <SelectTrigger className="w-[140px] h-8 text-xs">
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

export default function RequestsPage() {
  // State
  const [requests, setRequests] = useState<RequestTask[]>([])
  const [total, setTotal] = useState(0)
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [statusSummary, setStatusSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [jobFilter, setJobFilter] = useState<string>("all")
  const [ownerFilter, setOwnerFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [contactSearch, setContactSearch] = useState<string>("")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [hasReminders, setHasReminders] = useState<string>("all") // "all", "yes", "no"

  // Check if any filters are active
  const hasActiveFilters = jobFilter !== "all" || ownerFilter !== "all" || statusFilter !== "all" || 
    contactSearch !== "" || dateFrom !== "" || dateTo !== "" || hasReminders !== "all"

  // Fetch all requests
  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams()
      if (jobFilter !== "all") params.set("jobId", jobFilter)
      if (ownerFilter !== "all") params.set("ownerId", ownerFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      
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
      setStatusSummary(data.statusSummary || {})
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [jobFilter, ownerFilter, statusFilter, contactSearch, dateFrom, dateTo, hasReminders])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  // Clear all filters
  const clearFilters = () => {
    setJobFilter("all")
    setOwnerFilter("all")
    setStatusFilter("all")
    setContactSearch("")
    setDateFrom("")
    setDateTo("")
    setHasReminders("all")
  }

  // Calculate summary stats
  const awaitingCount = statusSummary["AWAITING_RESPONSE"] || 0
  const inProgressCount = statusSummary["IN_PROGRESS"] || 0
  const fulfilledCount = statusSummary["FULFILLED"] || 0
  const onHoldCount = statusSummary["ON_HOLD"] || 0

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
      <div className="grid grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-gray-900">{total}</div>
            <div className="text-sm text-gray-500">Total Requests</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-700">{awaitingCount}</div>
            <div className="text-sm text-amber-600">Awaiting</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-700">{inProgressCount}</div>
            <div className="text-sm text-blue-600">In Progress</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-700">{fulfilledCount}</div>
            <div className="text-sm text-green-600">Complete</div>
          </CardContent>
        </Card>
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-gray-700">{onHoldCount}</div>
            <div className="text-sm text-gray-600">On Hold</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="space-y-3 mb-4">
        {/* First row - Main filters */}
        <div className="flex items-center gap-2 flex-wrap">
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

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUS_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              <SelectItem value="REPLIED">Replied</SelectItem>
              <SelectItem value="HAS_ATTACHMENTS">Has Attachments</SelectItem>
            </SelectContent>
          </Select>

          {/* Reminders Filter */}
          <Select value={hasReminders} onValueChange={setHasReminders}>
            <SelectTrigger className="w-[140px]">
              <Bell className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Reminders" />
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
              className="pl-9 w-[160px]"
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
              {requests.map(request => (
                <tr key={request.id} className="hover:bg-gray-50">
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
                      <Link 
                        href={`/dashboard/jobs/${request.job.id}`}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      >
                        {request.job.name}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
