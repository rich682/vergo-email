"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { getRequestGrouping } from "@/lib/requestGrouping"
import { formatDistanceToNow, format } from "date-fns"
import { Plus, Filter, Check, X, Search } from "lucide-react"
import { getNewRequestRoute } from "@/components/nav-links"
import { NewRequestModal } from "@/components/requests/new-request-modal"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"

interface Task {
  id: string
  campaignName: string | null
  campaignType: string | null
  updatedAt: string
  createdAt: string
  hasAttachments: boolean
  aiVerified: boolean | null
  hasReplies: boolean
  latestInboundClassification?: string | null
  latestOutboundSubject?: string | null
  completionPercentage?: number | null
  readStatus?: string | null
  riskLevel?: "high" | "medium" | "low" | "unknown" | null
  riskReason?: string | null
  lastActivityAt?: string | null
  isManualRiskOverride?: boolean
  deadlineDate?: string | null
  remindersEnabled?: boolean
  entity?: {
    firstName: string
    email: string | null
  }
}

interface RequestGroup {
  groupKey: string
  displayName: string
  groupType: string
  tasks: Task[]
  totalCount: number
  doneCount: number
  repliedCount: number
  completionPercent: number
  isComplete: boolean
  highCount: number
  mediumCount: number
  lowCount: number
  unknownCount: number
  lastActivity: Date
  createdLatest: Date
  deadline: Date | null
  requestType: "recurring" | "one-off"
}

function isJobsUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JOBS_UI === "true"
}

const STATUS_OPTIONS = [
  { value: "complete", label: "Complete" },
  { value: "incomplete", label: "Incomplete" },
]

const TYPE_OPTIONS = [
  { value: "recurring", label: "Recurring" },
  { value: "one-off", label: "One-off" },
]

