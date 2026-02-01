"use client"

import { useState, useEffect, useCallback } from "react"
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
  Search, 
  CheckCircle,
  Loader2,
  Sparkles,
  Edit2,
  Check,
  X,
  Settings,
  Calendar,
  Users,
  Tag,
  Zap,
  ChevronDown
} from "lucide-react"
import { format } from "date-fns"
import { formatDateInTimezone, parseDateOnly } from "@/lib/utils/timezone"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { UI_LABELS } from "@/lib/ui-labels"
import { EmptyState } from "@/components/ui/empty-state"
import { AIBulkUploadModal } from "@/components/jobs/ai-bulk-upload-modal"
import { AISummaryPanel } from "@/components/jobs/ai-summary-panel"
// Onboarding checklist hidden for now - not at that product stage
// import { OnboardingChecklist } from "@/components/onboarding-checklist"
import { ConfigurableTable, JobRow } from "@/components/jobs/configurable-table"
import { EditBoardModal } from "@/components/boards/edit-board-modal"

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
  type?: "GENERIC" | "RECONCILIATION" | "TABLE" | "REPORTS"
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
  lineageId?: string | null
  stakeholderCount?: number
  notes?: string | null
  customFields?: Record<string, any>
  collectedItemCount?: number
}

interface BoardOwner {
  id: string
  name: string | null
  email: string
}

interface BoardCollaborator {
  id: string
  userId: string
  user: {
    id: string
    name: string | null
    email: string
  }
}

interface Board {
  id: string
  name: string
  status: string
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEAR_END" | "AD_HOC" | null
  periodStart: string | null
  periodEnd: string | null
  automationEnabled?: boolean
  skipWeekends?: boolean
  owner: BoardOwner | null
  collaborators: BoardCollaborator[]
}

// ============================================
// Main Component
// ============================================

