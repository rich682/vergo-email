"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { 
  ArrowLeft, Edit2, Save, X, Trash2, Calendar, Users, CheckCircle, 
  Clock, Archive, Mail, User, UserPlus, MessageSquare, Send, AlertCircle,
  Plus, ChevronDown, ChevronUp, Bell, RefreshCw, Tag, Building2, MoreHorizontal,
  FileText, Inbox
} from "lucide-react"
import { formatDistanceToNow, format, differenceInDays, differenceInHours } from "date-fns"
import { UI_LABELS } from "@/lib/ui-labels"

// Design system components
import { Chip } from "@/components/ui/chip"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { SectionHeader } from "@/components/ui/section-header"

// ============================================
// Types
// ============================================

interface JobOwner {
  id: string
  name: string | null
  email: string
}

interface JobCollaborator {
  id: string
  userId: string
  role: string
  addedAt: string
  user: { id: string; name: string | null; email: string }
}

interface JobComment {
  id: string
  jobId: string
  authorId: string
  content: string
  mentions: string[] | null
  createdAt: string
  author: { id: string; name: string | null; email: string }
}

interface JobStakeholder {
  type: "contact_type" | "group" | "individual"
  id: string
  name: string
}

interface Job {
  id: string
  name: string
  description: string | null
  ownerId: string
  status: string
  dueDate: string | null
  labels: string[] | null
  stakeholders?: JobStakeholder[]
  createdAt: string
  updatedAt: string
  owner: JobOwner
  collaborators?: JobCollaborator[]
  client?: { id: string; firstName: string; lastName: string | null; email: string | null } | null
  taskCount: number
  respondedCount: number
  completedCount: number
}

interface Permissions {
  canEdit: boolean
  canManageCollaborators: boolean
  isOwner: boolean
  isAdmin: boolean
}

interface JobTask {
  id: string
  entityId: string | null
  entity: { id: string; firstName: string; lastName: string | null; email: string | null } | null
  campaignName: string | null
  status: string
  createdAt: string
  updatedAt: string
  deadlineDate: string | null
  hasReplies: boolean
  replyCount: number
  latestOutboundSubject: string | null
  lastActivityAt: string | null
}

interface TimelineEvent {
  id: string
  type: "comment" | "email_sent" | "email_reply" | "reminder_sent"
  timestamp: string
  content: string
  author?: { name: string | null; email: string }
  taskId?: string
  taskName?: string
  recipientName?: string
  recipientEmail?: string
}

interface JobRequest {
  id: string
  prompt: string
  generatedSubject: string | null
  suggestedCampaignName: string | null
  status: string
  sentAt: string | null
  createdAt: string
  updatedAt: string
  deadlineDate: string | null
  taskCount: number
  user: { id: string; name: string | null; email: string }
}

interface ContactType { value: string; label: string; count: number }
interface Group { id: string; name: string; memberCount: number }
interface Entity { id: string; firstName: string; lastName: string | null; email: string | null }

interface StakeholderContact {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  stakeholderType: "contact_type" | "group" | "individual"
  stakeholderName: string
}

// ============================================
// Item Mode Detection
// ============================================

type ItemMode = "setup" | "waiting" | "internal" | "complete"

function getItemMode(job: Job, tasks: JobTask[], requests: JobRequest[]): ItemMode {
  if (job.status === "COMPLETED" || job.status === "ARCHIVED") {
    return "complete"
  }
  if (requests.length === 0) {
    return "setup"
  }
  const awaitingCount = tasks.filter(t => t.status === "AWAITING_RESPONSE").length
  if (awaitingCount > 0) {
    return "waiting"
  }
  return "internal"
}

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

