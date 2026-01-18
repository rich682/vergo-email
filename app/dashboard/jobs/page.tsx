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
  Sparkles
} from "lucide-react"
import { UI_LABELS } from "@/lib/ui-labels"
import { EmptyState } from "@/components/ui/empty-state"
import { AIBulkUploadModal } from "@/components/jobs/ai-bulk-upload-modal"
import { AISummaryPanel } from "@/components/jobs/ai-summary-panel"
import { OnboardingChecklist } from "@/components/onboarding-checklist"
import { ConfigurableTable, JobRow } from "@/components/jobs/configurable-table"

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
  notes?: string | null
  customFields?: Record<string, any>
  collectedItemCount?: number
}

interface Board {
  id: string
  name: string
  status: string
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
  useEffect(() => { fetchTeamMembers() }, [fetchTeamMembers]) // Fetch team members on page load for inline editing
  useEffect(() => { 
    if (isCreateOpen) {
      fetchStakeholderOptions()
    }
  }, [isCreateOpen, fetchStakeholderOptions])

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
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" })
      if (response.ok) {
        setJobs(prev => prev.filter(j => j.id !== jobId))
      }
    } catch (error) {
      console.error("Error deleting job:", error)
    }
  }

  // Handler for inline cell updates from ConfigurableTable
  const handleJobUpdate = async (jobId: string, updates: Record<string, any>) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      })
      if (response.ok) {
        const data = await response.json()
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates, owner: data.job?.owner || j.owner } : j))
      } else {
        throw new Error("Failed to update")
      }
    } catch (error) {
      console.error("Error updating job:", error)
      throw error
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

  // Bulk delete handler
  const handleBulkDelete = async (jobIds: string[]) => {
    try {
      await Promise.all(
        jobIds.map(id => 
          fetch(`/api/jobs/${id}`, { method: "DELETE" })
        )
      )
      setJobs(prev => prev.filter(j => !jobIds.includes(j.id)))
    } catch (error) {
      console.error("Error deleting jobs:", error)
    }
  }

  // Bulk duplicate handler
  const handleBulkDuplicate = async (jobIds: string[]) => {
    const jobsToDuplicate = jobs.filter(j => jobIds.includes(j.id))
    
    try {
      const newJobs = await Promise.all(
        jobsToDuplicate.map(async (job) => {
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
            return data.job
          }
          return null
        })
      )
      
      const validNewJobs = newJobs.filter(j => j !== null)
      setJobs(prev => [...validNewJobs, ...prev])
    } catch (error) {
      console.error("Error duplicating jobs:", error)
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

  // Transform jobs to JobRow format for ConfigurableTable
  const jobRows: JobRow[] = filteredJobs.map(job => ({
    id: job.id,
    name: job.name,
    status: job.status,
    ownerId: job.ownerId,
    ownerName: job.owner.name,
    ownerEmail: job.owner.email,
    dueDate: job.dueDate,
    notes: job.notes || null,
    customFields: job.customFields,
    collectedItemCount: job.collectedItemCount || 0
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
        {/* Onboarding Checklist - shows for new users */}
        <OnboardingChecklist />

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
          <ConfigurableTable
            jobs={jobRows}
            teamMembers={teamMembers}
            boardId={boardId}
            onJobUpdate={handleJobUpdate}
            onAddTask={() => setIsCreateOpen(true)}
            onDelete={handleBulkDelete}
            onDuplicate={handleBulkDuplicate}
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
    </div>
  )
}
