"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { EmailChainSidebar } from "@/components/tasks/email-chain-sidebar"
import { getTaskCompletionState, TaskCompletionState } from "@/lib/taskState"
import { getRequestGrouping } from "@/lib/requestGrouping"
import { formatDistanceToNow } from "date-fns"

export default function RequestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
  const filteredTasks = useMemo(() => {
    if (!groupKey) return []

    return allTasks
      .map(task => {
        // Compute completion state
        const completionState = getTaskCompletionState({
          status: task.status,
          hasAttachments: task.hasAttachments,
          aiVerified: task.aiVerified ?? null,
          updatedAt: task.updatedAt,
          hasReplies: task.hasReplies,
          latestInboundClassification: task.latestInboundClassification ?? null
        })

        // Compute grouping key
        const grouping = getRequestGrouping({
          campaignName: task.campaignName,
          campaignType: task.campaignType,
          id: task.id,
          latestOutboundSubject: task.latestOutboundSubject ?? null
        })

        return {
          ...task,
          completionState,
          computedGroupKey: grouping.groupKey
        }
      })
      .filter(task => task.computedGroupKey === groupKey)
  }, [allTasks, groupKey])

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

  // Compute rollups for the filtered tasks
  const rollups = useMemo(() => {
    const needsReviewCount = filteredTasks.filter(t => t.completionState === "Needs Review").length
    const pendingCount = filteredTasks.filter(t => t.completionState === "Pending").length
    const submittedCount = filteredTasks.filter(t => t.completionState === "Submitted").length
    const completeCount = filteredTasks.filter(t => t.completionState === "Complete").length
    const totalCount = filteredTasks.length
    
    // Calculate completion percentage based on LLM intent analysis (0-100 per task)
    // Use average of task completion percentages if available, otherwise fall back to binary counting
    let percentComplete = 0
    if (totalCount > 0) {
      const tasksWithCompletion = filteredTasks.filter(t => t.completionPercentage !== null && t.completionPercentage !== undefined)
      if (tasksWithCompletion.length > 0) {
        // Use intent-based completion percentages
        const sum = tasksWithCompletion.reduce((acc, t) => acc + (t.completionPercentage || 0), 0)
        // For tasks without completion percentage yet, assume 0%
        const totalSum = sum + (totalCount - tasksWithCompletion.length) * 0
        percentComplete = Math.round(totalSum / totalCount)
      } else {
        // Fall back to binary counting (old method)
        percentComplete = Math.round((completeCount / totalCount) * 100)
      }
    }
    
    // Find latest activity (max updatedAt)
    const lastActivity = filteredTasks.length > 0
      ? filteredTasks.reduce((latest, task) => {
          const taskDate = new Date(task.updatedAt)
          return taskDate > latest ? taskDate : latest
        }, new Date(0))
      : new Date()

    return {
      needsReviewCount,
      pendingCount,
      submittedCount,
      completeCount,
      totalCount,
      percentComplete,
      lastActivity
    }
  }, [filteredTasks])

  // Update selected task when taskId changes
  useEffect(() => {
    if (selectedTaskId) {
      const task = filteredTasks.find(t => t.id === selectedTaskId)
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
  }, [selectedTaskId, filteredTasks])

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
    <div className="w-full h-[calc(100vh-8rem)] flex flex-col border-l border-r border-gray-200">
      <div className="flex-1 flex overflow-hidden relative bg-gray-50">
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
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold">{requestDisplayName}</h2>
                  <span className="text-lg text-gray-600">
                    {rollups.completeCount}/{rollups.totalCount} complete ({rollups.percentComplete}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Bar */}
          <div className="flex-shrink-0 px-6 py-2 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium text-gray-700">Summary:</span>
              <span className={`${rollups.needsReviewCount > 0 ? "font-semibold text-red-700" : "text-gray-600"}`}>
                {rollups.needsReviewCount} Needs Review
              </span>
              <span className="text-gray-600">•</span>
              <span className={`${rollups.pendingCount > 0 ? "font-semibold text-yellow-700" : "text-gray-600"}`}>
                {rollups.pendingCount} Pending
              </span>
              <span className="text-gray-600">•</span>
              <span className={`${rollups.submittedCount > 0 ? "font-semibold text-purple-700" : "text-gray-600"}`}>
                {rollups.submittedCount} Submitted
              </span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-500">
                {rollups.completeCount} Complete
              </span>
              <span className="text-gray-400 ml-auto">
                Last updated: {formatDistanceToNow(rollups.lastActivity, { addSuffix: true })}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-white">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Responses</h3>
                {filteredTasks.length === 0 ? (
                  <p className="text-sm text-gray-500">No responses yet</p>
                ) : (
                  <div className="space-y-2">
                    {filteredTasks.map((task) => {
                      const completionState = task.completionState || "Pending"
                      const stateColors: Record<string, string> = {
                        "Needs Review": "bg-red-100 text-red-800",
                        "Pending": "bg-yellow-100 text-yellow-800",
                        "Submitted": "bg-purple-100 text-purple-800",
                        "Complete": "bg-green-100 text-green-800"
                      }
                      
                      return (
                        <div
                          key={task.id}
                          onClick={() => handleTaskSelect(task.id)}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="font-medium text-gray-900">
                                  {(task as any).entity?.firstName || (task as any).entity?.email || "Unknown"}
                                </span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stateColors[completionState] || "bg-gray-100 text-gray-800"}`}>
                                  {completionState}
                                </span>
                              </div>
                              {task.latestOutboundSubject && (
                                <p className="text-sm text-gray-600 mb-1">{task.latestOutboundSubject}</p>
                              )}
                              <p className="text-xs text-gray-500">
                                {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
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
        />
      </div>
    </div>
  )
}

