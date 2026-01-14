"use client"

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
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
import { Plus, Briefcase, X, Filter, Check, Sparkles, Tag, Copy, ChevronDown, Trash2 } from "lucide-react"
import { formatDistanceToNow, format, differenceInDays } from "date-fns"
import { UI_LABELS } from "@/lib/ui-labels"

// Design system components
import { Chip } from "@/components/ui/chip"
import { EmptyState } from "@/components/ui/empty-state"
import { AISummaryPanel } from "@/components/jobs/ai-summary-panel"
import { AIBulkUploadModal } from "@/components/jobs/ai-bulk-upload-modal"

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
  client?: { id: string; firstName: string; lastName: string | null; email: string | null } | null
  taskCount: number
  respondedCount: number
  completedCount: number
  stakeholderCount?: number  // Actual count of resolved contacts
}

interface SavedView {
  id: string
  name: string
  statusFilters: string[]
  tagFilters: string[]
}

const SAVED_VIEWS_KEY = "checklist-saved-views"

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

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "WAITING", label: "Waiting" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
]

// RAG rating calculation based on item context
type RAGRating = "green" | "amber" | "red" | "gray"

function calculateRAGRating(job: Job): RAGRating {
  const dueDate = job.dueDate ? new Date(job.dueDate) : null
  const now = new Date()
  
  // Completed items are always green
  if (job.status === "COMPLETED") return "green"
  
  // Archived items are gray
  if (job.status === "ARCHIVED") return "gray"
  
  // No due date = gray (can't assess risk)
  if (!dueDate) return "gray"
  
  const daysUntilDue = differenceInDays(dueDate, now)
  
  // Overdue = red
  if (daysUntilDue < 0) return "red"
  
  // Has outstanding requests with no responses and due soon
  const hasOutstandingRequests = job.taskCount > 0 && job.respondedCount === 0
  
  // Due within 3 days with outstanding requests = red
  if (daysUntilDue <= 3 && hasOutstandingRequests) return "red"
  
  // Due within 7 days with outstanding requests = amber
  if (daysUntilDue <= 7 && hasOutstandingRequests) return "amber"
  
  // Due within 3 days = amber
  if (daysUntilDue <= 3) return "amber"
  
  // All responses received = green
  if (job.taskCount > 0 && job.respondedCount === job.taskCount) return "green"
  
  // Default = green (on track)
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
    <div className={`w-3 h-3 rounded-full ${colors[rating]}`} title={rating.charAt(0).toUpperCase() + rating.slice(1)} />
  )
}

// ============================================
// Main Component
// ============================================

