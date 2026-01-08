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

export default function InboxPage() {
  const router = useRouter()
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<InboxTab>("awaiting")
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
      
      // Add filters based on active tab
      if (currentTab === "awaiting") {
        params.append("hasReplies", "false")
        params.append("isOpened", "false")
      } else if (currentTab === "replied") {
        params.append("hasReplies", "true")
      } else if (currentTab === "read") {
        params.append("hasReplies", "false")
        params.append("isOpened", "true")
      }

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

  // Fetch all inbox items to calculate tab counts
  const fetchAllTasksForCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filters.campaignName) params.append("campaignName", filters.campaignName)
      if (filters.campaignType) params.append("campaignType", filters.campaignType)
      if (filters.status) params.append("status", filters.status)
      if (filters.search) params.append("search", filters.search)

      const [awaitingResponse, replied] = await Promise.all([
        fetch(`/api/tasks?${params.toString()}&hasReplies=false`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        }).then(r => r.ok ? r.json() : []),
        fetch(`/api/tasks?${params.toString()}&hasReplies=true`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        }).then(r => r.ok ? r.json() : [])
      ])

      return {
        awaiting: awaitingResponse.length,
        replied: replied.length
      }
    } catch (error) {
      console.error("Error fetching inbox item counts:", error)
      return { awaiting: 0, replied: 0 }
    }
  }, [filters])

  const [tabCounts, setTabCounts] = useState({ awaiting: 0, replied: 0, read: 0 })

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
  
  // Update tab counts when inbox items change
  useEffect(() => {
    const awaiting = allTasks.filter(t => !t.hasReplies && !t.isOpened).length
    const read = allTasks.filter(t => t.isOpened && !t.hasReplies).length
    const replied = allTasks.filter(t => t.hasReplies).length
    setTabCounts({ awaiting, read, replied })
  }, [allTasks])

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

  // Filter inbox items based on active tab (client-side filtering for display)
  const displayedTasks = allTasks.filter(task => {
    if (activeTab === "awaiting") {
      return !task.hasReplies && !task.isOpened
    } else if (activeTab === "read") {
      return task.isOpened && !task.hasReplies
    } else if (activeTab === "replied") {
      return task.hasReplies
    }
    return false
  })

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
          <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
            <InboxTabs
              activeTab={activeTab}
              onTabChange={handleTabChange}
              awaitingCount={tabCounts.awaiting}
              readCount={tabCounts.read}
              repliedCount={tabCounts.replied}
            />
            <Button
              onClick={() => router.push("/dashboard/compose")}
              className="flex items-center gap-2"
            >
              <Pencil className="w-4 h-4" />
              Compose
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-white">
            <InboxList
              tasks={displayedTasks}
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

