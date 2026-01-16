"use client"

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Plus, 
  ChevronDown, 
  Search, 
  MoreHorizontal,
  Trash2,
  Users,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Copy,
  Sparkles
} from "lucide-react"
import { formatDistanceToNow, format, differenceInDays } from "date-fns"
import { UI_LABELS } from "@/lib/ui-labels"
import { EmptyState } from "@/components/ui/empty-state"
import { AIBulkUploadModal } from "@/components/jobs/ai-bulk-upload-modal"
import { AISummaryPanel } from "@/components/jobs/ai-summary-panel"

// ============================================
// Types
// ============================================

interface JobOwner {
  id: string
  name: string | null
  email: string
}

interface JobStakeholder {
  type: "contact_type" | "group" | "individual"
  id: string
  name: string
}

interface JobLabels {
  tags?: string[]
  period?: string
  workType?: string
  stakeholders?: JobStakeholder[]
}

interface Job {
  id: string
  name: string
  description: string | null
  ownerId: string
  status: string
  dueDate: string | null
  labels: JobLabels | null
  createdAt: string
  updatedAt: string
  owner: JobOwner
  collaborators?: { id: string; userId: string; role: string; user: { id: string; name: string | null; email: string } }[]
  taskCount: number
  respondedCount: number
  completedCount: number
  stakeholderCount?: number
}

interface Board {
  id: string
  name: string
  status: string
}

// Status group configuration
const STATUS_GROUPS = [
  { 
    status: "NOT_STARTED", 
    label: "Not Started", 
    icon: Clock,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    defaultExpanded: true 
  },
  { 
    status: "IN_PROGRESS", 
    label: "In Progress", 
    icon: AlertCircle,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    defaultExpanded: true 
  },
  { 
    status: "BLOCKED", 
    label: "Blocked", 
    icon: AlertCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    defaultExpanded: true 
  },
  { 
    status: "COMPLETE", 
    label: "Complete", 
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-50",
    defaultExpanded: false 
  },
]

// Status options for dropdown
const STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Not Started", color: "text-gray-600" },
  { value: "IN_PROGRESS", label: "In Progress", color: "text-blue-600" },
  { value: "BLOCKED", label: "Blocked", color: "text-red-600" },
  { value: "COMPLETE", label: "Complete", color: "text-green-600" },
]

// ============================================
// Helpers
// ============================================

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0]?.[0]?.toUpperCase() || email[0]?.toUpperCase() || "?"
  }
  return email[0]?.toUpperCase() || "?"
}

type RAGRating = "green" | "amber" | "red" | "gray"

function calculateRAGRating(job: Job): RAGRating {
  const dueDate = job.dueDate ? new Date(job.dueDate) : null
  const now = new Date()
  
  // Map legacy statuses for comparison
  const status = job.status === "COMPLETED" || job.status === "ARCHIVED" ? "COMPLETE" : job.status
  
  if (status === "COMPLETE") return "green"
  if (status === "BLOCKED") return "red"
  if (!dueDate) return "gray"
  
  const daysUntilDue = differenceInDays(dueDate, now)
  
  if (daysUntilDue < 0) return "red"
  
  const hasOutstandingRequests = job.taskCount > 0 && job.respondedCount === 0
  
  if (daysUntilDue <= 3 && hasOutstandingRequests) return "red"
  if (daysUntilDue <= 7 && hasOutstandingRequests) return "amber"
  if (daysUntilDue <= 3) return "amber"
  if (job.taskCount > 0 && job.respondedCount === job.taskCount) return "green"
  
  return "green"
}

function RAGBadge({ rating }: { rating: RAGRating }) {
  const colors = {
    green: "bg-green-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    gray: "bg-gray-300"
  }
  
  return (
    <div className={`w-2.5 h-2.5 rounded-full ${colors[rating]}`} />
  )
}

// Map legacy statuses to new ones for display
const mapStatusForDisplay = (status: string): string => {
  switch (status) {
    case "ACTIVE": return "NOT_STARTED"
    case "WAITING": return "IN_PROGRESS"
    case "COMPLETED": return "COMPLETE"
    case "ARCHIVED": return "COMPLETE"
    default: return status
  }
}

// ============================================
// Task Row Component
// ============================================