// ============================================
// Main Component
// ============================================

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.id as string

  // Core state
  const [job, setJob] = useState<Job | null>(null)
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Data state
  const [tasks, setTasks] = useState<JobTask[]>([])
  const [requests, setRequests] = useState<JobRequest[]>([])
  const [comments, setComments] = useState<JobComment[]>([])
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [stakeholders, setStakeholders] = useState<JobStakeholder[]>([])
  const [stakeholderContacts, setStakeholderContacts] = useState<StakeholderContact[]>([])

  // Loading states
  const [tasksLoading, setTasksLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(true)

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editDueDate, setEditDueDate] = useState("")
  const [editLabels, setEditLabels] = useState<string[]>([])
  const [newLabelInput, setNewLabelInput] = useState("")

  // Comment state
  const [newComment, setNewComment] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)

  // UI state
  const [awaitingExpanded, setAwaitingExpanded] = useState(true)
  const [requestsExpanded, setRequestsExpanded] = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(true)

  // Stakeholder dialog
  const [isAddStakeholderOpen, setIsAddStakeholderOpen] = useState(false)
  const [stakeholderType, setStakeholderType] = useState<"contact_type" | "group" | "individual">("contact_type")
  const [availableTypes, setAvailableTypes] = useState<ContactType[]>([])
  const [availableGroups, setAvailableGroups] = useState<Group[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Entity[]>([])
  const [searchingEntities, setSearchingEntities] = useState(false)
  const [stakeholderContactsLoading, setStakeholderContactsLoading] = useState(false)

  // Status dropdown
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false)
  const [customStatusInput, setCustomStatusInput] = useState("")

  // ============================================
  // Computed values
  // ============================================

  const awaitingTasks = useMemo(() => tasks.filter(t => t.status === "AWAITING_RESPONSE"), [tasks])
  const itemMode = useMemo(() => job ? getItemMode(job, tasks, requests) : "setup", [job, tasks, requests])
  
  const displayLabels = useMemo(() => {
    if (!job) return []
    const labels = job.labels
    if (Array.isArray(labels)) return labels
    if (labels && typeof labels === 'object' && 'tags' in labels) return (labels as any).tags || []
    return []
  }, [job])

  // ============================================
  // Data Fetching
  // ============================================

  const fetchJob = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/jobs/${jobId}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setJob(data.job)
        setPermissions(data.permissions)
        setEditName(data.job.name)
        setEditDescription(data.job.description || "")
        setEditDueDate(data.job.dueDate ? data.job.dueDate.split("T")[0] : "")
        const jobLabels = data.job.labels
        if (Array.isArray(jobLabels)) {
          setEditLabels(jobLabels)
        } else if (jobLabels?.tags) {
          setEditLabels(jobLabels.tags)
        } else {
          setEditLabels([])
        }
        setStakeholders(data.job.stakeholders || [])
      } else if (response.status === 404) {
        router.push("/dashboard/jobs")
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/jobs"
      }
    } catch (error) {
      console.error("Error fetching job:", error)
    } finally {
      setLoading(false)
    }
  }, [jobId, router])

  const fetchTasks = useCallback(async () => {
    try {
      setTasksLoading(true)
      const response = await fetch(`/api/tasks?jobId=${jobId}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setTasks(data.tasks || [])
      }
    } catch (error) {
      console.error("Error fetching tasks:", error)
    } finally {
      setTasksLoading(false)
    }
  }, [jobId])

  const fetchRequests = useCallback(async () => {
    try {
      setRequestsLoading(true)
      const response = await fetch(`/api/jobs/${jobId}/requests`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setRequests(data.requests || [])
      }
    } catch (error) {
      console.error("Error fetching requests:", error)
    } finally {
      setRequestsLoading(false)
    }
  }, [jobId])

  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/comments`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setComments(data.comments || [])
      }
    } catch (error) {
      console.error("Error fetching comments:", error)
    }
  }, [jobId])

  const fetchTimeline = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/timeline`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setTimelineEvents(data.events || [])
      }
    } catch (error) {
      console.error("Error fetching timeline:", error)
    }
  }, [jobId])

  const fetchStakeholderContacts = useCallback(async (currentStakeholders: JobStakeholder[]) => {
    if (currentStakeholders.length === 0) {
      setStakeholderContacts([])
      return
    }
    setStakeholderContactsLoading(true)
    try {
      const allContacts: StakeholderContact[] = []
      for (const stakeholder of currentStakeholders) {
        if (stakeholder.type === "individual") {
          allContacts.push({
            id: stakeholder.id,
            firstName: stakeholder.name.split(" ")[0] || stakeholder.name,
            lastName: stakeholder.name.split(" ").slice(1).join(" ") || null,
            email: null,
            stakeholderType: "individual",
            stakeholderName: stakeholder.name
          })
        } else if (stakeholder.type === "group") {
          const response = await fetch(`/api/entities?groupId=${stakeholder.id}`, { credentials: "include" })
          if (response.ok) {
            const entities = await response.json()
            const contacts = Array.isArray(entities) ? entities : []
            contacts.forEach((c: any) => {
              allContacts.push({
                id: c.id,
                firstName: c.firstName,
                lastName: c.lastName || null,
                email: c.email,
                stakeholderType: "group",
                stakeholderName: stakeholder.name
              })
            })
          }
        } else if (stakeholder.type === "contact_type") {
          const response = await fetch(`/api/entities?contactType=${encodeURIComponent(stakeholder.id)}`, { credentials: "include" })
          if (response.ok) {
            const entities = await response.json()
            const contacts = Array.isArray(entities) ? entities : []
            contacts.forEach((c: any) => {
              allContacts.push({
                id: c.id,
                firstName: c.firstName,
                lastName: c.lastName || null,
                email: c.email,
                stakeholderType: "contact_type",
                stakeholderName: stakeholder.name
              })
            })
          }
        }
      }
      const uniqueContacts = allContacts.filter((contact, index, self) =>
        index === self.findIndex(c => c.id === contact.id)
      )
      setStakeholderContacts(uniqueContacts)
    } catch (error) {
      console.error("Error fetching stakeholder contacts:", error)
    } finally {
      setStakeholderContactsLoading(false)
    }
  }, [])

  const fetchStakeholderOptions = useCallback(async () => {
    try {
      const typesRes = await fetch("/api/contacts/type-counts", { credentials: "include" })
      if (typesRes.ok) {
        const typesData = await typesRes.json()
        const types: ContactType[] = []
        const builtInCounts = typesData.builtInCounts || {}
        const builtInLabels: Record<string, string> = {
          EMPLOYEE: "Employee", VENDOR: "Vendor", CLIENT: "Client", PARTNER: "Partner", OTHER: "Other"
        }
        for (const [value, label] of Object.entries(builtInLabels)) {
          if (builtInCounts[value] && builtInCounts[value] > 0) {
            types.push({ value, label, count: builtInCounts[value] })
          }
        }
        const customTypes = typesData.customTypes || []
        for (const ct of customTypes) {
          types.push({ value: `CUSTOM:${ct.label}`, label: ct.label, count: ct.count })
        }
        setAvailableTypes(types)
      }
      const groupsRes = await fetch("/api/groups", { credentials: "include" })
      if (groupsRes.ok) {
        const groupsData = await groupsRes.json()
        const groups: Group[] = (Array.isArray(groupsData) ? groupsData : []).map((g: any) => ({
          id: g.id,
          name: g.name,
          memberCount: g.entityCount || g._count?.entities || 0
        }))
        setAvailableGroups(groups)
      }
    } catch (error) {
      console.error("Error fetching stakeholder options:", error)
    }
  }, [])

  // Search entities
  const searchEntities = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    setSearchingEntities(true)
    try {
      const response = await fetch(`/api/entities?search=${encodeURIComponent(query)}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        const entities = Array.isArray(data) ? data : []
        setSearchResults(entities.slice(0, 10))
      }
    } catch (error) {
      console.error("Error searching entities:", error)
    } finally {
      setSearchingEntities(false)
    }
  }, [])

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (stakeholderType === "individual" && searchQuery) {
        searchEntities(searchQuery)
      }
    }, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery, stakeholderType, searchEntities])

  useEffect(() => {
    fetchJob()
    fetchTasks()
    fetchRequests()
    fetchComments()
    fetchTimeline()
    fetchStakeholderOptions()
  }, [fetchJob, fetchTasks, fetchRequests, fetchComments, fetchTimeline, fetchStakeholderOptions])

  useEffect(() => {
    if (stakeholders.length > 0) {
      fetchStakeholderContacts(stakeholders)
    } else {
      setStakeholderContacts([])
    }
  }, [stakeholders, fetchStakeholderContacts])

  // ============================================
  // Handlers
  // ============================================

  const handleSave = async () => {
    if (!editName.trim()) return
    setSaving(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          dueDate: editDueDate || null
        })
      })
      if (response.ok) {
        const data = await response.json()
        setJob(data.job)
        setEditing(false)
      }
    } catch (error) {
      console.error("Error updating job:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    setJob(prev => prev ? { ...prev, status: newStatus } : null)
    setIsStatusDropdownOpen(false)
    setCustomStatusInput("")
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus })
      })
    } catch (error) {
      console.error("Error updating status:", error)
      fetchJob()
    }
  }

  const handleAddLabel = async (label: string) => {
    if (!label.trim() || displayLabels.includes(label)) return
    const newLabels = [...displayLabels, label.trim()]
    setEditLabels(newLabels)
    setNewLabelInput("")
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ labels: { tags: newLabels } })
      })
      fetchJob()
    } catch (error) {
      console.error("Error adding label:", error)
    }
  }

  const handleRemoveLabel = async (label: string) => {
    const newLabels = displayLabels.filter((l: string) => l !== label)
    setEditLabels(newLabels)
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ labels: { tags: newLabels } })
      })
      fetchJob()
    } catch (error) {
      console.error("Error removing label:", error)
    }
  }

  const handleAddStakeholder = async (type: "contact_type" | "group" | "individual", id: string, name: string) => {
    const exists = stakeholders.some(s => s.type === type && s.id === id)
    if (exists) return
    const newStakeholders = [...stakeholders, { type, id, name }]
    setStakeholders(newStakeholders)
    setIsAddStakeholderOpen(false)
    setSearchQuery("")
    setSearchResults([])
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stakeholders: newStakeholders })
      })
      fetchJob()
    } catch (error) {
      console.error("Error adding stakeholder:", error)
    }
  }

  const handleRemoveStakeholder = async (type: string, id: string) => {
    const newStakeholders = stakeholders.filter(s => !(s.type === type && s.id === id))
    setStakeholders(newStakeholders)
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stakeholders: newStakeholders })
      })
      fetchJob()
    } catch (error) {
      console.error("Error removing stakeholder:", error)
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSubmittingComment(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: newComment.trim() })
      })
      if (response.ok) {
        const data = await response.json()
        setComments(prev => [data.comment, ...prev])
        setNewComment("")
        fetchTimeline()
      }
    } catch (error) {
      console.error("Error adding comment:", error)
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to archive this item?")) return
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        credentials: "include"
      })
      if (response.ok) {
        router.push("/dashboard/jobs")
      }
    } catch (error) {
      console.error("Error deleting job:", error)
    }
  }

  // ============================================
  // Render
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<AlertCircle className="w-6 h-6" />}
          title="Item not found"
          description="This item may have been deleted or you don't have access."
          action={{ label: "Back to Checklist", onClick: () => router.push("/dashboard/jobs") }}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-3 flex items-center justify-between">
          <Link href="/dashboard/jobs" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to {UI_LABELS.jobsPageTitle}</span>
          </Link>
          {permissions?.canEdit && (
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDelete} className="text-red-600 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Main Content - 8 columns */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            {/* Header Card */}
            <Card>
              <CardContent className="p-6">
                {editing ? (
                  <div className="space-y-4">
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="mt-1 text-lg font-semibold"
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Optional description"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Deadline</Label>
                      <Input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="mt-1 w-48"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Title + Status */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h1 className="text-2xl font-semibold text-gray-900">{job.name}</h1>
                          {/* Status Dropdown */}
                          {permissions?.canEdit ? (
                            <div className="relative">
                              <button
                                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                                className="flex items-center gap-1"
                              >
                                <StatusBadge status={job.status} />
                                <ChevronDown className="w-3 h-3 text-gray-400" />
                              </button>
                              {isStatusDropdownOpen && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setIsStatusDropdownOpen(false)} />
                                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[180px]">
                                    <div className="py-1">
                                      {["ACTIVE", "WAITING", "COMPLETED", "ARCHIVED"].map(status => (
                                        <button
                                          key={status}
                                          onClick={() => handleStatusChange(status)}
                                          className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${job.status === status ? "bg-gray-50 font-medium" : ""}`}
                                        >
                                          <StatusBadge status={status} size="sm" />
                                        </button>
                                      ))}
                                      <div className="border-t border-gray-100 mt-1 pt-1 px-2 pb-2">
                                        <p className="text-xs text-gray-400 mb-1 px-1">Custom status</p>
                                        <Input
                                          placeholder="Type and press Enter"
                                          value={customStatusInput}
                                          onChange={(e) => setCustomStatusInput(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" && customStatusInput.trim()) {
                                              handleStatusChange(customStatusInput.trim())
                                            }
                                          }}
                                          className="h-7 text-xs"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <StatusBadge status={job.status} />
                          )}
                        </div>
                        {job.description && (
                          <p className="text-gray-500 mb-3">{job.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Deadline */}
                    {job.dueDate && (
                      <div className="flex items-center gap-2 mb-3 text-sm">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">Deadline:</span>
                        <span className={`${
                          differenceInDays(new Date(job.dueDate), new Date()) < 0 
                            ? "text-red-600 font-medium" 
                            : differenceInDays(new Date(job.dueDate), new Date()) <= 3
                            ? "text-amber-600 font-medium"
                            : "text-gray-700"
                        }`}>
                          {format(new Date(job.dueDate), "EEEE, MMMM d, yyyy")}
                        </span>
                      </div>
                    )}

                    {/* Labels */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Tag className="w-4 h-4 text-gray-400" />
                      {displayLabels.map((label: string) => (
                        <Chip
                          key={label}
                          label={label}
                          color="blue"
                          removable={permissions?.canEdit}
                          onRemove={() => handleRemoveLabel(label)}
                          size="sm"
                        />
                      ))}
                      {permissions?.canEdit && (
                        <Input
                          placeholder="Add label..."
                          value={newLabelInput}
                          onChange={(e) => setNewLabelInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              handleAddLabel(newLabelInput)
                            }
                          }}
                          className="w-28 h-7 text-xs"
                        />
                      )}
                    </div>

                    {/* Stakeholders */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400" />
                      {stakeholders.map((s) => (
                        <Chip
                          key={`${s.type}-${s.id}`}
                          label={s.name}
                          color={s.type === "contact_type" ? "purple" : s.type === "group" ? "green" : "gray"}
                          removable={permissions?.canEdit}
                          onRemove={() => handleRemoveStakeholder(s.type, s.id)}
                          size="sm"
                        />
                      ))}
                      {permissions?.canEdit && (
                        <Dialog open={isAddStakeholderOpen} onOpenChange={setIsAddStakeholderOpen}>
                          <DialogTrigger asChild>
                            <button className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full border border-dashed border-gray-300">
                              <Plus className="w-3 h-3" />
                              Add
                            </button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Stakeholder</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <div>
                                <Label>Type</Label>
                                <Select value={stakeholderType} onValueChange={(v) => setStakeholderType(v as any)}>
                                  <SelectTrigger className="mt-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="contact_type">Contact Type</SelectItem>
                                    <SelectItem value="group">Group</SelectItem>
                                    <SelectItem value="individual">Individual</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {stakeholderType === "contact_type" && (
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                  {availableTypes.map(type => (
                                    <button
                                      key={type.value}
                                      onClick={() => handleAddStakeholder("contact_type", type.value, type.label)}
                                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center justify-between"
                                    >
                                      <span>{type.label}</span>
                                      <span className="text-xs text-gray-500">{type.count} contacts</span>
                                    </button>
                                  ))}
                                  {availableTypes.length === 0 && (
                                    <p className="text-sm text-gray-500 text-center py-4">No contact types found</p>
                                  )}
                                </div>
                              )}
                              {stakeholderType === "group" && (
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                  {availableGroups.map(group => (
                                    <button
                                      key={group.id}
                                      onClick={() => handleAddStakeholder("group", group.id, group.name)}
                                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center justify-between"
                                    >
                                      <span>{group.name}</span>
                                      <span className="text-xs text-gray-500">{group.memberCount} members</span>
                                    </button>
                                  ))}
                                  {availableGroups.length === 0 && (
                                    <p className="text-sm text-gray-500 text-center py-4">No groups found</p>
                                  )}
                                </div>
                              )}
                              {stakeholderType === "individual" && (
                                <div>
                                  <Input
                                    placeholder="Search by name or email..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                  />
                                  <div className="max-h-48 overflow-y-auto space-y-1 mt-2">
                                    {searchingEntities ? (
                                      <div className="flex justify-center py-4">
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400" />
                                      </div>
                                    ) : searchResults.length > 0 ? (
                                      searchResults.map(entity => (
                                        <button
                                          key={entity.id}
                                          onClick={() => handleAddStakeholder("individual", entity.id, `${entity.firstName} ${entity.lastName || ""}`.trim())}
                                          className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
                                        >
                                          <div className="font-medium text-sm">{entity.firstName} {entity.lastName || ""}</div>
                                          {entity.email && <div className="text-xs text-gray-500">{entity.email}</div>}
                                        </button>
                                      ))
                                    ) : searchQuery.length >= 2 ? (
                                      <p className="text-sm text-gray-500 text-center py-4">No contacts found</p>
                                    ) : (
                                      <p className="text-sm text-gray-500 text-center py-4">Type at least 2 characters</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Conditional Primary Section based on Mode */}
            {itemMode === "setup" && (
              <Card>
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-6 h-6 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-1">How would you like to track this item?</h3>
                    <p className="text-sm text-gray-500">Choose how you want to work on this item</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Link href={`/dashboard/quest/new?jobId=${job.id}`}>
                      <div className="border border-gray-200 rounded-lg p-6 hover:border-green-300 hover:bg-green-50/50 transition-all cursor-pointer text-center">
                        <Mail className="w-8 h-8 text-green-600 mx-auto mb-3" />
                        <h4 className="font-medium text-gray-900 mb-1">Send Requests</h4>
                        <p className="text-xs text-gray-500">Email stakeholders and track responses</p>
                      </div>
                    </Link>
                    <button
                      onClick={() => document.getElementById("comment-input")?.focus()}
                      className="border border-gray-200 rounded-lg p-6 hover:border-blue-300 hover:bg-blue-50/50 transition-all cursor-pointer text-center"
                    >
                      <MessageSquare className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                      <h4 className="font-medium text-gray-900 mb-1">Track Internally</h4>
                      <p className="text-xs text-gray-500">Use for internal work without emails</p>
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {itemMode === "waiting" && awaitingTasks.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/30">
                <CardContent className="p-4">
                  <SectionHeader
                    title="Awaiting Response"
                    count={awaitingTasks.length}
                    icon={<Clock className="w-4 h-4 text-amber-500" />}
                    action={
                      <Button size="sm" variant="outline">
                        <Bell className="w-3 h-3 mr-1" />
                        Send Reminder
                      </Button>
                    }
                  />
                  <div className="space-y-2 mt-3">
                    {awaitingTasks.slice(0, 5).map(task => {
                      const daysWaiting = differenceInDays(new Date(), new Date(task.createdAt))
                      const isUrgent = daysWaiting >= 7
                      return (
                        <div
                          key={task.id}
                          className={`flex items-center justify-between p-3 rounded-lg bg-white border ${isUrgent ? "border-red-200" : "border-gray-100"}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${isUrgent ? "bg-red-500" : daysWaiting >= 3 ? "bg-amber-500" : "bg-gray-300"}`} />
                            <div>
                              <div className="font-medium text-sm text-gray-900">
                                {task.entity?.firstName} {task.entity?.lastName || ""}
                              </div>
                              <div className="text-xs text-gray-500">
                                {task.campaignName || "Request"} · {daysWaiting} day{daysWaiting !== 1 ? "s" : ""} waiting
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {awaitingTasks.length > 5 && (
                      <p className="text-xs text-gray-500 text-center py-2">
                        +{awaitingTasks.length - 5} more awaiting
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Requests Section (collapsed by default unless in setup mode) */}
            {requests.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <SectionHeader
                    title="Requests"
                    count={requests.length}
                    icon={<Mail className="w-4 h-4 text-blue-500" />}
                    collapsible
                    expanded={requestsExpanded}
                    onToggle={() => setRequestsExpanded(!requestsExpanded)}
                    action={
                      <Link href={`/dashboard/quest/new?jobId=${job.id}`}>
                        <Button size="sm" variant="outline">
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      </Link>
                    }
                  />
                  {requestsExpanded && (
                    <div className="space-y-2 mt-3">
                      {requests.map(request => (
                        <div key={request.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                          <div>
                            <div className="font-medium text-sm text-gray-900">
                              {request.suggestedCampaignName || request.generatedSubject || "Request"}
                            </div>
                            <div className="text-xs text-gray-500">
                              {request.taskCount} recipient{request.taskCount !== 1 ? "s" : ""} · 
                              {request.sentAt ? ` Sent ${formatDistanceToNow(new Date(request.sentAt), { addSuffix: true })}` : " Draft"}
                            </div>
                          </div>
                          <StatusBadge status={request.status} size="sm" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Timeline / Comments */}
            <Card>
              <CardContent className="p-4">
                <SectionHeader
                  title="Activity"
                  icon={<MessageSquare className="w-4 h-4 text-gray-500" />}
                  collapsible
                  expanded={timelineExpanded}
                  onToggle={() => setTimelineExpanded(!timelineExpanded)}
                />
                {timelineExpanded && (
                  <div className="mt-3">
                    {/* Comment Input */}
                    <div className="flex gap-3 mb-4">
                      <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                        {getInitials(job.owner.name, job.owner.email)}
                      </div>
                      <div className="flex-1">
                        <Textarea
                          id="comment-input"
                          placeholder="Add a comment..."
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          className="min-h-[80px] resize-none"
                        />
                        <div className="flex justify-end mt-2">
                          <Button
                            size="sm"
                            onClick={handleAddComment}
                            disabled={!newComment.trim() || submittingComment}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Send className="w-3 h-3 mr-1" />
                            {submittingComment ? "Posting..." : "Post"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Timeline Events */}
                    {timelineEvents.length === 0 && comments.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">No activity yet</p>
                    ) : (
                      <div className="space-y-3">
                        {comments.slice(0, 10).map(comment => (
                          <div key={comment.id} className="flex gap-3">
                            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">
                              {getInitials(comment.author.name, comment.author.email)}
                            </div>
                            <div className="flex-1 bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm text-gray-900">
                                  {comment.author.name || comment.author.email.split("@")[0]}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - 4 columns */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            {/* Owner */}
            <Card>
              <CardContent className="p-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Owner</h4>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-medium">
                    {getInitials(job.owner.name, job.owner.email)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{job.owner.name || job.owner.email.split("@")[0]}</div>
                    <div className="text-sm text-gray-500">{job.owner.email}</div>
                  </div>
                </div>
                {permissions?.isOwner && (
                  <p className="text-xs text-green-600 mt-2">You own this item</p>
                )}
              </CardContent>
            </Card>

            {/* Stakeholder Contacts */}
            {stakeholders.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Stakeholders
                    <span className="text-gray-400 font-normal ml-1">
                      ({stakeholderContacts.length})
                    </span>
                  </h4>
                  {stakeholderContactsLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400" />
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {stakeholderContacts.map(contact => (
                        <div key={contact.id} className="flex items-center gap-2 p-2 rounded bg-gray-50">
                          <div className="w-7 h-7 bg-gray-300 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                            {getInitials(`${contact.firstName} ${contact.lastName || ""}`, contact.email || contact.firstName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {contact.firstName} {contact.lastName || ""}
                            </div>
                            {contact.email && (
                              <div className="text-xs text-gray-500 truncate">{contact.email}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Details */}
            <Card>
              <CardContent className="p-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Created</span>
                    <span className="text-gray-900">{format(new Date(job.createdAt), "MMM d, yyyy")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Updated</span>
                    <span className="text-gray-900">{formatDistanceToNow(new Date(job.updatedAt), { addSuffix: true })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Requests</span>
                    <span className="text-gray-900">{requests.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Comments</span>
                    <span className="text-gray-900">{comments.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