export default function JobsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // User role state
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Board context from URL
  const boardId = searchParams.get("boardId")
  const [currentBoard, setCurrentBoard] = useState<Board | null>(null)
  const [organizationTimezone, setOrganizationTimezone] = useState<string | null>(null)
  
  // Data state
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newJobName, setNewJobName] = useState("")
  const [newJobType, setNewJobType] = useState<"GENERIC" | "RECONCILIATION" | "TABLE" | "REPORTS">("GENERIC")
  const [newJobDescription, setNewJobDescription] = useState("")
  const [newJobDueDate, setNewJobDueDate] = useState("")
  const [newJobOwnerId, setNewJobOwnerId] = useState("")
  const [newJobStakeholders, setNewJobStakeholders] = useState<JobStakeholder[]>([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  
  // Stakeholder scope (task category)
  const [stakeholderScope, setStakeholderScope] = useState<"accounting" | "employee" | "external">("accounting")
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [filteredContacts, setFilteredContacts] = useState<{ id: string; firstName: string; lastName: string | null; email: string | null; isInternal: boolean }[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  
  // Team members for owner selection
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string | null; email: string; isCurrentUser: boolean }[]>([])
  
  // Stakeholder options (tags/groups)
  const [availableContactTypes, setAvailableContactTypes] = useState<{ value: string; label: string; count: number }[]>([])
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string; memberCount: number }[]>([])
  const [stakeholderSearchQuery, setStakeholderSearchQuery] = useState("")
  const [stakeholderSearchResults, setStakeholderSearchResults] = useState<{ id: string; firstName: string; lastName: string | null; email: string | null }[]>([])
  const [stakeholderType, setStakeholderType] = useState<"contact_type" | "group" | "individual">("contact_type")
  
  // Bulk upload modal
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false)
  
  // Board name editing
  const [editingBoardName, setEditingBoardName] = useState(false)
  const [editBoardName, setEditBoardName] = useState("")
  
  // Board settings modal
  const [isBoardSettingsOpen, setIsBoardSettingsOpen] = useState(false)
  
  // Board metadata editing
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false)
  const [isOwnerPopoverOpen, setIsOwnerPopoverOpen] = useState(false)
  const [isCollaboratorPopoverOpen, setIsCollaboratorPopoverOpen] = useState(false)
  const [updatingBoard, setUpdatingBoard] = useState(false)

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
      // Always include archived - they appear in their own "Archived" group section
      params.set("includeArchived", "true")
      
      const response = await fetch(`/api/task-instances?${params.toString()}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setJobs(data.taskInstances || [])
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

  // Fetch user role to determine admin status
  const fetchUserRole = useCallback(async () => {
    try {
      const response = await fetch("/api/org/users", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        // The API returns isAdmin directly as a boolean
        setIsAdmin(data.isAdmin === true)
      }
    } catch (error) {
      console.error("Error fetching user role:", error)
    }
  }, [])

  useEffect(() => { fetchUserRole() }, [fetchUserRole])
  useEffect(() => { fetchJobs() }, [fetchJobs])
  useEffect(() => { fetchBoard() }, [fetchBoard])
  useEffect(() => { fetchTeamMembers() }, [fetchTeamMembers]) // Fetch team members on page load for inline editing
  useEffect(() => { 
    if (isCreateOpen) {
      fetchStakeholderOptions()
    }
  }, [isCreateOpen, fetchStakeholderOptions])
  
  // Fetch organization timezone
  useEffect(() => {
    const fetchOrgSettings = async () => {
      try {
        const response = await fetch("/api/org/accounting-calendar")
        if (response.ok) {
          const data = await response.json()
          setOrganizationTimezone(data.timezone || null)
        }
      } catch (error) {
        console.error("Error fetching org settings:", error)
      }
    }
    fetchOrgSettings()
  }, [])

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
  
  // Fetch filtered contacts when tags are selected for employee/external scope
  useEffect(() => {
    if (stakeholderScope === "accounting" || selectedTagIds.length === 0) {
      setFilteredContacts([])
      return
    }
    
    const fetchFilteredContacts = async () => {
      setLoadingContacts(true)
      try {
        const isInternal = stakeholderScope === "employee"
        const params = new URLSearchParams()
        params.set("tagIds", selectedTagIds.join(","))
        params.set("isInternal", String(isInternal))
        
        const response = await fetch(`/api/entities?${params.toString()}`, { credentials: "include" })
        if (response.ok) {
          const data = await response.json()
          const entities = Array.isArray(data) ? data : (data.entities || [])
          setFilteredContacts(entities.map((e: any) => ({
            id: e.id,
            firstName: e.firstName,
            lastName: e.lastName,
            email: e.email,
            isInternal: e.isInternal ?? false
          })))
        }
      } catch (error) {
        console.error("Error fetching filtered contacts:", error)
      } finally {
        setLoadingContacts(false)
      }
    }
    
    fetchFilteredContacts()
  }, [stakeholderScope, selectedTagIds])

  // ============================================
  // Handlers
  // ============================================

  const handleStatusChange = async (jobId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/task-instances/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      })
      if (response.ok) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
      }
    } catch (error) {
      console.error("Error updating status:", error)
    }
  }

  const handleDelete = async (jobId: string) => {
    try {
      const response = await fetch(`/api/task-instances/${jobId}`, { method: "DELETE" })
      if (response.ok) {
        setJobs(prev => prev.filter(j => j.id !== jobId))
      }
    } catch (error) {
      console.error("Error deleting task instance:", error)
    }
  }

  // Handler for inline cell updates from ConfigurableTable
  const handleJobUpdate = async (jobId: string, updates: Record<string, any>) => {
    try {
      const response = await fetch(`/api/task-instances/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      })
      if (response.ok) {
        const data = await response.json()
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates, owner: data.taskInstance?.owner || j.owner } : j))
      } else {
        throw new Error("Failed to update")
      }
    } catch (error) {
      console.error("Error updating task instance:", error)
      throw error
    }
  }

  const handleDuplicate = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    
    try {
      const response = await fetch("/api/task-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: `${job.name} (Copy)`,
          description: job.description,
          dueDate: job.dueDate,
          ownerId: job.ownerId,
          labels: job.labels,
          boardId: boardId || undefined,
          type: job.type,
          lineageId: job.lineageId
        })
      })
      if (response.ok) {
        const data = await response.json()
        setJobs(prev => [data.taskInstance, ...prev])
      }
    } catch (error) {
      console.error("Error duplicating task instance:", error)
    }
  }

  // Bulk delete/archive handler
  const handleBulkDelete = async (jobIds: string[]) => {
    const selectedJobs = jobs.filter(j => jobIds.includes(j.id))
    const deletableJobs = selectedJobs.filter(j => (j.taskCount || 0) === 0)
    const archiveOnlyJobs = selectedJobs.filter(j => (j.taskCount || 0) > 0)
    
    let confirmMessage = ""
    if (deletableJobs.length > 0 && archiveOnlyJobs.length > 0) {
      confirmMessage = `${deletableJobs.length} task(s) will be permanently deleted. ${archiveOnlyJobs.length} task(s) have requests and will be archived instead. Continue?`
    } else if (archiveOnlyJobs.length > 0) {
      confirmMessage = `${archiveOnlyJobs.length} task(s) have requests and will be archived (not deleted). Continue?`
    } else {
      confirmMessage = `Permanently delete ${deletableJobs.length} task(s)? This cannot be undone.`
    }
    
    if (!confirm(confirmMessage)) return
    
    try {
      await Promise.all(
        deletableJobs.map(j => 
          fetch(`/api/task-instances/${j.id}?hard=true`, { method: "DELETE" })
        )
      )
      
      await Promise.all(
        archiveOnlyJobs.map(j => 
          fetch(`/api/task-instances/${j.id}`, { method: "DELETE" })
        )
      )
      
      setJobs(prev => prev.filter(j => !jobIds.includes(j.id)))
    } catch (error) {
      console.error("Error deleting/archiving tasks:", error)
    }
  }

  // Bulk duplicate handler
  const handleBulkDuplicate = async (jobIds: string[]) => {
    const jobsToDuplicate = jobs.filter(j => jobIds.includes(j.id))
    
    try {
      const newJobs = await Promise.all(
        jobsToDuplicate.map(async (job) => {
          const response = await fetch("/api/task-instances", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              name: `${job.name} (Copy)`,
              description: job.description,
              dueDate: job.dueDate,
              ownerId: job.ownerId,
              labels: job.labels,
              boardId: boardId || undefined,
              type: job.type,
              lineageId: job.lineageId
            })
          })
          if (response.ok) {
            const data = await response.json()
            return data.taskInstance
          }
          return null
        })
      )
      
      const validNewJobs = newJobs.filter(j => j !== null)
      setJobs(prev => [...validNewJobs, ...prev])
    } catch (error) {
      console.error("Error duplicating tasks:", error)
    }
  }

  // Update board name
  const handleUpdateBoardName = async () => {
    if (!currentBoard || !editBoardName.trim() || editBoardName === currentBoard.name) {
      setEditingBoardName(false)
      return
    }
    
    try {
      const response = await fetch(`/api/boards/${currentBoard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: editBoardName.trim() })
      })
      
      if (response.ok) {
        setCurrentBoard({ ...currentBoard, name: editBoardName.trim() })
      }
    } catch (error) {
      console.error("Error updating board name:", error)
    } finally {
      setEditingBoardName(false)
    }
  }

  // Update board field
  const handleUpdateBoard = async (updates: Partial<Board>) => {
    if (!currentBoard) return
    setUpdatingBoard(true)
    try {
      const response = await fetch(`/api/boards/${currentBoard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates)
      })
      
      if (response.ok) {
        const data = await response.json()
        setCurrentBoard(data.board || { ...currentBoard, ...updates })
      }
    } catch (error) {
      console.error("Error updating board:", error)
    } finally {
      setUpdatingBoard(false)
      setIsStatusDropdownOpen(false)
      setIsOwnerPopoverOpen(false)
      setIsCollaboratorPopoverOpen(false)
    }
  }

  // Helper to get initials
  const getInitials = (name: string | null, email: string) => {
    if (name) {
      const parts = name.split(" ")
      return parts.length >= 2 
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : name.substring(0, 2).toUpperCase()
    }
    return email.substring(0, 2).toUpperCase()
  }

  // Board status badge
  const getBoardStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
      NOT_STARTED: { label: "Not Started", bg: "bg-gray-100", text: "text-gray-700" },
      IN_PROGRESS: { label: "In Progress", bg: "bg-blue-100", text: "text-blue-700" },
      COMPLETE: { label: "Complete", bg: "bg-green-100", text: "text-green-700" },
      BLOCKED: { label: "Blocked", bg: "bg-red-100", text: "text-red-700" },
      ARCHIVED: { label: "Archived", bg: "bg-gray-100", text: "text-gray-500" },
    }
    const config = statusConfig[status] || statusConfig.NOT_STARTED
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    )
  }

  // Board cadence badge
  const getCadenceBadge = (cadence: string | null) => {
    const cadenceLabels: Record<string, string> = {
      DAILY: "Daily",
      WEEKLY: "Weekly",
      MONTHLY: "Monthly",
      QUARTERLY: "Quarterly",
      YEAR_END: "Year-End",
      AD_HOC: "Ad Hoc",
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
        {cadenceLabels[cadence || "AD_HOC"] || cadence}
      </span>
    )
  }

  const handleCreateJob = async () => {
    // Validation: name, owner, due date required
    // For employee/external scope, must select tags first
    if (!newJobName.trim() || !newJobOwnerId || !newJobDueDate) return
    if (stakeholderScope !== "accounting" && selectedTagIds.length === 0) return
    
    setCreating(true)
    setCreateError(null)
    try {
      const isRecurring = currentBoard && currentBoard.cadence && currentBoard.cadence !== "AD_HOC"
      
      const response = await fetch("/api/task-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newJobName.trim(),
          description: newJobDescription.trim() || undefined,
          dueDate: newJobDueDate,
          ownerId: newJobOwnerId,
          stakeholders: newJobStakeholders.length > 0 ? newJobStakeholders : undefined,
          boardId: boardId || undefined,
          type: newJobType,
          stakeholderScope,
          createLineage: isRecurring
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.message || "Failed to create task")
      }
      
      const data = await response.json()
      const newInstance = data.taskInstance
      setJobs(prev => [newInstance, ...prev])
      resetCreateForm()
      setIsCreateOpen(false)
      router.push(`/dashboard/jobs/${newInstance.id}`)
    } catch (error: any) {
      console.error("Error creating task instance:", error)
      setCreateError(error.message || "Failed to create task")
    } finally {
      setCreating(false)
    }
  }

  const resetCreateForm = () => {
    setNewJobName("")
    setNewJobType("GENERIC")
    setNewJobDescription("")
    setNewJobDueDate("")
    setNewJobOwnerId(teamMembers.find(m => m.isCurrentUser)?.id || "")
    setNewJobStakeholders([])
    setStakeholderSearchQuery("")
    setStakeholderSearchResults([])
    setStakeholderScope("accounting")
    setSelectedTagIds([])
    setFilteredContacts([])
    setCreateError(null)
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

  // Transform jobs to JobRow format for ConfigurableTable
  const jobRows: JobRow[] = filteredJobs.map(job => ({
    id: job.id,
    name: job.name,
    type: job.type || "GENERIC",
    status: job.status,
    ownerId: job.ownerId,
    ownerName: job.owner.name,
    ownerEmail: job.owner.email,
    dueDate: job.dueDate,
    notes: job.notes || null,
    customFields: job.customFields,
    collectedItemCount: job.collectedItemCount || 0,
    taskCount: job.taskCount || 0,
    respondedCount: job.respondedCount || 0
  }))

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
      <div className="w-full px-6 py-6">
        {/* Onboarding checklist hidden for now - not at that product stage */}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1">
            {currentBoard ? (
              <>
                {/* Board Name Row */}
                <div className="flex items-center gap-2 mb-2">
                  {editingBoardName ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editBoardName}
                        onChange={(e) => setEditBoardName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdateBoardName()
                          if (e.key === "Escape") {
                            setEditingBoardName(false)
                            setEditBoardName(currentBoard.name)
                          }
                        }}
                        className="text-2xl font-semibold h-auto py-1 px-2 w-64"
                        autoFocus
                      />
                      <button
                        onClick={handleUpdateBoardName}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingBoardName(false)
                          setEditBoardName(currentBoard.name)
                        }}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-2xl font-semibold text-gray-900">
                        {currentBoard.name}
                      </h1>
                      <button
                        onClick={() => {
                          setEditBoardName(currentBoard.name)
                          setEditingBoardName(true)
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        title="Edit board name"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  
                  {/* Status Dropdown */}
                  <div className="relative ml-2">
                    <button
                      onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                      className="flex items-center gap-1 hover:opacity-80"
                      disabled={updatingBoard}
                    >
                      {getBoardStatusBadge(currentBoard.status)}
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    </button>
                    {isStatusDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsStatusDropdownOpen(false)} />
                        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[160px]">
                          <div className="py-1">
                            {["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "BLOCKED"].map(status => (
                              <button
                                key={status}
                                onClick={() => handleUpdateBoard({ status })}
                                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${currentBoard.status === status ? "bg-gray-50 font-medium" : ""}`}
                              >
                                {getBoardStatusBadge(status)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                <p className="text-sm text-gray-500 mb-3">{filteredJobs.length} tasks</p>
                
                {/* Board Metadata Section */}
                <div className="space-y-2 pb-4 border-b border-gray-100 mb-4">
                  {/* Period Row */}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-700">Period:</span>
                    <span className="text-gray-600">
                      {currentBoard.periodStart && currentBoard.periodEnd
                        ? `${format(parseDateOnly(currentBoard.periodStart), "MMM d, yyyy")} - ${format(parseDateOnly(currentBoard.periodEnd), "MMM d, yyyy")}`
                        : currentBoard.periodStart
                        ? format(parseDateOnly(currentBoard.periodStart), "MMM d, yyyy")
                        : "Not set"}
                    </span>
                  </div>
                  
                  {/* Board Type Row */}
                  <div className="flex items-center gap-2 text-sm">
                    <Tag className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-700">Type:</span>
                    {getCadenceBadge(currentBoard.cadence)}
                  </div>
                  
                  {/* Owner Row */}
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-700">Owner:</span>
                    <Popover open={isOwnerPopoverOpen} onOpenChange={setIsOwnerPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 hover:bg-gray-100 rounded px-2 py-1 -ml-2">
                          {currentBoard.owner ? (
                            <>
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">
                                  {getInitials(currentBoard.owner.name, currentBoard.owner.email)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-gray-700">{currentBoard.owner.name || currentBoard.owner.email}</span>
                            </>
                          ) : (
                            <span className="text-gray-400 italic">No owner</span>
                          )}
                          <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="space-y-1">
                          {teamMembers.map(member => (
                            <button
                              key={member.id}
                              onClick={() => {
                                handleUpdateBoard({ ownerId: member.id } as any)
                                setIsOwnerPopoverOpen(false)
                              }}
                              className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-gray-100 ${currentBoard.owner?.id === member.id ? "bg-gray-100" : ""}`}
                            >
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">
                                  {getInitials(member.name, member.email)}
                                </AvatarFallback>
                              </Avatar>
                              <span>{member.name || member.email}</span>
                              {member.isCurrentUser && <span className="text-xs text-gray-400">(you)</span>}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    
                    {/* Collaborators */}
                    {currentBoard.collaborators && currentBoard.collaborators.length > 0 && (
                      <div className="flex items-center gap-1 ml-2">
                        {currentBoard.collaborators.slice(0, 3).map(collab => (
                          <Avatar key={collab.id} className="h-5 w-5 border-2 border-white -ml-1 first:ml-0">
                            <AvatarFallback className="text-[10px] bg-gray-100 text-gray-700">
                              {getInitials(collab.user.name, collab.user.email)}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {currentBoard.collaborators.length > 3 && (
                          <span className="text-xs text-gray-500 ml-1">+{currentBoard.collaborators.length - 3}</span>
                        )}
                      </div>
                    )}
                    
                    <Popover open={isCollaboratorPopoverOpen} onOpenChange={setIsCollaboratorPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded border border-dashed border-gray-300 ml-1">
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {teamMembers
                            .filter(m => m.id !== currentBoard.owner?.id && !currentBoard.collaborators?.some(c => c.userId === m.id))
                            .map(member => (
                              <button
                                key={member.id}
                                onClick={() => {
                                  const newCollaboratorIds = [...(currentBoard.collaborators?.map(c => c.userId) || []), member.id]
                                  handleUpdateBoard({ collaboratorIds: newCollaboratorIds } as any)
                                  setIsCollaboratorPopoverOpen(false)
                                }}
                                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-gray-100"
                              >
                                <Avatar className="h-5 w-5">
                                  <AvatarFallback className="text-[10px] bg-gray-100 text-gray-700">
                                    {getInitials(member.name, member.email)}
                                  </AvatarFallback>
                                </Avatar>
                                <span>{member.name || member.email}</span>
                              </button>
                            ))}
                          {teamMembers.filter(m => m.id !== currentBoard.owner?.id && !currentBoard.collaborators?.some(c => c.userId === m.id)).length === 0 && (
                            <p className="text-sm text-gray-500 py-2 text-center">No more team members</p>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  {/* Automation Row */}
                  <div className="flex items-center gap-4 text-sm">
                    <Zap className="w-4 h-4 text-gray-400" />
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700">Auto-create next period:</span>
                      <Switch
                        checked={currentBoard.automationEnabled ?? false}
                        onCheckedChange={(checked) => handleUpdateBoard({ automationEnabled: checked } as any)}
                        disabled={updatingBoard}
                      />
                    </div>
{/* Skip weekends hidden - always enabled by default */}
                  </div>
                </div>
              </>
            ) : (
              <h1 className="text-2xl font-semibold text-gray-900">
                All Tasks
              </h1>
            )}
          </div>
          
          {isAdmin && (
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
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Task</DialogTitle>
              </DialogHeader>
              
              {/* Error display */}
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                  {createError}
                </div>
              )}
              
              <div className="space-y-4 pt-2">
                {/* Task Category Selection */}
                <div>
                  <Label className="text-sm font-medium">Task Category <span className="text-red-500">*</span></Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStakeholderScope("accounting")
                        setSelectedTagIds([])
                        setNewJobStakeholders([])
                      }}
                      className={`p-3 border rounded-lg text-left transition-colors ${
                        stakeholderScope === "accounting" 
                          ? "border-blue-500 bg-blue-50" 
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-medium text-sm">Accounting</div>
                      <div className="text-xs text-gray-500 mt-0.5">Internal team task</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStakeholderScope("employee")
                        setSelectedTagIds([])
                        setNewJobStakeholders([])
                      }}
                      className={`p-3 border rounded-lg text-left transition-colors ${
                        stakeholderScope === "employee" 
                          ? "border-blue-500 bg-blue-50" 
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-medium text-sm">Employee Request</div>
                      <div className="text-xs text-gray-500 mt-0.5">Internal stakeholders</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStakeholderScope("external")
                        setSelectedTagIds([])
                        setNewJobStakeholders([])
                      }}
                      className={`p-3 border rounded-lg text-left transition-colors ${
                        stakeholderScope === "external" 
                          ? "border-blue-500 bg-blue-50" 
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-medium text-sm">External Request</div>
                      <div className="text-xs text-gray-500 mt-0.5">Clients, vendors, etc.</div>
                    </button>
                  </div>
                </div>

                {/* Task Name & Type - Side by side */}
                <div className="grid grid-cols-[1fr,140px] gap-3">
                  <div>
                    <Label htmlFor="taskName" className="text-sm">Task Name <span className="text-red-500">*</span></Label>
                    <Input
                      id="taskName"
                      value={newJobName}
                      onChange={(e) => setNewJobName(e.target.value)}
                      placeholder="e.g., Collect W-9 forms"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="taskType" className="text-sm">Type</Label>
                    <select
                      id="taskType"
                      value={newJobType}
                      onChange={(e) => setNewJobType(e.target.value as any)}
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="GENERIC">Standard</option>
                      <option value="REPORTS">Report</option>
                    </select>
                  </div>
                </div>

                {/* Owner & Due Date - Side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="owner" className="text-sm">Owner <span className="text-red-500">*</span></Label>
                    <select
                      id="owner"
                      value={newJobOwnerId}
                      onChange={(e) => setNewJobOwnerId(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="">Select...</option>
                      {teamMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name || member.email} {member.isCurrentUser ? "(You)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="dueDate" className="text-sm">Due Date <span className="text-red-500">*</span></Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={newJobDueDate}
                      onChange={(e) => setNewJobDueDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Stakeholder Selection - Different UI based on scope */}
                {stakeholderScope === "accounting" ? (
                  /* Accounting: Optional stakeholder selection */
                  <div>
                    <Label className="text-sm">Stakeholders <span className="text-gray-400">(optional)</span></Label>
                    
                    {/* Selected stakeholders */}
                    {newJobStakeholders.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 mb-2">
                        {newJobStakeholders.map((s) => (
                          <span
                            key={`${s.type}-${s.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs"
                          >
                            {s.name}
                            <button onClick={() => handleRemoveStakeholder(s.type, s.id)} className="hover:text-blue-600">×</button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Compact stakeholder selection */}
                    <div className="flex gap-2 mt-1">
                      <Select value={stakeholderType} onValueChange={(v) => setStakeholderType(v as any)}>
                        <SelectTrigger className="w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contact_type">Type</SelectItem>
                          <SelectItem value="group">Tag</SelectItem>
                          <SelectItem value="individual">Person</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <div className="flex-1">
                        {stakeholderType === "contact_type" && (
                          <Select onValueChange={(v) => {
                            const type = availableContactTypes.find(t => t.value === v)
                            if (type && !newJobStakeholders.some(s => s.type === "contact_type" && s.id === type.value)) {
                              handleAddStakeholder("contact_type", type.value, type.label)
                            }
                          }}>
                            <SelectTrigger className="text-xs">
                              <SelectValue placeholder="Select type..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableContactTypes.map(type => (
                                <SelectItem key={type.value} value={type.value} disabled={newJobStakeholders.some(s => s.type === "contact_type" && s.id === type.value)}>
                                  {type.label} ({type.count})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        {stakeholderType === "group" && (
                          <Select onValueChange={(v) => {
                            const group = availableGroups.find(g => g.id === v)
                            if (group && !newJobStakeholders.some(s => s.type === "group" && s.id === group.id)) {
                              handleAddStakeholder("group", group.id, group.name)
                            }
                          }}>
                            <SelectTrigger className="text-xs">
                              <SelectValue placeholder="Select tag..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableGroups.map(group => (
                                <SelectItem key={group.id} value={group.id} disabled={newJobStakeholders.some(s => s.type === "group" && s.id === group.id)}>
                                  {group.name} ({group.memberCount})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        {stakeholderType === "individual" && (
                          <div className="relative">
                            <Input
                              placeholder="Search contacts..."
                              value={stakeholderSearchQuery}
                              onChange={(e) => setStakeholderSearchQuery(e.target.value)}
                              className="text-xs"
                            />
                            {stakeholderSearchQuery.length >= 2 && stakeholderSearchResults.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 max-h-32 overflow-y-auto border rounded-md bg-white shadow-lg">
                                {stakeholderSearchResults.map((contact) => (
                                  <button
                                    key={contact.id}
                                    onClick={() => handleAddStakeholder("individual", contact.id, `${contact.firstName} ${contact.lastName || ""}`.trim())}
                                    disabled={newJobStakeholders.some(s => s.type === "individual" && s.id === contact.id)}
                                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 border-b last:border-b-0 disabled:opacity-50"
                                  >
                                    {contact.firstName} {contact.lastName} <span className="text-gray-400">{contact.email}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Employee/External: Tag-first selection */
                  <div className="space-y-3">
                    {/* Step 1: Select Tags */}
                    <div>
                      <Label className="text-sm">
                        Select Tags <span className="text-red-500">*</span>
                        <span className="text-xs text-gray-500 ml-2">
                          (Filter {stakeholderScope === "employee" ? "internal" : "external"} contacts by tag)
                        </span>
                      </Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {availableGroups.map(group => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => {
                              setSelectedTagIds(prev => 
                                prev.includes(group.id) 
                                  ? prev.filter(id => id !== group.id)
                                  : [...prev, group.id]
                              )
                              // Clear individual stakeholders when changing tags
                              setNewJobStakeholders([])
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              selectedTagIds.includes(group.id)
                                ? "bg-blue-100 border-blue-300 text-blue-800"
                                : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            {group.name} ({group.memberCount})
                          </button>
                        ))}
                        {availableGroups.length === 0 && (
                          <p className="text-sm text-gray-500">No tags available. Create tags in Contacts first.</p>
                        )}
                      </div>
                    </div>

                    {/* Step 2: Show filtered contacts (only after tags selected) */}
                    {selectedTagIds.length > 0 && (
                      <div>
                        <Label className="text-sm">
                          Stakeholders
                          <span className="text-xs text-gray-500 ml-2">
                            ({filteredContacts.length} {stakeholderScope === "employee" ? "internal" : "external"} contacts in selected tags)
                          </span>
                        </Label>
                        
                        {/* Selected stakeholders */}
                        {newJobStakeholders.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2 mb-2">
                            {newJobStakeholders.map((s) => (
                              <span
                                key={`${s.type}-${s.id}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs"
                              >
                                {s.name}
                                <button onClick={() => handleRemoveStakeholder(s.type, s.id)} className="hover:text-blue-600">×</button>
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {loadingContacts ? (
                          <div className="text-sm text-gray-500 py-2">Loading contacts...</div>
                        ) : filteredContacts.length === 0 ? (
                          <div className="text-sm text-gray-500 py-2">
                            No {stakeholderScope === "employee" ? "internal" : "external"} contacts found in selected tags.
                          </div>
                        ) : (
                          <div className="mt-2 border rounded-md max-h-40 overflow-y-auto">
                            <div className="p-2 border-b bg-gray-50 flex items-center justify-between">
                              <span className="text-xs text-gray-600">Select all</span>
                              <input
                                type="checkbox"
                                checked={filteredContacts.length > 0 && newJobStakeholders.length === filteredContacts.length}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNewJobStakeholders(filteredContacts.map(c => ({
                                      type: "individual" as const,
                                      id: c.id,
                                      name: `${c.firstName} ${c.lastName || ""}`.trim()
                                    })))
                                  } else {
                                    setNewJobStakeholders([])
                                  }
                                }}
                                className="rounded"
                              />
                            </div>
                            {filteredContacts.map(contact => (
                              <label
                                key={contact.id}
                                className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                              >
                                <div>
                                  <span className="text-sm">{contact.firstName} {contact.lastName}</span>
                                  {contact.email && (
                                    <span className="text-xs text-gray-400 ml-2">{contact.email}</span>
                                  )}
                                </div>
                                <input
                                  type="checkbox"
                                  checked={newJobStakeholders.some(s => s.type === "individual" && s.id === contact.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      handleAddStakeholder("individual", contact.id, `${contact.firstName} ${contact.lastName || ""}`.trim())
                                    } else {
                                      handleRemoveStakeholder("individual", contact.id)
                                    }
                                  }}
                                  className="rounded"
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Description - Collapsible/optional */}
                <div>
                  <Label htmlFor="description" className="text-sm text-gray-500">Description (optional)</Label>
                  <Input
                    id="description"
                    value={newJobDescription}
                    onChange={(e) => setNewJobDescription(e.target.value)}
                    placeholder="Optional description..."
                    className="mt-1"
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => { resetCreateForm(); setIsCreateOpen(false); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateJob}
                    disabled={
                      !newJobName.trim() || 
                      !newJobOwnerId || 
                      !newJobDueDate || 
                      (stakeholderScope !== "accounting" && selectedTagIds.length === 0) ||
                      creating
                    }
                  >
                    {creating ? "Creating..." : "Create Task"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </div>
          )}
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative max-w-sm">
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

        {/* Configurable Task Table */}
        {filteredJobs.length === 0 && !searchQuery ? (
          <EmptyState
            icon={<CheckCircle className="w-12 h-12 text-gray-300" />}
            title="No tasks yet"
            description={isAdmin 
              ? (currentBoard 
                  ? "Create your first task in this board"
                  : "Create a board and add tasks to get started")
              : "You don't have any tasks assigned to you yet. Ask an admin to add you as a collaborator."
            }
            action={isAdmin ? {
              label: "Create Task",
              onClick: () => setIsCreateOpen(true)
            } : undefined}
          />
        ) : filteredJobs.length === 0 && searchQuery ? (
          <div className="text-center py-12 text-gray-500">
            No tasks match "{searchQuery}"
          </div>
        ) : (
          <ConfigurableTable
            jobs={jobRows}
            teamMembers={teamMembers}
            boardId={boardId}
            onJobUpdate={handleJobUpdate}
            onAddTask={isAdmin ? () => setIsCreateOpen(true) : undefined}
            onDelete={isAdmin ? handleBulkDelete : undefined}
            onDuplicate={isAdmin ? handleBulkDuplicate : undefined}
          />
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
      
      {/* Board Settings Modal */}
      {currentBoard && (
        <EditBoardModal
          open={isBoardSettingsOpen}
          onOpenChange={setIsBoardSettingsOpen}
          board={currentBoard as any}
          onBoardUpdated={(updatedBoard) => {
            setCurrentBoard(updatedBoard)
            setIsBoardSettingsOpen(false)
          }}
        />
      )}
    </div>
  )
}