function TaskRow({ 
  job, 
  teamMembers,
  onStatusChange,
  onDelete,
  onDuplicate
}: { 
  job: Job
  teamMembers: { id: string; name: string | null; email: string }[]
  onStatusChange: (jobId: string, status: string) => void
  onDelete: (jobId: string) => void
  onDuplicate: (jobId: string) => void
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  
  const rag = calculateRAGRating(job)
  
  // Map legacy status to new status for display
  const displayStatus = mapStatusForDisplay(job.status)

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    if ((e.target as HTMLElement).closest('button, input, select, [role="button"]')) {
      return
    }
    router.push(`/dashboard/jobs/${job.id}`)
  }

  return (
    <div 
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 group"
      onClick={handleRowClick}
    >
      {/* Task name */}
      <div className="flex-1 min-w-0">
        <span className={`font-medium truncate ${displayStatus === "COMPLETE" ? "line-through text-gray-400" : "text-gray-900"}`}>
          {job.name}
        </span>
      </div>

        {/* Status Dropdown */}
        <div className="w-28 flex-shrink-0 relative" ref={statusMenuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setStatusMenuOpen(!statusMenuOpen)
            }}
            className={`
              px-2 py-1 text-xs font-medium rounded-full border
              ${displayStatus === "NOT_STARTED" ? "bg-gray-100 text-gray-600 border-gray-200" : ""}
              ${displayStatus === "IN_PROGRESS" ? "bg-blue-100 text-blue-700 border-blue-200" : ""}
              ${displayStatus === "BLOCKED" ? "bg-red-100 text-red-700 border-red-200" : ""}
              ${displayStatus === "COMPLETE" ? "bg-green-100 text-green-700 border-green-200" : ""}
              hover:opacity-80 transition-opacity
            `}
          >
            {STATUS_OPTIONS.find(s => s.value === displayStatus)?.label || displayStatus}
          </button>
          {statusMenuOpen && (
            <div className="absolute left-0 top-full mt-1 w-32 bg-white border rounded-lg shadow-lg z-20">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={(e) => {
                    e.stopPropagation()
                    onStatusChange(job.id, option.value)
                    setStatusMenuOpen(false)
                  }}
                  className={`
                    w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2
                    ${displayStatus === option.value ? "bg-gray-50 font-medium" : ""}
                  `}
                >
                  <span className={`w-2 h-2 rounded-full ${
                    option.value === "NOT_STARTED" ? "bg-gray-400" :
                    option.value === "IN_PROGRESS" ? "bg-blue-500" :
                    option.value === "BLOCKED" ? "bg-red-500" :
                    "bg-green-500"
                  }`} />
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Owner */}
        <div className="w-24 flex-shrink-0">
          <div 
            className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600"
            title={job.owner.name || job.owner.email}
          >
            {getInitials(job.owner.name, job.owner.email)}
          </div>
        </div>

        {/* Due Date */}
        <div className="w-24 flex-shrink-0 text-sm text-gray-500">
          {job.dueDate ? format(new Date(job.dueDate), "MMM d") : "—"}
        </div>

        {/* Actions */}
        <div className="w-10 flex-shrink-0 relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(!menuOpen)
            }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200"
          >
            <MoreHorizontal className="w-4 h-4 text-gray-500" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-white border rounded-lg shadow-lg z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(false)
                  onDuplicate(job.id)
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(false)
                  onDelete(job.id)
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
  )
}

// ============================================
// Status Group Component
// ============================================