export default function JobsPage() {
  const router = useRouter()
  const filterRef = useRef<HTMLDivElement>(null)
  
  // Data state
  const [jobs, setJobs] = useState<Job[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Filter state - multi-select
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newJobName, setNewJobName] = useState("")
  const [newJobDescription, setNewJobDescription] = useState("")
  const [newJobTags, setNewJobTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState("")
  const [newJobDueDate, setNewJobDueDate] = useState("")
  const [newJobOwnerId, setNewJobOwnerId] = useState("")
  const [newJobCollaboratorIds, setNewJobCollaboratorIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  
  // Team members for owner/collaborator selection
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string | null; email: string; isCurrentUser: boolean }[]>([])
  const [teamMembersLoading, setTeamMembersLoading] = useState(false)
  
  // Selection state
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])
  
  // Bulk action state
  const [isBulkLabelOpen, setIsBulkLabelOpen] = useState(false)
  const [bulkLabelInput, setBulkLabelInput] = useState("")
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const bulkLabelRef = useRef<HTMLDivElement>(null)
  
  // Delete confirmation state
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  
  // Saved views state
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false)
  const [newViewName, setNewViewName] = useState("")
  
  // Bulk upload state
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false)

  // Load saved views from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_VIEWS_KEY)
      if (stored) {
        setSavedViews(JSON.parse(stored))
      }
    } catch (e) {
      console.error("Error loading saved views:", e)
    }
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
      }
      if (bulkLabelRef.current && !bulkLabelRef.current.contains(event.target as Node)) {
        setIsBulkLabelOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // ============================================
  // Derived data
  // ============================================
  
  const allTags = Array.from(
    new Set(allJobs.flatMap(job => job.labels?.tags || []))
  ).sort()

  const hasActiveFilters = statusFilters.length > 0 || tagFilters.length > 0

  // Filter jobs client-side for search
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

  // ============================================
  // Data fetching
  // ============================================

  const fetchAllJobs = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setAllJobs(data.jobs || [])
      }
    } catch (error) {
      console.error("Error fetching all jobs:", error)
    }
  }, [])

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      // Support multiple statuses by fetching all and filtering client-side
      // Or if API supports it, pass comma-separated
      if (statusFilters.length === 1) {
        params.set("status", statusFilters[0])
      }
      if (tagFilters.length > 0) {
        params.set("tags", tagFilters.join(","))
      }
      
      const response = await fetch(`/api/jobs?${params.toString()}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        let fetchedJobs = data.jobs || []
        
        // Client-side filter for multiple statuses
        if (statusFilters.length > 1) {
          fetchedJobs = fetchedJobs.filter((job: Job) => statusFilters.includes(job.status))
        }
        
        setJobs(fetchedJobs)
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/jobs"
      }
    } catch (error) {
      console.error("Error fetching jobs:", error)
    } finally {
      setLoading(false)
    }
  }, [statusFilters, tagFilters])

  useEffect(() => { fetchAllJobs() }, [fetchAllJobs])
  useEffect(() => { fetchJobs() }, [fetchJobs])

  // Fetch team members when create modal opens
  const fetchTeamMembers = useCallback(async () => {
    if (teamMembers.length > 0) return // Already fetched
    setTeamMembersLoading(true)
    try {
      const response = await fetch("/api/org/team", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setTeamMembers(data.teamMembers || [])
        // Set current user as default owner
        const currentUser = data.teamMembers?.find((m: any) => m.isCurrentUser)
        if (currentUser && !newJobOwnerId) {
          setNewJobOwnerId(currentUser.id)
        }
      }
    } catch (error) {
      console.error("Error fetching team members:", error)
    } finally {
      setTeamMembersLoading(false)
    }
  }, [teamMembers.length, newJobOwnerId])

  useEffect(() => {
    if (isCreateOpen) {
      fetchTeamMembers()
    }
  }, [isCreateOpen, fetchTeamMembers])

  // ============================================
  // Handlers
  // ============================================

  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
  }

  const toggleTagFilter = (tag: string) => {
    setTagFilters(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const clearAllFilters = () => {
    setStatusFilters([])
    setTagFilters([])
  }

  const removeFilter = (type: "status" | "tag", value: string) => {
    if (type === "status") {
      setStatusFilters(prev => prev.filter(s => s !== value))
    } else {
      setTagFilters(prev => prev.filter(t => t !== value))
    }
  }

  const handleCreateJob = async () => {
    if (!newJobName.trim() || !newJobOwnerId || !newJobDueDate) return
    setCreating(true)
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newJobName.trim(),
          description: newJobDescription.trim() || undefined,
          tags: newJobTags.length > 0 ? newJobTags : undefined,
          dueDate: newJobDueDate,
          ownerId: newJobOwnerId
        })
      })
      if (response.ok) {
        const data = await response.json()
        
        // Add collaborators if any selected
        if (newJobCollaboratorIds.length > 0) {
          for (const collaboratorId of newJobCollaboratorIds) {
            await fetch(`/api/jobs/${data.job.id}/collaborators`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ userId: collaboratorId })
            })
          }
        }
        
        setJobs(prev => [data.job, ...prev])
        setAllJobs(prev => [data.job, ...prev])
        setNewJobName("")
        setNewJobDescription("")
        setNewJobTags([])
        setNewTagInput("")
        setNewJobDueDate("")
        setNewJobOwnerId("")
        setNewJobCollaboratorIds([])
        setIsCreateOpen(false)
        router.push(`/dashboard/jobs/${data.job.id}`)
      }
    } catch (error) {
      console.error("Error creating job:", error)
    } finally {
      setCreating(false)
    }
  }

  const handleAddNewTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newTagInput.trim()) {
      e.preventDefault()
      const tag = newTagInput.trim()
      if (!newJobTags.includes(tag)) {
        setNewJobTags(prev => [...prev, tag])
      }
      setNewTagInput("")
    }
  }

  // Selection handlers
  const isAllSelected = filteredJobs.length > 0 && selectedJobIds.length === filteredJobs.length
  const isSomeSelected = selectedJobIds.length > 0 && selectedJobIds.length < filteredJobs.length

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedJobIds([])
    } else {
      setSelectedJobIds(filteredJobs.map(j => j.id))
    }
  }

  const toggleSelectJob = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedJobIds(prev =>
      prev.includes(jobId)
        ? prev.filter(id => id !== jobId)
        : [...prev, jobId]
    )
  }

  const clearSelection = () => {
    setSelectedJobIds([])
  }

  // Bulk action handlers
  const handleBulkAddLabel = async (label: string) => {
    if (!label.trim() || selectedJobIds.length === 0) return
    
    setBulkActionLoading(true)
    try {
      // Update each selected job to add the label
      await Promise.all(selectedJobIds.map(async (jobId) => {
        const job = jobs.find(j => j.id === jobId)
        if (!job) return
        
        const currentTags = job.labels?.tags || []
        if (currentTags.includes(label.trim())) return // Already has this label
        
        const newTags = [...currentTags, label.trim()]
        
        await fetch(`/api/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tags: newTags })
        })
      }))
      
      // Refresh data
      await fetchJobs()
      await fetchAllJobs()
      setBulkLabelInput("")
      setIsBulkLabelOpen(false)
    } catch (error) {
      console.error("Error adding labels:", error)
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkDuplicate = async () => {
    if (selectedJobIds.length === 0) return
    
    setBulkActionLoading(true)
    try {
      // Duplicate each selected job
      for (const jobId of selectedJobIds) {
        const job = jobs.find(j => j.id === jobId)
        if (!job) continue
        
        await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: `${job.name} (Copy)`,
            description: job.description || undefined,
            tags: job.labels?.tags || undefined,
            dueDate: job.dueDate || undefined
          })
        })
      }
      
      // Refresh data
      await fetchJobs()
      await fetchAllJobs()
      setSelectedJobIds([])
    } catch (error) {
      console.error("Error duplicating items:", error)
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedJobIds.length === 0) return
    
    setBulkActionLoading(true)
    try {
      // Delete each selected job (hard delete)
      const results = await Promise.all(selectedJobIds.map(async (jobId) => {
        const response = await fetch(`/api/jobs/${jobId}?hard=true`, {
          method: "DELETE",
          credentials: "include"
        })
        return { jobId, ok: response.ok }
      }))
      
      const failed = results.filter(r => !r.ok)
      if (failed.length > 0) {
        console.error(`Failed to delete ${failed.length} items`)
      }
      
      // Refresh data
      await fetchJobs()
      await fetchAllJobs()
      setSelectedJobIds([])
      setIsDeleteConfirmOpen(false)
    } catch (error) {
      console.error("Error deleting items:", error)
    } finally {
      setBulkActionLoading(false)
    }
  }

  // Saved view handlers
  const handleSaveView = () => {
    if (!newViewName.trim()) return
    
    const newView: SavedView = {
      id: Date.now().toString(),
      name: newViewName.trim(),
      statusFilters: [...statusFilters],
      tagFilters: [...tagFilters]
    }
    
    const updatedViews = [...savedViews, newView]
    setSavedViews(updatedViews)
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(updatedViews))
    
    setNewViewName("")
    setIsSaveViewOpen(false)
    setActiveViewId(newView.id)
  }

  const handleApplyView = (view: SavedView) => {
    setStatusFilters(view.statusFilters)
    setTagFilters(view.tagFilters)
    setActiveViewId(view.id)
  }

  const handleDeleteView = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updatedViews = savedViews.filter(v => v.id !== viewId)
    setSavedViews(updatedViews)
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(updatedViews))
    if (activeViewId === viewId) {
      setActiveViewId(null)
    }
  }

  const handleClearViewSelection = () => {
    setActiveViewId(null)
    clearAllFilters()
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-4">
        {/* Saved Views + Action Row */}
        <div className="flex items-center gap-2 mb-4 mt-4">
          {/* Saved view pills */}
          {savedViews.map((view) => (
            <button
              key={view.id}
              onClick={() => handleApplyView(view)}
              className={`
                group flex items-center gap-2 px-4 py-2 
                border rounded-full
                text-sm font-medium
                transition-colors
                ${activeViewId === view.id
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 text-gray-600 hover:border-gray-400"
                }
              `}
            >
              {view.name}
              <span
                onClick={(e) => handleDeleteView(view.id, e)}
                className={`
                  opacity-0 group-hover:opacity-100 transition-opacity
                  hover:text-red-400
                  ${activeViewId === view.id ? "text-gray-400" : "text-gray-400"}
                `}
              >
                <X className="w-3.5 h-3.5" />
              </span>
            </button>
          ))}
          
          {/* Save New View button - only show when filters are active */}
          {hasActiveFilters && (
            <Dialog open={isSaveViewOpen} onOpenChange={setIsSaveViewOpen}>
              <DialogTrigger asChild>
                <button
                  className="
                    flex items-center gap-2 px-4 py-2 
                    border border-dashed border-gray-300 rounded-full
                    text-sm font-medium text-gray-500
                    hover:border-gray-400 hover:text-gray-600
                    transition-colors
                  "
                >
                  <Plus className="w-4 h-4" />
                  Save New View
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Save New View</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <p className="text-sm text-gray-600">
                    Enter a name for this view
                  </p>
                  <Input
                    placeholder="View Name"
                    value={newViewName}
                    onChange={(e) => setNewViewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newViewName.trim()) {
                        handleSaveView()
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsSaveViewOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveView}
                      disabled={!newViewName.trim()}
                      className="bg-gray-900 text-white hover:bg-gray-800"
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          
          {/* Spacer */}
          <div className="flex-1" />
          
          {/* AI Bulk Add Button */}
          <button
            className="
              flex items-center gap-2 px-4 py-2 
              border border-gray-200 rounded-full
              text-sm font-medium text-gray-700
              hover:border-purple-500 hover:text-purple-500
              transition-colors
            "
            onClick={() => setIsBulkUploadOpen(true)}
          >
            <Sparkles className="w-4 h-4 text-purple-500" />
            AI Bulk Add
          </button>
          
          {/* New Item CTA */}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <button className="
                flex items-center gap-2 px-4 py-2 
                border border-gray-200 rounded-full
                text-sm font-medium text-gray-700
                hover:border-orange-500 hover:text-orange-500
                transition-colors
              ">
                <Plus className="w-4 h-4 text-orange-500" />
                {UI_LABELS.newJob}
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{UI_LABELS.createJobModalTitle}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {/* MANDATORY FIELDS */}
                
                {/* Item Name */}
                <div>
                  <Label htmlFor="jobName">{UI_LABELS.jobNameLabel} <span className="text-red-500">*</span></Label>
                  <Input
                    id="jobName"
                    placeholder={UI_LABELS.jobNamePlaceholder}
                    value={newJobName}
                    onChange={(e) => setNewJobName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                {/* Owner */}
                <div>
                  <Label htmlFor="jobOwner">Owner <span className="text-red-500">*</span></Label>
                  <select
                    id="jobOwner"
                    value={newJobOwnerId}
                    onChange={(e) => setNewJobOwnerId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    disabled={teamMembersLoading}
                  >
                    {teamMembersLoading ? (
                      <option value="">Loading team members...</option>
                    ) : (
                      <>
                        <option value="">Select owner</option>
                        {teamMembers.map(member => (
                          <option key={member.id} value={member.id}>
                            {member.name || member.email} {member.isCurrentUser ? "(You)" : ""}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
                
                {/* Deadline */}
                <div>
                  <Label htmlFor="jobDueDate">Deadline <span className="text-red-500">*</span></Label>
                  <Input
                    id="jobDueDate"
                    type="date"
                    value={newJobDueDate}
                    onChange={(e) => setNewJobDueDate(e.target.value)}
                    className="mt-1"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                
                {/* Divider */}
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Optional</p>
                </div>
                
                {/* Description (optional) */}
                <div>
                  <Label htmlFor="jobDescription">{UI_LABELS.jobDescriptionLabel}</Label>
                  <Input
                    id="jobDescription"
                    placeholder={UI_LABELS.jobDescriptionPlaceholder}
                    value={newJobDescription}
                    onChange={(e) => setNewJobDescription(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                {/* Collaborators (optional) */}
                <div>
                  <Label>Collaborators</Label>
                  <div className="mt-2 space-y-2">
                    {/* Selected collaborators */}
                    {newJobCollaboratorIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {newJobCollaboratorIds.map(id => {
                          const member = teamMembers.find(m => m.id === id)
                          if (!member) return null
                          return (
                            <Chip
                              key={id}
                              label={member.name || member.email}
                              color="gray"
                              removable
                              onRemove={() => setNewJobCollaboratorIds(prev => prev.filter(cId => cId !== id))}
                            />
                          )
                        })}
                      </div>
                    )}
                    
                    {/* Available team members to add */}
                    {teamMembers.filter(m => 
                      m.id !== newJobOwnerId && !newJobCollaboratorIds.includes(m.id)
                    ).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {teamMembers
                          .filter(m => m.id !== newJobOwnerId && !newJobCollaboratorIds.includes(m.id))
                          .map(member => (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => setNewJobCollaboratorIds(prev => [...prev, member.id])}
                              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full hover:bg-gray-200 transition-colors"
                            >
                              + {member.name || member.email}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Labels (optional) */}
                <div>
                  <Label>Labels</Label>
                  <div className="mt-2">
                    {newJobTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {newJobTags.map(tag => (
                          <Chip
                            key={tag}
                            label={tag}
                            color="gray"
                            removable
                            onRemove={() => setNewJobTags(prev => prev.filter(t => t !== tag))}
                          />
                        ))}
                      </div>
                    )}
                    
                    {allTags.filter(t => !newJobTags.includes(t)).length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-gray-500 mb-1">Click to add:</p>
                        <div className="flex flex-wrap gap-1">
                          {allTags.filter(t => !newJobTags.includes(t)).slice(0, 8).map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setNewJobTags(prev => [...prev, tag])}
                              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full hover:bg-gray-200 transition-colors"
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <Input
                      placeholder="Or type a new label and press Enter"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={handleAddNewTag}
                    />
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <button
                    onClick={handleCreateJob}
                    disabled={!newJobName.trim() || !newJobOwnerId || !newJobDueDate || creating}
                    className="
                      px-4 py-2 rounded-md text-sm font-medium
                      bg-gray-900 text-white
                      hover:bg-gray-800
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors
                    "
                  >
                    {creating ? "Creating..." : UI_LABELS.createJob}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* AI Summary Panel */}
        <AISummaryPanel />

        {/* Search and Filter Row */}
        <div className="flex items-center gap-3 mb-4 mt-4">
          {/* Search */}
          <div className="relative flex-1 max-w-lg">
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-gray-200 rounded-full"
            />
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {/* Filter Dropdown */}
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
                  {statusFilters.length + tagFilters.length}
                </span>
              )}
            </button>

            {/* Filter Dropdown Panel */}
            {isFilterOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                {/* Status Section */}
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

                {/* Labels Section */}
                {allTags.length > 0 && (
                  <div className="p-3 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Labels</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {allTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleTagFilter(tag)}
                          className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-gray-50 text-sm text-left"
                        >
                          <span className="text-gray-700">{tag}</span>
                          {tagFilters.includes(tag) && (
                            <Check className="w-4 h-4 text-gray-900" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clear All */}
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
            {tagFilters.map(tag => (
              <button
                key={tag}
                onClick={() => removeFilter("tag", tag)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors"
              >
                {tag}
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

        {/* Bulk Action Toolbar */}
        {selectedJobIds.length > 0 && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-900 text-white rounded-lg">
            <span className="text-sm font-medium">
              {selectedJobIds.length} item{selectedJobIds.length !== 1 ? "s" : ""} selected
            </span>
            
            <div className="h-4 w-px bg-gray-600" />
            
            {/* Add Label */}
            <div className="relative" ref={bulkLabelRef}>
              <button
                onClick={() => setIsBulkLabelOpen(!isBulkLabelOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
                disabled={bulkActionLoading}
              >
                <Tag className="w-3.5 h-3.5" />
                Add Label
                <ChevronDown className="w-3 h-3" />
              </button>
              
              {isBulkLabelOpen && (
                <div className="absolute top-full mt-2 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Add label to selected items</div>
                  
                  {/* Existing labels */}
                  {allTags.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">Quick add:</p>
                      <div className="flex flex-wrap gap-1">
                        {allTags.slice(0, 6).map(tag => (
                          <button
                            key={tag}
                            onClick={() => handleBulkAddLabel(tag)}
                            className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full hover:bg-gray-200 transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Custom label input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Or type a new label..."
                      value={bulkLabelInput}
                      onChange={(e) => setBulkLabelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && bulkLabelInput.trim()) {
                          e.preventDefault()
                          handleBulkAddLabel(bulkLabelInput.trim())
                        }
                      }}
                      className="text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleBulkAddLabel(bulkLabelInput.trim())}
                      disabled={!bulkLabelInput.trim() || bulkActionLoading}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Duplicate */}
            <button
              onClick={handleBulkDuplicate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
              disabled={bulkActionLoading}
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </button>
            
            {/* Delete */}
            <button
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              disabled={bulkActionLoading}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
            
            <div className="flex-1" />
            
            {/* Clear Selection */}
            <button
              onClick={clearSelection}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Clear selection
            </button>
          </div>
        )}
        
        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete {selectedJobIds.length} item{selectedJobIds.length !== 1 ? "s" : ""}?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete {selectedJobIds.length === 1 ? "this item" : `these ${selectedJobIds.length} items`}? 
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
                  Cancel
                </Button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkActionLoading}
                  className="
                    px-4 py-2 rounded-md text-sm font-medium
                    bg-red-600 text-white
                    hover:bg-red-700
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors
                  "
                >
                  {bulkActionLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* AI Bulk Upload Modal */}
        <AIBulkUploadModal
          open={isBulkUploadOpen}
          onOpenChange={setIsBulkUploadOpen}
          onImportComplete={() => {
            fetchJobs()
            fetchAllJobs()
          }}
        />

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-lg">
            <EmptyState
              icon={<Briefcase className="w-6 h-6" />}
              title={hasActiveFilters || searchQuery ? "No matching items" : `No ${UI_LABELS.jobPlural.toLowerCase()} yet`}
              description={
                hasActiveFilters || searchQuery 
                  ? "Try adjusting your filters or search query"
                  : `Create your first ${UI_LABELS.jobSingular.toLowerCase()} to start organizing work`
              }
              action={
                hasActiveFilters || searchQuery 
                  ? { label: "Clear Filters", onClick: () => { clearAllFilters(); setSearchQuery(""); } }
                  : { label: UI_LABELS.createJob, onClick: () => setIsCreateOpen(true) }
              }
            />
          </div>
        ) : (
          /* Table-style list */
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[36px_minmax(180px,2fr)_minmax(80px,150px)_85px_40px_60px_90px_70px_65px_70px] gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider items-center">
              {/* Select All Checkbox */}
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeSelected
                  }}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                />
              </div>
              <div>Name</div>
              <div>Labels</div>
              <div>Status</div>
              <div className="text-center">RAG</div>
              <div className="text-center">Contacts</div>
              <div>Owner</div>
              <div>Collaborators</div>
              <div>Due</div>
              <div>Updated</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y divide-gray-100">
              {filteredJobs.map((job) => {
                const jobTags = job.labels?.tags || []
                const collaborators = job.collaborators || []
                const dueDate = job.dueDate ? new Date(job.dueDate) : null
                const daysUntilDue = dueDate ? differenceInDays(dueDate, new Date()) : null
                const isOverdue = daysUntilDue !== null && daysUntilDue < 0
                const ragRating = calculateRAGRating(job)
                const isSelected = selectedJobIds.includes(job.id)
                // Use stakeholderCount from API if available, otherwise fall back to labels count
                const contactCount = job.stakeholderCount ?? 0
                
                return (
                  <div
                    key={job.id}
                    onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                    className={`grid grid-cols-[36px_minmax(180px,2fr)_minmax(80px,150px)_85px_40px_60px_90px_70px_65px_70px] gap-2 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors items-center ${isSelected ? "bg-orange-50" : ""}`}
                  >
                    {/* Checkbox */}
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelectJob(job.id, e as unknown as React.MouseEvent)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                      />
                    </div>
                    
                    {/* Name */}
                    <div className="truncate min-w-0">
                      <span className="font-medium text-gray-900">
                        {job.name}
                      </span>
                    </div>
                    
                    {/* Labels */}
                    <div className="flex flex-wrap gap-1 overflow-hidden min-w-0">
                      {jobTags.length > 0 ? (
                        <>
                          {jobTags.slice(0, 2).map(tag => (
                            <span key={tag} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded truncate max-w-[70px]">
                              {tag}
                            </span>
                          ))}
                          {jobTags.length > 2 && (
                            <span className="text-xs text-gray-400 flex-shrink-0">+{jobTags.length - 2}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>
                    
                    {/* Status */}
                    <div>
                      <span className={`
                        inline-flex px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap
                        ${job.status === "ACTIVE" ? "border-gray-300 text-gray-700" : ""}
                        ${job.status === "WAITING" ? "border-amber-200 text-amber-700 bg-amber-50" : ""}
                        ${job.status === "COMPLETED" ? "border-green-200 text-green-700 bg-green-50" : ""}
                        ${job.status === "ARCHIVED" ? "border-gray-200 text-gray-500" : ""}
                        ${!["ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"].includes(job.status) ? "border-purple-200 text-purple-700 bg-purple-50" : ""}
                      `}>
                        {STATUS_OPTIONS.find(s => s.value === job.status)?.label || job.status}
                      </span>
                    </div>
                    
                    {/* RAG Rating */}
                    <div className="flex justify-center">
                      <RAGBadge rating={ragRating} />
                    </div>
                    
                    {/* Contacts Count */}
                    <div className="text-center">
                      {contactCount > 0 ? (
                        <span className="text-sm text-gray-600">{contactCount}</span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>
                    
                    {/* Owner */}
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">
                        {getInitials(job.owner.name, job.owner.email)}
                      </div>
                      <span className="text-sm text-gray-600 truncate">
                        {job.owner.name?.split(" ")[0] || job.owner.email.split("@")[0]}
                      </span>
                    </div>
                    
                    {/* Collaborators */}
                    <div className="flex items-center">
                      {collaborators.length > 0 ? (
                        <div className="flex -space-x-1.5">
                          {collaborators.slice(0, 2).map((collab) => (
                            <div
                              key={collab.id}
                              className="w-6 h-6 bg-gray-100 border-2 border-white rounded-full flex items-center justify-center text-gray-500 text-xs font-medium"
                              title={collab.user.name || collab.user.email}
                            >
                              {getInitials(collab.user.name, collab.user.email)}
                            </div>
                          ))}
                          {collaborators.length > 2 && (
                            <div className="w-6 h-6 bg-gray-100 border-2 border-white rounded-full flex items-center justify-center text-gray-500 text-xs font-medium">
                              +{collaborators.length - 2}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>
                    
                    {/* Due Date */}
                    <div>
                      {dueDate ? (
                        <span className={`text-sm ${isOverdue ? "text-red-600 font-medium" : "text-gray-600"}`}>
                          {format(dueDate, "d MMM")}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>
                    
                    {/* Updated */}
                    <div className="text-sm text-gray-500 truncate">
                      {formatDistanceToNow(new Date(job.updatedAt), { addSuffix: false })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
