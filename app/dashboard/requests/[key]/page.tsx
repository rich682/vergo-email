"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { EmailChainSidebar } from "@/components/tasks/email-chain-sidebar"
import { getRequestGrouping } from "@/lib/requestGrouping"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"

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

  // Compute risk rollups for the filtered tasks
  const rollups = useMemo(() => {
    const totalCount = filteredTasks.length
    const highCount = filteredTasks.filter(t => t.riskLevel === "high").length
    const mediumCount = filteredTasks.filter(t => t.riskLevel === "medium").length
    const lowCount = filteredTasks.filter(t => t.riskLevel === "low").length
    const unknownCount = filteredTasks.filter(t => !t.riskLevel || t.riskLevel === "unknown").length
    const unreadCount = filteredTasks.filter(t => t.readStatus === "unread").length
    
    // Find latest activity (max lastActivityAt or updatedAt)
    const lastActivity = filteredTasks.length > 0
      ? filteredTasks.reduce((latest, task) => {
          const taskDate = task.lastActivityAt 
            ? new Date(task.lastActivityAt)
            : new Date(task.updatedAt)
          return taskDate > latest ? taskDate : latest
        }, new Date(0))
      : new Date()

    return {
      totalCount,
      highCount,
      mediumCount,
      lowCount,
      unknownCount,
      unreadCount,
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
                <h2 className="text-2xl font-bold">{requestDisplayName}</h2>
              </div>
            </div>
          </div>

          {/* Risk Summary Bar */}
          <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium text-gray-700">Risk Summary:</span>
              <span className={`font-semibold ${rollups.highCount > 0 ? "text-red-700" : "text-gray-600"}`}>
                High: {rollups.highCount}
              </span>
              <span className={`font-semibold ${rollups.mediumCount > 0 ? "text-yellow-700" : "text-gray-600"}`}>
                Medium: {rollups.mediumCount}
              </span>
              <span className={`font-semibold ${rollups.lowCount > 0 ? "text-green-700" : "text-gray-600"}`}>
                Low: {rollups.lowCount}
              </span>
              {rollups.unknownCount > 0 && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-500">Unknown: {rollups.unknownCount}</span>
                </>
              )}
              {rollups.unreadCount > 0 && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="text-orange-600">Unread: {rollups.unreadCount}</span>
                </>
              )}
              <span className="text-gray-400 ml-auto">
                Last updated: {formatDistanceToNow(rollups.lastActivity, { addSuffix: true })}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-white">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recipients</h3>
                {filteredTasks.length === 0 ? (
                  <p className="text-sm text-gray-500">No recipients yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason / Snippet</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Activity</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredTasks.map((task) => {
                          const riskLevel = task.riskLevel || "unknown"
                          const riskColors: Record<string, string> = {
                            "high": "bg-red-100 text-red-800",
                            "medium": "bg-yellow-100 text-yellow-800",
                            "low": "bg-green-100 text-green-800",
                            "unknown": "bg-gray-100 text-gray-800"
                          }
                          
                          const readStatus = task.readStatus || "unknown"
                          const statusColors: Record<string, string> = {
                            "unread": "text-gray-500",
                            "read": "text-blue-600",
                            "replied": "text-green-600",
                            "unknown": "text-gray-400"
                          }
                          
                          const entityName = (task as any).entity?.firstName || (task as any).entity?.email || "Unknown"
                          const entityEmail = (task as any).entity?.email || null
                          const lastActivityAt = task.lastActivityAt ? new Date(task.lastActivityAt) : new Date(task.updatedAt)
                          
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
                                <span className={`text-xs font-medium capitalize ${statusColors[readStatus] || statusColors.unknown}`}>
                                  {readStatus}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${riskColors[riskLevel] || riskColors.unknown}`}>
                                    {riskLevel}
                                  </span>
                                  {task.isManualRiskOverride && (
                                    <span className="text-xs text-gray-500">(Manual)</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="max-w-md">
                                  <p className="text-sm text-gray-900 truncate">
                                    {task.riskReason || task.latestResponseText || task.latestOutboundSubject || "—"}
                                  </p>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {formatDistanceToNow(lastActivityAt, { addSuffix: true })}
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
        />
      </div>
    </div>
  )
}