function StatusGroup({
  group,
  jobs,
  teamMembers,
  onStatusChange,
  onDelete,
  onDuplicate,
  onAddTask
}: {
  group: typeof STATUS_GROUPS[0]
  jobs: Job[]
  teamMembers: { id: string; name: string | null; email: string }[]
  onStatusChange: (jobId: string, status: string) => void
  onDelete: (jobId: string) => void
  onDuplicate: (jobId: string) => void
  onAddTask: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(group.defaultExpanded)
  const Icon = group.icon

  return (
    <div className="mb-4">
      {/* Group Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          w-full flex items-center gap-2 px-4 py-2 rounded-lg
          ${group.bgColor} hover:opacity-90 transition-opacity
        `}
      >
        {isExpanded ? (
          <ChevronDown className={`w-4 h-4 ${group.color}`} />
        ) : (
          <ChevronRight className={`w-4 h-4 ${group.color}`} />
        )}
        <Icon className={`w-4 h-4 ${group.color}`} />
        <span className={`font-medium ${group.color}`}>{group.label}</span>
        <span className={`text-sm ${group.color} opacity-70`}>({jobs.length})</span>
      </button>

      {/* Group Content */}
      {isExpanded && (
        <div className="mt-2 border rounded-lg bg-white overflow-hidden">
          {jobs.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              No tasks in this group
            </div>
          ) : (
            <>
              {/* Header Row */}
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
                <div className="flex-1">Task</div>
                <div className="w-28">Status</div>
                <div className="w-24">Owner</div>
                <div className="w-24">Due Date</div>
                <div className="w-10" /> {/* Actions */}
              </div>
              
              {/* Task Rows */}
              {jobs.map((job) => (
                <TaskRow
                  key={job.id}
                  job={job}
                  teamMembers={teamMembers}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                />
              ))}
            </>
          )}
          
          {/* Add Task Row */}
          <button
            onClick={onAddTask}
            className="w-full flex items-center gap-2 px-4 py-3 text-gray-500 hover:bg-gray-50 hover:text-gray-700 border-t"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Add task</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export default function JobsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Board context from URL
  const boardId = searchParams.get("boardId")
  const [currentBoard, setCurrentBoard] = useState<Board | null>(null)
  
  // Data state
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newJobName, setNewJobName] = useState("")
  const [newJobDescription, setNewJobDescription] = useState("")
  const [newJobDueDate, setNewJobDueDate] = useState("")
  const [newJobOwnerId, setNewJobOwnerId] = useState("")
  const [newJobStakeholders, setNewJobStakeholders] = useState<JobStakeholder[]>([])
  const [creating, setCreating] = useState(false)
  
  // Team members for owner selection
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string | null; email: string; isCurrentUser: boolean }[]>([])
  
  // Stakeholder options
  const [availableContactTypes, setAvailableContactTypes] = useState<{ value: string; label: string; count: number }[]>([])
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string; memberCount: number }[]>([])
  const [stakeholderSearchQuery, setStakeholderSearchQuery] = useState("")
  const [stakeholderSearchResults, setStakeholderSearchResults] = useState<{ id: string; firstName: string; lastName: string | null; email: string | null }[]>([])
  const [stakeholderType, setStakeholderType] = useState<"contact_type" | "group" | "individual">("contact_type")
  
  // Bulk upload modal
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false)

  // ============================================
  // Data fetching
  // ============================================

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (boardId) {
        params.set("boardId", boardId)
      }
      
      const response = await fetch(`/api/jobs?${params.toString()}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setJobs(data.jobs || [])
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/jobs"
      }
    } catch (error) {
      console.error("Error fetching jobs:", error)
    } finally {
      setLoading(false)
    }
  }, [boardId])

  const fetchBoard = useCallback(async () => {
    if (!boardId) {
      setCurrentBoard(null)
      return
    }
    try {
      const response = await fetch(`/api/boards/${boardId}`)
      if (response.ok) {
        const data = await response.json()
        setCurrentBoard(data.board)
      }
    } catch (error) {
      console.error("Error fetching board:", error)
    }
  }, [boardId])

  const fetchTeamMembers = useCallback(async () => {
    try {
      const response = await fetch("/api/org/team", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setTeamMembers(data.teamMembers || [])
        const currentUser = data.teamMembers?.find((m: any) => m.isCurrentUser)
        if (currentUser && !newJobOwnerId) {
          setNewJobOwnerId(currentUser.id)
        }
      }
    } catch (error) {
      console.error("Error fetching team members:", error)
    }
  }, [newJobOwnerId])

  const fetchStakeholderOptions = useCallback(async () => {
    try {
      // Fetch contact type counts
      const typesResponse = await fetch("/api/contacts/type-counts", { credentials: "include" })
      if (typesResponse.ok) {
        const data = await typesResponse.json()
        const types: { value: string; label: string; count: number }[] = []
        
        // Add built-in types
        const builtInCounts = data.builtInCounts || {}
        const typeLabels: Record<string, string> = {
          "VENDOR": "Vendors",
          "CLIENT": "Clients",
          "EMPLOYEE": "Employees",
          "CONTRACTOR": "Contractors",
          "PARTNER": "Partners",
          "OTHER": "Other"
        }
        
        Object.entries(builtInCounts).forEach(([type, count]) => {
          if (count && (count as number) > 0) {
            types.push({
              value: type,
              label: typeLabels[type] || type,
              count: count as number
            })
          }
        })
        
        // Add custom types
        const customTypes = data.customTypes || []
        customTypes.forEach((ct: { label: string; count: number }) => {
          types.push({
            value: `CUSTOM:${ct.label}`,
            label: ct.label,
            count: ct.count
          })
        })
        
        setAvailableContactTypes(types)
      }
      
      // Fetch groups - API returns array directly
      const groupsResponse = await fetch("/api/groups", { credentials: "include" })
      if (groupsResponse.ok) {
        const data = await groupsResponse.json()
        // API returns array directly, not { groups: [...] }
        const groupsArray = Array.isArray(data) ? data : (data.groups || [])
        setAvailableGroups(groupsArray.map((g: any) => ({
          id: g.id,
          name: g.name,
          memberCount: g.entityCount || g._count?.entities || 0
        })))
      }
    } catch (error) {
      console.error("Error fetching stakeholder options:", error)
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])
  useEffect(() => { fetchBoard() }, [fetchBoard])
  useEffect(() => { 
    if (isCreateOpen) {
      fetchTeamMembers()
      fetchStakeholderOptions()
    }
  }, [isCreateOpen, fetchTeamMembers, fetchStakeholderOptions])

  // Search stakeholders (contacts/entities)
  useEffect(() => {
    if (!stakeholderSearchQuery.trim()) {
      setStakeholderSearchResults([])
      return
    }
    const searchContacts = async () => {
      try {
        const response = await fetch(`/api/entities?search=${encodeURIComponent(stakeholderSearchQuery)}`, { credentials: "include" })
        if (response.ok) {
          const data = await response.json()
          // The entities endpoint returns an array directly
          const entities = Array.isArray(data) ? data : (data.entities || [])
          setStakeholderSearchResults(entities.slice(0, 5).map((e: any) => ({
            id: e.id,
            firstName: e.firstName,
            lastName: e.lastName,
            email: e.email
          })))
        }
      } catch (error) {
        console.error("Error searching contacts:", error)
      }
    }
    const timer = setTimeout(searchContacts, 300)
    return () => clearTimeout(timer)
  }, [stakeholderSearchQuery])

  // ============================================
  // Handlers
  // ============================================

  const handleStatusChange = async (jobId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      })
      if (response.ok) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
      }
    } catch (error) {
      console.error("Error updating job status:", error)
    }
  }

  const handleDelete = async (jobId: string) => {
    if (!window.confirm("Delete this task?")) return
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" })
      if (response.ok) {
        setJobs(prev => prev.filter(j => j.id !== jobId))
      }
    } catch (error) {
      console.error("Error deleting job:", error)
    }
  }

  const handleDuplicate = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: `${job.name} (Copy)`,
          description: job.description,
          dueDate: job.dueDate,
          ownerId: job.ownerId,
          labels: job.labels,
          boardId: boardId || undefined
        })
      })
      if (response.ok) {
        const data = await response.json()
        setJobs(prev => [data.job, ...prev])
      }
    } catch (error) {
      console.error("Error duplicating job:", error)
    }
  }

  const handleCreateJob = async () => {
    if (!newJobName.trim() || !newJobOwnerId || !newJobDueDate || newJobStakeholders.length === 0) return
    setCreating(true)
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newJobName.trim(),
          description: newJobDescription.trim() || undefined,
          dueDate: newJobDueDate,
          ownerId: newJobOwnerId,
          stakeholders: newJobStakeholders,
          boardId: boardId || undefined  // Include current board
        })
      })
      if (response.ok) {
        const data = await response.json()
        setJobs(prev => [data.job, ...prev])
        resetCreateForm()
        setIsCreateOpen(false)
        router.push(`/dashboard/jobs/${data.job.id}`)
      }
    } catch (error) {
      console.error("Error creating job:", error)
    } finally {
      setCreating(false)
    }
  }

  const resetCreateForm = () => {
    setNewJobName("")
    setNewJobDescription("")
    setNewJobDueDate("")
    setNewJobOwnerId(teamMembers.find(m => m.isCurrentUser)?.id || "")
    setNewJobStakeholders([])
    setStakeholderSearchQuery("")
    setStakeholderSearchResults([])
  }

  const handleAddStakeholder = (type: "contact_type" | "group" | "individual", id: string, name: string) => {
    if (newJobStakeholders.some(s => s.type === type && s.id === id)) return
    setNewJobStakeholders(prev => [...prev, { type, id, name }])
    setStakeholderSearchQuery("")
    setStakeholderSearchResults([])
  }

  const handleRemoveStakeholder = (type: string, id: string) => {
    setNewJobStakeholders(prev => prev.filter(s => !(s.type === type && s.id === id)))
  }

  // ============================================
  // Filtered & Grouped Data
  // ============================================

  const filteredJobs = jobs.filter(job => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      job.name.toLowerCase().includes(query) ||
      job.description?.toLowerCase().includes(query) ||
      job.owner.name?.toLowerCase().includes(query) ||
      job.owner.email.toLowerCase().includes(query)
    )
  })

  const jobsByStatus = STATUS_GROUPS.reduce((acc, group) => {
    acc[group.status] = filteredJobs.filter(j => mapStatusForDisplay(j.status) === group.status)
    return acc
  }, {} as Record<string, Job[]>)

  // ============================================
  // Render
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {currentBoard ? currentBoard.name : "All Tasks"}
            </h1>
            {currentBoard && (
              <p className="text-sm text-gray-500 mt-1">
                {filteredJobs.length} tasks
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsBulkUploadOpen(true)}>
              <Sparkles className="w-4 h-4 mr-2" />
              AI Bulk Add
            </Button>
            
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Task
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {/* Task Name */}
                <div>
                  <Label htmlFor="taskName">Task Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="taskName"
                    value={newJobName}
                    onChange={(e) => setNewJobName(e.target.value)}
                    placeholder="e.g., Collect W-9 forms"
                  />
                </div>

                {/* Owner */}
                <div>
                  <Label htmlFor="owner">Owner <span className="text-red-500">*</span></Label>
                  <select
                    id="owner"
                    value={newJobOwnerId}
                    onChange={(e) => setNewJobOwnerId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="">Select owner...</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name || member.email} {member.isCurrentUser ? "(You)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Due Date */}
                <div>
                  <Label htmlFor="dueDate">Due Date <span className="text-red-500">*</span></Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={newJobDueDate}
                    onChange={(e) => setNewJobDueDate(e.target.value)}
                  />
                </div>

                {/* Stakeholders */}
                <div>
                  <Label>Stakeholders <span className="text-red-500">*</span></Label>
                  
                  {/* Selected stakeholders */}
                  {newJobStakeholders.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {newJobStakeholders.map((s) => (
                        <span
                          key={`${s.type}-${s.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                        >
                          {s.name}
                          <button
                            onClick={() => handleRemoveStakeholder(s.type, s.id)}
                            className="hover:text-blue-600"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Two-step stakeholder selection */}
                  <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
                    {/* Step 1: Select Type */}
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Step 1: Select Type</Label>
                      <Select value={stakeholderType} onValueChange={(v) => setStakeholderType(v as any)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contact_type">Contact Type</SelectItem>
                          <SelectItem value="group">Group</SelectItem>
                          <SelectItem value="individual">Individual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Step 2: Select specific item based on type */}
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">
                        Step 2: Select {stakeholderType === "contact_type" ? "Contact Type" : stakeholderType === "group" ? "Group" : "Individual"}
                      </Label>
                      
                      {stakeholderType === "contact_type" && (
                        <>
                          {availableContactTypes.length > 0 ? (
                            <Select onValueChange={(v) => {
                              const type = availableContactTypes.find(t => t.value === v)
                              if (type && !newJobStakeholders.some(s => s.type === "contact_type" && s.id === type.value)) {
                                handleAddStakeholder("contact_type", type.value, type.label)
                              }
                            }}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a contact type..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableContactTypes.map(type => (
                                  <SelectItem 
                                    key={type.value} 
                                    value={type.value}
                                    disabled={newJobStakeholders.some(s => s.type === "contact_type" && s.id === type.value)}
                                  >
                                    {type.label} ({type.count} contacts)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                              <p className="text-sm text-amber-800 mb-1">
                                No contact types found. Add contacts with types first.
                              </p>
                              <a 
                                href="/dashboard/contacts" 
                                className="text-sm font-medium text-amber-700 hover:text-amber-900"
                              >
                                Go to Contacts →
                              </a>
                            </div>
                          )}
                        </>
                      )}
                      
                      {stakeholderType === "group" && (
                        <>
                          {availableGroups.length > 0 ? (
                            <Select onValueChange={(v) => {
                              const group = availableGroups.find(g => g.id === v)
                              if (group && !newJobStakeholders.some(s => s.type === "group" && s.id === group.id)) {
                                handleAddStakeholder("group", group.id, group.name)
                              }
                            }}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a group..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableGroups.map(group => (
                                  <SelectItem 
                                    key={group.id} 
                                    value={group.id}
                                    disabled={newJobStakeholders.some(s => s.type === "group" && s.id === group.id)}
                                  >
                                    {group.name} ({group.memberCount} members)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                              <p className="text-sm text-amber-800 mb-1">
                                No groups found. Create groups in the Contacts page first.
                              </p>
                              <a 
                                href="/dashboard/contacts" 
                                className="text-sm font-medium text-amber-700 hover:text-amber-900"
                              >
                                Go to Contacts →
                              </a>
                            </div>
                          )}
                        </>
                      )}
                      
                      {stakeholderType === "individual" && (
                        <div>
                          <Input
                            placeholder="Search by name or email..."
                            value={stakeholderSearchQuery}
                            onChange={(e) => setStakeholderSearchQuery(e.target.value)}
                          />
                          <div className="max-h-32 overflow-y-auto mt-2">
                            {stakeholderSearchQuery.length >= 2 ? (
                              stakeholderSearchResults.length > 0 ? (
                                <div className="border rounded-md bg-white">
                                  {stakeholderSearchResults.map((contact) => (
                                    <button
                                      key={contact.id}
                                      onClick={() => handleAddStakeholder("individual", contact.id, `${contact.firstName} ${contact.lastName || ""}`.trim())}
                                      disabled={newJobStakeholders.some(s => s.type === "individual" && s.id === contact.id)}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-b last:border-b-0 disabled:opacity-50"
                                    >
                                      <div className="font-medium">{contact.firstName} {contact.lastName}</div>
                                      {contact.email && <div className="text-xs text-gray-500">{contact.email}</div>}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500 text-center py-2">No contacts found matching "{stakeholderSearchQuery}"</p>
                              )
                            ) : (
                              <p className="text-sm text-gray-500 text-center py-2">Type at least 2 characters to search</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* No stakeholders option */}
                  <button
                    onClick={() => handleAddStakeholder("contact_type", "NONE", "No Stakeholders (Internal)")}
                    disabled={newJobStakeholders.some(s => s.id === "NONE")}
                    className="mt-2 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    + Internal task (no stakeholders)
                  </button>
                </div>

                {/* Description */}
                <div>
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    value={newJobDescription}
                    onChange={(e) => setNewJobDescription(e.target.value)}
                    placeholder="Optional description..."
                    rows={2}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateJob}
                    disabled={!newJobName.trim() || !newJobOwnerId || !newJobDueDate || newJobStakeholders.length === 0 || creating}
                  >
                    {creating ? "Creating..." : "Create Task"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* AI Summary Panel */}
        {filteredJobs.length > 0 && (
          <AISummaryPanel boardId={boardId} />
        )}

        {/* Status Groups */}
        {filteredJobs.length === 0 && !searchQuery ? (
          <EmptyState
            icon={<CheckCircle className="w-12 h-12 text-gray-300" />}
            title="No tasks yet"
            description={currentBoard 
              ? "Create your first task in this board"
              : "Create a board and add tasks to get started"
            }
            action={{
              label: "Create Task",
              onClick: () => setIsCreateOpen(true)
            }}
          />
        ) : filteredJobs.length === 0 && searchQuery ? (
          <div className="text-center py-12 text-gray-500">
            No tasks match "{searchQuery}"
          </div>
        ) : (
          <div>
            {STATUS_GROUPS.map((group) => (
              <StatusGroup
                key={group.status}
                group={group}
                jobs={jobsByStatus[group.status] || []}
                teamMembers={teamMembers}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onAddTask={() => setIsCreateOpen(true)}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* AI Bulk Upload Modal */}
      <AIBulkUploadModal
        open={isBulkUploadOpen}
        onOpenChange={setIsBulkUploadOpen}
        onImportComplete={() => {
          setIsBulkUploadOpen(false)
          fetchJobs()
        }}
        boardId={boardId}
      />
    </div>
  )
}