export default function RequestsPage() {
  const router = useRouter()
  const filterRef = useRef<HTMLDivElement>(null)
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [typeFilters, setTypeFilters] = useState<string[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [newRequestModalOpen, setNewRequestModalOpen] = useState(false)
  const [sortKey, setSortKey] = useState<"created" | "lastActivity" | "deadline" | "name">("created")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  // Close filter dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/tasks", {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })

      if (response.ok) {
        const data = await response.json()
        setAllTasks(Array.isArray(data) ? data : [])
      } else {
        if (response.status === 401) {
          window.location.href = '/auth/signin?callbackUrl=/dashboard/requests'
          return
        }
        setAllTasks([])
      }
    } catch (error: any) {
      console.error('[RequestsPage] Error fetching tasks:', error)
      setAllTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])
  useEffect(() => {
    const interval = setInterval(() => fetchTasks(), 30000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  const requestGroups = useMemo(() => {
    const groupMap = new Map<string, Task[]>()
    for (const task of allTasks) {
      const grouping = getRequestGrouping({
        campaignName: task.campaignName,
        campaignType: task.campaignType,
        id: task.id,
        latestOutboundSubject: task.latestOutboundSubject ?? null
      })
      
      if (!groupMap.has(grouping.groupKey)) {
        groupMap.set(grouping.groupKey, [])
      }
      groupMap.get(grouping.groupKey)!.push(task)
    }

    const groups: RequestGroup[] = []
    for (const [groupKey, tasks] of groupMap.entries()) {
      const grouping = getRequestGrouping({
        campaignName: tasks[0]?.campaignName ?? null,
        campaignType: tasks[0]?.campaignType ?? null,
        id: tasks[0]?.id ?? '',
        latestOutboundSubject: tasks[0]?.latestOutboundSubject ?? null
      })

      const totalCount = tasks.length
      const doneCount = tasks.filter(t => t.status === "FULFILLED").length
      const repliedCount = tasks.filter(t => (t.replyCount || 0) > 0).length
      const isComplete = totalCount > 0 && doneCount === totalCount
      const completionPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
      const activeTasks = tasks.filter(t => t.status !== "FULFILLED")
      const highCount = activeTasks.filter(t => t.riskLevel === "high").length
      const mediumCount = activeTasks.filter(t => t.riskLevel === "medium").length
      const lowCount = activeTasks.filter(t => t.riskLevel === "low").length
      const unknownCount = activeTasks.filter(t => !t.riskLevel || t.riskLevel === "unknown").length
      
      const lastActivity = tasks.reduce((latest, task) => {
        const taskDate = task.lastActivityAt 
          ? new Date(task.lastActivityAt)
          : new Date(task.updatedAt)
        return taskDate > latest ? taskDate : latest
      }, new Date(0))
      
      const createdLatest = tasks.reduce((latest, task) => {
        const taskDate = task.createdAt ? new Date(task.createdAt) : new Date(0)
        return taskDate > latest ? taskDate : latest
      }, new Date(0))
      
      const deadlineTask = tasks.find(t => t.deadlineDate)
      const deadline = deadlineTask?.deadlineDate ? new Date(deadlineTask.deadlineDate) : null
      const hasReminders = tasks.some(t => t.remindersEnabled)
      const requestType: "recurring" | "one-off" = hasReminders && !deadline ? "recurring" : "one-off"

      groups.push({
        groupKey: grouping.groupKey,
        displayName: grouping.displayName,
        groupType: grouping.groupType,
        tasks,
        totalCount,
        doneCount,
        repliedCount,
        completionPercent,
        isComplete,
        highCount,
        mediumCount,
        lowCount,
        unknownCount,
        lastActivity,
        createdLatest,
        deadline,
        requestType
      })
    }

    return groups
  }, [allTasks])

  const hasActiveFilters = statusFilters.length > 0 || typeFilters.length > 0

  const filteredSortedGroups = useMemo(() => {
    let filtered = requestGroups

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(g => g.displayName.toLowerCase().includes(query))
    }

    // Apply status filters
    if (statusFilters.length > 0) {
      filtered = filtered.filter(g => {
        if (statusFilters.includes("complete") && g.isComplete) return true
        if (statusFilters.includes("incomplete") && !g.isComplete) return true
        return false
      })
    }

    // Apply type filters
    if (typeFilters.length > 0) {
      filtered = filtered.filter(g => typeFilters.includes(g.requestType))
    }

    // Sort
    const sortValue = (g: RequestGroup) => {
      switch (sortKey) {
        case "name": return g.displayName?.toLowerCase() || ""
        case "deadline": return g.deadline ? g.deadline.getTime() : (sortDir === "asc" ? Infinity : -Infinity)
        case "lastActivity": return g.lastActivity.getTime()
        case "created":
        default: return g.createdLatest.getTime()
      }
    }

    return [...filtered].sort((a, b) => {
      const av = sortValue(a)
      const bv = sortValue(b)
      if (av === bv) return 0
      if (sortDir === "asc") return av > bv ? 1 : -1
      return av < bv ? 1 : -1
    })
  }, [requestGroups, searchQuery, statusFilters, typeFilters, sortKey, sortDir])

  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  const toggleTypeFilter = (type: string) => {
    setTypeFilters(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const clearAllFilters = () => {
    setStatusFilters([])
    setTypeFilters([])
    setSearchQuery("")
  }

  const removeFilter = (filterType: "status" | "type", value: string) => {
    if (filterType === "status") {
      setStatusFilters(prev => prev.filter(s => s !== value))
    } else {
      setTypeFilters(prev => prev.filter(t => t !== value))
    }
  }

  const handleRequestClick = (groupKey: string) => {
    const encodedKey = encodeURIComponent(groupKey)
    router.push(`/dashboard/requests/${encodedKey}`)
  }

  if (loading && allTasks.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        <div className="px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-4">
        {/* Action Row */}
        <div className="flex items-center justify-end mb-4">
          <button
            onClick={() => {
              if (isJobsUIEnabled()) {
                setNewRequestModalOpen(true)
              } else {
                router.push(getNewRequestRoute())
              }
            }}
            className="
              flex items-center gap-2 px-4 py-2 
              border border-gray-200 rounded-full
              text-sm font-medium text-gray-700
              hover:border-orange-500 hover:text-orange-500
              transition-colors
            "
          >
            <Plus className="w-4 h-4 text-orange-500" />
            New Request
          </button>
          
          <NewRequestModal 
            open={newRequestModalOpen} 
            onOpenChange={setNewRequestModalOpen} 
          />
        </div>

        {/* Search and Filter Row */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-lg">
            <Input
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-gray-200 rounded-full"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          
          <div className="relative" ref={filterRef}>
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`
                flex items-center gap-2 px-4 py-2
                border rounded-full
                text-sm font-medium
                transition-colors
                ${hasActiveFilters 
                  ? "border-gray-900 bg-gray-900 text-white" 
                  : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }
              `}
            >
              <Filter className="w-4 h-4" />
              Filter
              {hasActiveFilters && (
                <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs">
                  {statusFilters.length + typeFilters.length}
                </span>
              )}
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="p-3 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Status</p>
                  <div className="space-y-1">
                    {STATUS_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        onClick={() => toggleStatusFilter(option.value)}
                        className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-gray-50 text-sm text-left"
                      >
                        <span className="text-gray-700">{option.label}</span>
                        {statusFilters.includes(option.value) && (
                          <Check className="w-4 h-4 text-gray-900" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Type</p>
                  <div className="space-y-1">
                    {TYPE_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        onClick={() => toggleTypeFilter(option.value)}
                        className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-gray-50 text-sm text-left"
                      >
                        <span className="text-gray-700">{option.label}</span>
                        {typeFilters.includes(option.value) && (
                          <Check className="w-4 h-4 text-gray-900" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {hasActiveFilters && (
                  <div className="p-2">
                    <button
                      onClick={clearAllFilters}
                      className="w-full px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sort */}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as any)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
          >
            <option value="created">Date Created</option>
            <option value="lastActivity">Last Updated</option>
            <option value="deadline">Deadline</option>
            <option value="name">Name</option>
          </select>
          <button
            onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {statusFilters.map(status => (
              <button
                key={status}
                onClick={() => removeFilter("status", status)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors"
              >
                {STATUS_OPTIONS.find(s => s.value === status)?.label || status}
                <X className="w-3.5 h-3.5" />
              </button>
            ))}
            {typeFilters.map(type => (
              <button
                key={type}
                onClick={() => removeFilter("type", type)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors"
              >
                {TYPE_OPTIONS.find(t => t.value === type)?.label || type}
                <X className="w-3.5 h-3.5" />
              </button>
            ))}
            <button
              onClick={clearAllFilters}
              className="text-sm text-blue-600 hover:text-blue-700 ml-1"
            >
              Clear All
            </button>
          </div>
        )}

        {/* Content */}
        {filteredSortedGroups.length === 0 ? (
          requestGroups.length === 0 ? (
            <div className="border border-dashed border-gray-200 rounded-lg">
              <EmptyState
                icon={<Plus className="w-6 h-6" />}
                title="No requests yet"
                description="Create your first request to start tracking document collection and follow-ups"
                action={{
                  label: "Create Request",
                  onClick: () => {
                    if (isJobsUIEnabled()) {
                      setNewRequestModalOpen(true)
                    } else {
                      router.push(getNewRequestRoute())
                    }
                  }
                }}
              />
            </div>
          ) : (
            <div className="border border-dashed border-gray-200 rounded-lg">
              <EmptyState
                icon={<Filter className="w-6 h-6" />}
                title="No matching requests"
                description="Try adjusting your filters or search query"
                action={{
                  label: "Clear Filters",
                  onClick: clearAllFilters
                }}
              />
            </div>
          )
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-4">Request Name</div>
              <div className="col-span-1">Recipients</div>
              <div className="col-span-1">Progress</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-1">Deadline</div>
              <div className="col-span-1 text-center">Risk</div>
              <div className="col-span-2">Updated</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y divide-gray-100">
              {filteredSortedGroups.map((group) => (
                <div
                  key={group.groupKey}
                  onClick={() => handleRequestClick(group.groupKey)}
                  className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors items-center"
                >
                  {/* Name */}
                  <div className="col-span-4">
                    <span className="font-medium text-gray-900">{group.displayName}</span>
                    {group.groupType !== 'CUSTOM' && (
                      <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {group.groupType}
                      </span>
                    )}
                  </div>
                  
                  {/* Recipients */}
                  <div className="col-span-1 text-sm text-gray-600">
                    {group.totalCount}
                  </div>
                  
                  {/* Progress */}
                  <div className="col-span-1 text-sm text-gray-900">
                    {group.doneCount}/{group.totalCount}
                  </div>
                  
                  {/* Status */}
                  <div className="col-span-1">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                      group.isComplete 
                        ? "border-green-200 text-green-700 bg-green-50" 
                        : "border-gray-300 text-gray-700"
                    }`}>
                      {group.isComplete ? "Complete" : "Active"}
                    </span>
                  </div>
                  
                  {/* Type */}
                  <div className="col-span-1">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      group.requestType === "recurring" 
                        ? "bg-purple-100 text-purple-700" 
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {group.requestType === "recurring" ? "Recurring" : "One-off"}
                    </span>
                  </div>
                  
                  {/* Deadline */}
                  <div className="col-span-1 text-sm text-gray-600">
                    {group.deadline ? format(group.deadline, "MMM d") : "—"}
                  </div>
                  
                  {/* Risk */}
                  <div className="col-span-1 flex items-center justify-center gap-1">
                    {group.highCount > 0 && (
                      <span className="text-xs font-medium text-red-600">{group.highCount}H</span>
                    )}
                    {group.mediumCount > 0 && (
                      <span className="text-xs font-medium text-amber-600">{group.mediumCount}M</span>
                    )}
                    {group.lowCount > 0 && (
                      <span className="text-xs font-medium text-green-600">{group.lowCount}L</span>
                    )}
                    {group.highCount === 0 && group.mediumCount === 0 && group.lowCount === 0 && (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                  
                  {/* Updated */}
                  <div className="col-span-2 text-sm text-gray-500">
                    {formatDistanceToNow(group.lastActivity, { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
