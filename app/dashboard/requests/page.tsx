"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { getRequestGrouping } from "@/lib/requestGrouping"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { getNewRequestRoute } from "@/components/nav-links"

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
  // Risk fields
  readStatus?: string | null
  riskLevel?: "high" | "medium" | "low" | "unknown" | null
  riskReason?: string | null
  lastActivityAt?: string | null
  isManualRiskOverride?: boolean
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
  // Risk rollups
  highCount: number
  mediumCount: number
  lowCount: number
  unknownCount: number
  lastActivity: Date
  createdLatest: Date
}

export default function RequestsPage() {
  const router = useRouter()
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<"all" | "complete" | "incomplete">("all")
  const [replyFilter, setReplyFilter] = useState<"all" | "replied" | "unreplied">("all")
  const [sortKey, setSortKey] = useState<
    | "lastActivity"
    | "created"
    | "name"
    | "recipients"
    | "done"
    | "status"
    | "high"
    | "medium"
    | "low"
    | "replies"
  >("created")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/tasks", {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
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

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Set up polling interval
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTasks()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  // Compute task states and group them
  const requestGroups = useMemo(() => {
    // Group tasks by grouping key
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

    // Compute risk rollups for each group
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
      
      // Find latest activity (max lastActivityAt or updatedAt)
      const lastActivity = tasks.reduce((latest, task) => {
        const taskDate = task.lastActivityAt 
          ? new Date(task.lastActivityAt)
          : new Date(task.updatedAt)
        return taskDate > latest ? taskDate : latest
      }, new Date(0))
      // Find newest createdAt among grouped tasks
      const createdLatest = tasks.reduce((latest, task) => {
        const taskDate = task.createdAt ? new Date(task.createdAt) : new Date(0)
        return taskDate > latest ? taskDate : latest
      }, new Date(0))

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
        createdLatest
      })
    }

    return groups
  }, [allTasks])

  const filteredSortedGroups = useMemo(() => {
    const filtered = requestGroups.filter((g) => {
      if (statusFilter === "complete" && !g.isComplete) return false
      if (statusFilter === "incomplete" && g.isComplete) return false
      if (replyFilter === "replied" && g.repliedCount === 0) return false
      if (replyFilter === "unreplied" && g.repliedCount > 0) return false
      return true
    })

    const sortValue = (g: RequestGroup) => {
      switch (sortKey) {
        case "name":
          return g.displayName?.toLowerCase() || ""
        case "recipients":
          return g.totalCount
        case "done":
          return g.completionPercent
        case "status":
          return g.isComplete ? 1 : 0
        case "high":
          return g.highCount
        case "medium":
          return g.mediumCount
        case "low":
          return g.lowCount
        case "replies":
          return g.repliedCount / Math.max(1, g.totalCount)
        case "created":
          return g.createdLatest.getTime()
        case "lastActivity":
        default:
          return g.lastActivity.getTime()
      }
    }

    const sorted = [...filtered].sort((a, b) => {
      const av = sortValue(a)
      const bv = sortValue(b)
      if (av === bv) return 0
      if (sortDir === "asc") return av > bv ? 1 : -1
      return av < bv ? 1 : -1
    })

    return sorted
  }, [requestGroups, statusFilter, replyFilter, sortKey, sortDir])

  const completedRequests = useMemo(
    () => requestGroups.filter(g => g.isComplete).length,
    [requestGroups]
  )

  const handleRequestClick = (groupKey: string) => {
    const encodedKey = encodeURIComponent(groupKey)
    router.push(`/dashboard/requests/${encodedKey}`)
  }

  if (loading && allTasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Loading requests...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-[calc(100vh-8rem)] flex flex-col border-l border-r border-gray-200">
      <div className="flex-1 flex overflow-hidden relative bg-gray-50">
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">Requests</h2>
                <p className="text-sm text-gray-600">
                  {completedRequests}/{requestGroups.length} requests complete • {allTasks.length} total tasks
                </p>
              </div>
              <Button
                onClick={() => router.push(getNewRequestRoute())}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Request
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-white">
            {filteredSortedGroups.length === 0 ? (
              requestGroups.length === 0 ? (
                <div className="flex items-center justify-center min-h-[400px] p-6">
                  <div className="text-center max-w-lg">
                    <div className="mb-4 flex justify-center">
                      <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      </div>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Vergo</h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Get started in 3 easy steps to track document requests and follow-ups.
                    </p>
                    
                    {/* Getting Started Steps */}
                    <div className="text-left bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">1</div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Import your contacts</h4>
                          <p className="text-xs text-gray-600 mt-0.5">Upload a CSV or Excel file with your clients, vendors, or employees.</p>
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto text-blue-600"
                            onClick={() => router.push('/dashboard/contacts')}
                          >
                            Go to Contacts →
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">2</div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Create a request</h4>
                          <p className="text-xs text-gray-600 mt-0.5">Send personalized emails asking for W-9s, invoices, or any documents.</p>
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto text-blue-600"
                            onClick={() => router.push(getNewRequestRoute())}
                          >
                            Create Request →
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-sm font-medium">3</div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Track replies</h4>
                          <p className="text-xs text-gray-600 mt-0.5">See who has responded, who needs a reminder, and manage risk levels.</p>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={() => router.push(getNewRequestRoute())}
                      className="flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create Your First Request
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center min-h-[200px] p-6">
                  <div className="text-center max-w-md space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">No requests match the current filters</h3>
                    <p className="text-sm text-gray-600">Try adjusting filters or sorting.</p>
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setStatusFilter("all")
                          setReplyFilter("all")
                          setSortKey("created")
                          setSortDir("desc")
                        }}
                      >
                        Reset filters
                      </Button>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="overflow-x-auto">
                <div className="flex flex-wrap gap-3 px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Status</span>
                    <select
                      className="text-sm border rounded px-2 py-1"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                    >
                      <option value="all">All</option>
                      <option value="complete">Complete</option>
                      <option value="incomplete">Incomplete</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Replies</span>
                    <select
                      className="text-sm border rounded px-2 py-1"
                      value={replyFilter}
                      onChange={(e) => setReplyFilter(e.target.value as any)}
                    >
                      <option value="all">All</option>
                      <option value="replied">Replied</option>
                      <option value="unreplied">No replies</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Sort</span>
                    <select
                      className="text-sm border rounded px-2 py-1"
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as any)}
                    >
                      <option value="created">Date Created</option>
                      <option value="lastActivity">Last Updated</option>
                      <option value="name">Name</option>
                      <option value="recipients">Recipients</option>
                      <option value="done">Done %</option>
                      <option value="status">Status</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                      <option value="replies">Replies</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                    >
                      {sortDir === "asc" ? "Asc" : "Desc"}
                    </Button>
                  </div>
                </div>
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Request Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipients</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Done</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% Complete</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Replies</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <span className="text-red-700">High</span>
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <span className="text-yellow-700">Medium</span>
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <span className="text-green-700">Low</span>
                      </th>
                      {requestGroups.some(g => g.unknownCount > 0) && (
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <span className="text-gray-500">Unknown</span>
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredSortedGroups.map((group) => {
                      // Build recipient display
                      const recipientCount = group.totalCount
                      const recipientText = `${recipientCount} ${recipientCount === 1 ? 'recipient' : 'recipients'}`
                          const statusBadge = group.isComplete ? "COMPLETE" : "INCOMPLETE"
                      const repliesText = `${group.repliedCount}/${group.totalCount}`
                          const completionPctText = `${group.completionPercent}%`
                      
                      return (
                        <tr
                          key={group.groupKey}
                          onClick={() => handleRequestClick(group.groupKey)}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{group.displayName}</span>
                              {group.groupType !== 'CUSTOM' && (
                                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                  {group.groupType}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {recipientText}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {group.doneCount}/{group.totalCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {completionPctText}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {repliesText}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${group.isComplete ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                              {statusBadge}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`text-sm font-semibold ${
                              group.highCount > 0 ? "text-red-700" : "text-gray-400"
                            }`}>
                              {group.highCount}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`text-sm font-semibold ${
                              group.mediumCount > 0 ? "text-yellow-700" : "text-gray-400"
                            }`}>
                              {group.mediumCount}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`text-sm font-semibold ${
                              group.lowCount > 0 ? "text-green-700" : "text-gray-400"
                            }`}>
                              {group.lowCount}
                            </span>
                          </td>
                          {requestGroups.some(g => g.unknownCount > 0) && (
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <span className={`text-sm font-semibold ${
                                group.unknownCount > 0 ? "text-gray-600" : "text-gray-400"
                              }`}>
                                {group.unknownCount}
                              </span>
                            </td>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDistanceToNow(group.lastActivity, { addSuffix: true })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

