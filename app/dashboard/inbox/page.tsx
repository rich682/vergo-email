"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InboxTabs, InboxTab } from "@/components/tasks/inbox-tabs"
import { InboxList } from "@/components/tasks/inbox-list"
import { EmailChainSidebar } from "@/components/tasks/email-chain-sidebar"
import { InboxFilters } from "@/components/tasks/inbox-filters"
import { CampaignType, TaskStatus } from "@prisma/client"
import { getTaskCompletionState, TaskCompletionState } from "@/lib/taskState"
import { getNewRequestRoute } from "@/components/nav-links"

export default function InboxPage() {
  const router = useRouter()
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<InboxTab>("Needs Review")
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filters, setFilters] = useState<{
    campaignName: string | null
    campaignType: CampaignType | null
    status: TaskStatus | null
    search: string
  }>({
    campaignName: null,
    campaignType: null,
    status: null,
    search: ""
  })

  // Use refs to track latest values to avoid dependency issues
  const filtersRef = useRef(filters)
  const activeTabRef = useRef(activeTab)

  // Keep refs in sync with state
  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      const currentFilters = filtersRef.current
      const currentTab = activeTabRef.current

      if (currentFilters.campaignName) params.append("campaignName", currentFilters.campaignName)
      if (currentFilters.campaignType) params.append("campaignType", currentFilters.campaignType)
      if (currentFilters.status) params.append("status", currentFilters.status)
      if (currentFilters.search) params.append("search", currentFilters.search)
      
      // Note: State-based filtering is done client-side after fetching all tasks
      // This allows us to compute states from all available data

      console.log('[InboxPage] Fetching inbox items from:', `/api/tasks?${params.toString()}`)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      let response
      try {
        response = await fetch(`/api/tasks?${params.toString()}`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal
        })
        clearTimeout(timeoutId)
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          console.error('[InboxPage] Fetch timeout')
          throw new Error('Request timeout')
        }
        throw fetchError
      }

      if (response.ok) {
        const data = await response.json()
        console.log('[InboxPage] Received', data?.length || 0, 'inbox items')
        setAllTasks(Array.isArray(data) ? data : [])
        setLoading(false)
      } else {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.error('[InboxPage] API error:', response.status, errorText)
        if (response.status === 401) {
          window.location.href = '/auth/signin?callbackUrl=/dashboard/inbox'
          return
        }
        setAllTasks([])
        setLoading(false)
      }
    } catch (error: any) {
      console.error('[InboxPage] Error fetching inbox items:', error)
      console.error('[InboxPage] Error details:', error.message, error.stack)
      setAllTasks([])
      setLoading(false)
    }
  }, []) // Empty deps - read from refs instead

  // Calculate state counts from all tasks
  const calculateStateCounts = useCallback((tasks: any[]) => {
    const counts = {
      "Needs Review": 0,
      "Pending": 0,
      "Submitted": 0,
      "Complete": 0
    }
    
    tasks.forEach(task => {
      const state = getTaskCompletionState({
        status: task.status,
        hasAttachments: task.hasAttachments,
        aiVerified: task.aiVerified ?? null,
        updatedAt: task.updatedAt,
        hasReplies: task.hasReplies,
        latestInboundClassification: task.latestInboundClassification ?? null
      })
      counts[state] = (counts[state] || 0) + 1
    })
    
    return counts
  }, [])

  const [stateCounts, setStateCounts] = useState({
    "Needs Review": 0,
    "Pending": 0,
    "Submitted": 0,
    "Complete": 0
  })

  // Fetch tasks when filters or activeTab change
  useEffect(() => {
    fetchTasks()
  }, [filters, activeTab, fetchTasks])

  // Set up polling interval
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTasks()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchTasks])
  
  // Update state counts when tasks change
  useEffect(() => {
    const counts = calculateStateCounts(allTasks)
    setStateCounts(counts)
    
    // Auto-switch to Needs Review tab if there are items needing review and current tab is empty
    if (counts["Needs Review"] > 0 && activeTab !== "Needs Review" && activeTab !== "Pending" && activeTab !== "Submitted" && activeTab !== "Complete") {
      setActiveTab("Needs Review")
    }
  }, [allTasks, calculateStateCounts])

  // Update selected inbox item when taskId changes
  useEffect(() => {
    if (selectedTaskId) {
      const task = allTasks.find(t => t.id === selectedTaskId)
      if (task) {
        setSelectedTask(task)
        setSidebarOpen(true)
      } else {
        // Fetch inbox item details if not in current list
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
  }, [selectedTaskId, allTasks])

  const handleFilterChange = useCallback((newFilters: typeof filters) => {
    setFilters(newFilters)
  }, [])

  const handleTaskSelect = (taskId: string) => {
    setSelectedTaskId(taskId)
  }

  const handleTabChange = (tab: InboxTab) => {
    setActiveTab(tab)
    setSelectedTaskId(null) // Clear selection when switching tabs
  }

  // Filter tasks based on active tab (client-side filtering by computed state)
  const displayedTasks = allTasks.filter(task => {
    const state = getTaskCompletionState({
      status: task.status,
      hasAttachments: task.hasAttachments,
      aiVerified: task.aiVerified ?? null,
      updatedAt: task.updatedAt,
      hasReplies: task.hasReplies,
      latestInboundClassification: task.latestInboundClassification ?? null
    })
    
    // Add computed state to task for use in list component
    task.completionState = state
    
    if (activeTab === "all") {
      return true
    }
    
    return state === activeTab
  })
  
  // Hide Complete tasks by default (can be shown via tab)
  const tasksToShow = activeTab === "Complete" ? displayedTasks : displayedTasks.filter(t => t.completionState !== "Complete")

  if (loading && allTasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Loading inbox...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-[calc(100vh-8rem)] flex flex-col border-l border-r border-gray-200">
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative bg-gray-50">
        {/* Left: Filters (collapsible) */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white p-4 overflow-y-auto">
          <InboxFilters tasks={allTasks} onFilterChange={handleFilterChange} />
        </div>

        {/* Center: Tabs + Inbox List */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Summary Bar */}
          <div className="flex-shrink-0 px-6 py-2 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium text-gray-700">Summary:</span>
              <span className={`${stateCounts["Needs Review"] > 0 ? "font-semibold text-red-700" : "text-gray-600"}`}>
                {stateCounts["Needs Review"]} Needs Review
              </span>
              <span className="text-gray-600">•</span>
              <span className={`${stateCounts["Pending"] > 0 ? "font-semibold text-yellow-700" : "text-gray-600"}`}>
                {stateCounts["Pending"]} Pending
              </span>
              <span className="text-gray-600">•</span>
              <span className={`${stateCounts["Submitted"] > 0 ? "font-semibold text-purple-700" : "text-gray-600"}`}>
                {stateCounts["Submitted"]} Submitted
              </span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-500">
                {stateCounts["Complete"]} Complete
              </span>
              <span className="text-gray-400 ml-auto">
                {allTasks.length} total
              </span>
            </div>
          </div>
          
          <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
            <InboxTabs
              activeTab={activeTab}
              onTabChange={handleTabChange}
              needsReviewCount={stateCounts["Needs Review"]}
              pendingCount={stateCounts["Pending"]}
              submittedCount={stateCounts["Submitted"]}
              completeCount={stateCounts["Complete"]}
            />
            <Button
              onClick={() => router.push(getNewRequestRoute())}
              className="flex items-center gap-2"
            >
              <Pencil className="w-4 h-4" />
              New Request
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-white">
            <InboxList
              tasks={tasksToShow}
              selectedTaskId={selectedTaskId}
              onTaskSelect={handleTaskSelect}
            />
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

