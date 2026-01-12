"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { EmailChainSidebar } from "@/components/tasks/email-chain-sidebar"
import { getRequestGrouping } from "@/lib/requestGrouping"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function RequestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [completionFilter, setCompletionFilter] = useState<"all" | "in-progress" | "done">("all")
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "medium" | "low">("all")

  // Decode the groupKey from URL
  const groupKey = useMemo(() => {
    if (!params.key || typeof params.key !== 'string') {
      return null
    }
    try {
      return decodeURIComponent(params.key)
    } catch {
      return params.key
    }
  }, [params.key])

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
      console.error('[RequestDetailPage] Error fetching tasks:', error)
      setAllTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Filter tasks by groupKey
  const groupedTasks = useMemo(() => {
    if (!groupKey) return []

    return allTasks
      .map(task => {
        // Compute grouping key
        const grouping = getRequestGrouping({
          campaignName: task.campaignName,
          campaignType: task.campaignType,
          id: task.id,
          latestOutboundSubject: task.latestOutboundSubject ?? null
        })

        return {
          ...task,
          computedGroupKey: grouping.groupKey
        }
      })
      .filter(task => task.computedGroupKey === groupKey)
  }, [allTasks, groupKey])

  const filteredTasks = useMemo(() => {
    let tasks = [...groupedTasks]

    // Completion filter first
    if (completionFilter === "done") {
      tasks = tasks.filter(t => t.status === "FULFILLED")
    } else if (completionFilter === "in-progress") {
      tasks = tasks.filter(t => t.status !== "FULFILLED")
    }

    // Risk filter applies only to non-done tasks
    if (riskFilter !== "all") {
      tasks = tasks.filter(t => {
        if (t.status === "FULFILLED") return true
        return (t.riskLevel || "unknown") === riskFilter
      })
    }

    // Search filter last (name/email)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      tasks = tasks.filter(t => {
        const name = t.entity?.firstName?.toLowerCase() || ""
        const email = t.entity?.email?.toLowerCase() || ""
        return name.includes(term) || email.includes(term)
      })
    }

    return tasks
  }, [groupedTasks, completionFilter, riskFilter, searchTerm])

  const completionStats = useMemo(() => {
    const total = filteredTasks.length
    const done = filteredTasks.filter(t => t.status === "FULFILLED").length
    const percent = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, percent, isComplete: total > 0 && done === total }
  }, [filteredTasks])

  // Get display name for this request
  const requestDisplayName = useMemo(() => {
    if (filteredTasks.length === 0) return "Request"
    const firstTask = filteredTasks[0]
    const grouping = getRequestGrouping({
      campaignName: firstTask.campaignName,
      campaignType: firstTask.campaignType,
      id: firstTask.id,
      latestOutboundSubject: firstTask.latestOutboundSubject ?? null
    })
    return grouping.displayName
  }, [filteredTasks])

  // Ensure first recipient selected by default
  useEffect(() => {
    if (!selectedTaskId && filteredTasks.length > 0) {
      setSelectedTaskId(filteredTasks[0].id)
      setSidebarOpen(true)
    }
  }, [filteredTasks, selectedTaskId])

  // Update selected task when taskId changes
  useEffect(() => {
    if (selectedTaskId) {
      const task = groupedTasks.find(t => t.id === selectedTaskId)
      if (task) {
        setSelectedTask(task)
        setSidebarOpen(true)
      } else {
        // Fetch task details if not in current list
        fetch(`/api/tasks/${selectedTaskId}`, {
          credentials: 'include'
        })
          .then(r => r.json())
          .then(data => {
            setSelectedTask(data)
            setSidebarOpen(true)
          })
          .catch(console.error)
      }
    } else {
      setSelectedTask(null)
      setSidebarOpen(false)
    }
  }, [selectedTaskId, groupedTasks])

  const handleTaskSelect = (taskId: string) => {
    setSelectedTaskId(taskId)
  }

  if (loading && allTasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Loading request...</p>
        </div>
      </div>
    )
  }

  if (!groupKey) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Invalid request</p>
          <button
            onClick={() => router.push('/dashboard/requests')}
            className="mt-4 text-blue-600 hover:underline"
          >
            Back to Requests
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-[calc(100vh-4rem)] flex flex-col border-l border-r border-gray-200">
      <div className="flex-1 flex overflow-hidden relative bg-white">
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <button
                  onClick={() => router.push('/dashboard/requests')}
                  className="text-sm text-gray-500 hover:text-gray-700 mb-1"
                >
                  ← Back to Requests
                </button>
                <h2 className="text-2xl font-bold">{requestDisplayName}</h2>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-white">
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">Recipients</h3>
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <span className="font-medium">
                      {completionStats.done}/{completionStats.total} done • {completionStats.percent}%
                    </span>
                    {completionStats.isComplete && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-semibold">
                        COMPLETE
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 mb-4">
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search name or email"
                    className="w-full md:w-64"
                  />
                  <Select value={completionFilter} onValueChange={(v) => setCompletionFilter(v as any)}>
                    <SelectTrigger className="w-full md:w-40">
                      <SelectValue placeholder="Completion" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All completion</SelectItem>
                      <SelectItem value="in-progress">In progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as any)}>
                    <SelectTrigger className="w-full md:w-40">
                      <SelectValue placeholder="Risk" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All risk</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {filteredTasks.length === 0 ? (
                  <p className="text-sm text-gray-500">No recipients yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completion</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Snippet</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredTasks.map((task) => {
                          const entityName = (task as any).entity?.firstName || (task as any).entity?.email || "Unknown"
                          const entityEmail = (task as any).entity?.email || null
                          const isDone = task.status === "FULFILLED"
                          const riskLabel = (task.riskLevel || "—").toString().toLowerCase()
                          const riskTitle = riskLabel === "—" ? "—" : riskLabel.charAt(0).toUpperCase() + riskLabel.slice(1)
                          const displayRisk = isDone
                            ? "—"
                            : riskLabel === "unknown"
                              ? "—"
                              : `Risk: ${riskTitle}`

                          return (
                            <tr
                              key={task.id}
                              onClick={() => handleTaskSelect(task.id)}
                              className="hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-gray-900">{entityName}</span>
                                  {entityEmail && (
                                    <span className="text-xs text-gray-500">{entityEmail}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isDone ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                                  {isDone ? "Done" : "In progress"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="max-w-[180px]">
                                  <span className="text-sm text-gray-900 truncate">
                                    {displayRisk}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="max-w-md">
                                  <p className="text-sm text-gray-900 truncate">
                                    {task.riskReason || task.latestResponseText || task.latestOutboundSubject || "—"}
                                  </p>
                                </div>
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

        {/* Right: Email Chain Sidebar */}
        <EmailChainSidebar
          task={selectedTask}
          isOpen={sidebarOpen}
          onClose={() => {
            setSelectedTaskId(null)
            setSidebarOpen(false)
          }}
          onTaskUpdated={fetchTasks}
        />
      </div>
    </div>
  )
}

