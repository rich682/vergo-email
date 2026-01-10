"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { getTaskCompletionState, TaskCompletionState } from "@/lib/taskState"
import { getRequestGrouping, RequestGrouping } from "@/lib/requestGrouping"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

interface Task {
  id: string
  campaignName: string | null
  campaignType: string | null
  updatedAt: string
  hasAttachments: boolean
  aiVerified: boolean | null
  hasReplies: boolean
  latestInboundClassification?: string | null
  latestOutboundSubject?: string | null
}

interface RequestGroup {
  groupKey: string
  displayName: string
  groupType: string
  tasks: Task[]
  totalCount: number
  needsReviewCount: number
  pendingCount: number
  submittedCount: number
  completeCount: number
  percentComplete: number
  lastActivity: Date
  needsAttentionCount: number
}

export default function RequestsPage() {
  const router = useRouter()
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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
    // Compute completion state for each task
    const tasksWithState = allTasks.map(task => {
      const completionState = getTaskCompletionState({
        status: task.status,
        hasAttachments: task.hasAttachments,
        aiVerified: task.aiVerified ?? null,
        updatedAt: task.updatedAt,
        hasReplies: task.hasReplies,
        latestInboundClassification: task.latestInboundClassification ?? null
      })
      return {
        ...task,
        completionState
      }
    })

    // Group tasks by grouping key
    const groupMap = new Map<string, Task[]>()
    for (const task of tasksWithState) {
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

    // Compute rollups for each group
    const groups: RequestGroup[] = []
    for (const [groupKey, tasks] of groupMap.entries()) {
      const grouping = getRequestGrouping({
        campaignName: tasks[0]?.campaignName ?? null,
        campaignType: tasks[0]?.campaignType ?? null,
        id: tasks[0]?.id ?? '',
        latestOutboundSubject: tasks[0]?.latestOutboundSubject ?? null
      })

      const needsReviewCount = tasks.filter(t => t.completionState === "Needs Review").length
      const pendingCount = tasks.filter(t => t.completionState === "Pending").length
      const submittedCount = tasks.filter(t => t.completionState === "Submitted").length
      const completeCount = tasks.filter(t => t.completionState === "Complete").length
      const totalCount = tasks.length
      const percentComplete = totalCount > 0 ? Math.round((completeCount / totalCount) * 100) : 0
      
      // Find latest activity (max updatedAt)
      const lastActivity = tasks.reduce((latest, task) => {
        const taskDate = new Date(task.updatedAt)
        return taskDate > latest ? taskDate : latest
      }, new Date(0))

      groups.push({
        groupKey: grouping.groupKey,
        displayName: grouping.displayName,
        groupType: grouping.groupType,
        tasks,
        totalCount,
        needsReviewCount,
        pendingCount,
        submittedCount,
        completeCount,
        percentComplete,
        lastActivity,
        needsAttentionCount: needsReviewCount
      })
    }

    // Sort: needsAttentionCount DESC, then lastActivity DESC
    return groups.sort((a, b) => {
      if (a.needsAttentionCount !== b.needsAttentionCount) {
        return b.needsAttentionCount - a.needsAttentionCount
      }
      return b.lastActivity.getTime() - a.lastActivity.getTime()
    })
  }, [allTasks])

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
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Requests</h2>
                <p className="text-sm text-gray-600">
                  {requestGroups.length} request{requestGroups.length !== 1 ? 's' : ''} • {allTasks.length} total tasks
                </p>
              </div>
              <Button
                onClick={() => router.push('/dashboard/compose?mode=request')}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Request
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-white">
            {requestGroups.length === 0 ? (
              <div className="flex items-center justify-center min-h-[400px] p-6">
                <div className="text-center max-w-md">
                  <div className="mb-4 flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No requests yet</h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Start by creating your first request. You'll be able to track who has responded and who still needs to follow up.
                  </p>
                  <Button
                    onClick={() => router.push('/dashboard/compose?mode=request')}
                    className="flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Request
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Request Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipients</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completion</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {requestGroups.map((group) => {
                      // Determine primary status
                      const primaryStatus = group.needsReviewCount > 0 
                        ? "Needs Review" 
                        : group.pendingCount > 0 
                        ? "Pending" 
                        : group.submittedCount > 0 
                        ? "Submitted" 
                        : "Complete"
                      
                      const statusColor = primaryStatus === "Needs Review"
                        ? "bg-red-100 text-red-800"
                        : primaryStatus === "Pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : primaryStatus === "Submitted"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-green-100 text-green-800"
                      
                      // Build recipient display
                      const recipientCount = group.totalCount
                      const recipientText = `${recipientCount} ${recipientCount === 1 ? 'recipient' : 'recipients'}`
                      
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
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                              {primaryStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {recipientText}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {group.completeCount} / {group.totalCount} ({group.percentComplete}%)
                          </td>
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

