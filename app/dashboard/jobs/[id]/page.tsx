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

// Send Request Modal
import { SendRequestModal } from "@/components/jobs/send-request-modal"

// Labels components
import { ContactLabelsTable } from "@/components/jobs/contact-labels-table"

// Collection components
import { CollectionTab } from "@/components/jobs/collection/collection-tab"

// Request card with expandable recipient grid
import { RequestCardExpandable } from "@/components/jobs/request-card-expandable"


// Task AI Summary
import { TaskAISummary } from "@/components/jobs/task-ai-summary"

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
  noStakeholdersNeeded?: boolean
  createdAt: string
  updatedAt: string
  owner: JobOwner
  collaborators?: JobCollaborator[]
  client?: { id: string; firstName: string; lastName: string | null; email: string | null; companyName: string | null } | null
  taskCount: number
  respondedCount: number
  completedCount: number
  collectedItemCount?: number
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
  entity: { id: string; firstName: string; lastName: string | null; email: string | null; companyName: string | null } | null
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

interface RequestRecipient {
  id: string
  entityId?: string
  name: string
  email: string
  status: string
  readStatus?: string // 'unread' | 'read' | 'replied'
  hasReplied?: boolean
  sentMessage: {
    subject: string
    body: string
    sentAt: string
  } | null
}

interface ReminderConfig {
  enabled: boolean
  frequencyHours: number | null
  maxCount: number | null
}

interface JobRequest {
  id: string
  prompt: string
  generatedSubject: string | null
  generatedBody: string | null
  generatedHtmlBody: string | null
  subjectTemplate: string | null
  bodyTemplate: string | null
  htmlBodyTemplate: string | null
  suggestedCampaignName: string | null
  status: string
  sentAt: string | null
  createdAt: string
  updatedAt: string
  deadlineDate: string | null
  taskCount: number
  reminderConfig: ReminderConfig | null
  recipients: RequestRecipient[]
  user: { id: string; name: string | null; email: string }
}

interface ContactType { value: string; label: string; count: number }
interface Group { id: string; name: string; memberCount: number }
interface Entity { id: string; firstName: string; lastName: string | null; email: string | null; companyName: string | null }

interface StakeholderContact {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  companyName: string | null
  stakeholderType: "contact_type" | "group" | "individual"
  stakeholderName: string
}

// ============================================
// Item Mode Detection
// ============================================

type ItemMode = "setup" | "waiting" | "internal" | "complete"

function getItemMode(job: Job, tasks: JobTask[], requests: JobRequest[]): ItemMode {
  if (job.status === "COMPLETE") {
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
  const [saving, setSaving] = useState(false)
  
  // Inline editing states
  const [editingName, setEditingName] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [editingDueDate, setEditingDueDate] = useState(false)

  // Data state
  const [tasks, setTasks] = useState<JobTask[]>([])
  const [requests, setRequests] = useState<JobRequest[]>([])
  const [comments, setComments] = useState<JobComment[]>([])
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [stakeholders, setStakeholders] = useState<JobStakeholder[]>([])
  const [stakeholderContacts, setStakeholderContacts] = useState<StakeholderContact[]>([])
  const [noStakeholdersNeeded, setNoStakeholdersNeeded] = useState(false)

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
  const [collectionExpanded, setCollectionExpanded] = useState(false)
  

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

  // Collaborators
  const [collaborators, setCollaborators] = useState<JobCollaborator[]>([])
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string | null; email: string }>>([])
  const [isAddCollaboratorOpen, setIsAddCollaboratorOpen] = useState(false)
  const [addingCollaborator, setAddingCollaborator] = useState(false)

  // Send Request Modal
  const [isSendRequestOpen, setIsSendRequestOpen] = useState(false)

  // Notes
  const [notes, setNotes] = useState("")
  const [editingNotes, setEditingNotes] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  // Mention suggestions
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState("")

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
        // Check if user explicitly marked this item as not needing stakeholders
        setNoStakeholdersNeeded(data.job.noStakeholdersNeeded || jobLabels?.noStakeholdersNeeded || false)
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
            companyName: null,
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
                companyName: c.companyName || null,
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
                companyName: c.companyName || null,
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

  const fetchCollaborators = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/collaborators`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setCollaborators(data.collaborators || [])
      }
    } catch (error) {
      console.error("Error fetching collaborators:", error)
    }
  }, [jobId])

  const fetchTeamMembers = useCallback(async () => {
    try {
      const response = await fetch("/api/org/users", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setTeamMembers((data.users || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email })))
      }
    } catch (error) {
      console.error("Error fetching team members:", error)
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
    fetchCollaborators()
    fetchTeamMembers()
  }, [fetchJob, fetchTasks, fetchRequests, fetchComments, fetchTimeline, fetchStakeholderOptions, fetchCollaborators, fetchTeamMembers])

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

  // Inline save for individual fields
  const handleSaveField = async (field: "name" | "description" | "dueDate", value: string | null) => {
    setSaving(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value })
      })
      if (response.ok) {
        const data = await response.json()
        setJob(data.job)
        // Update edit states
        setEditName(data.job.name)
        setEditDescription(data.job.description || "")
        setEditDueDate(data.job.dueDate ? data.job.dueDate.split("T")[0] : "")
      }
    } catch (error) {
      console.error(`Error updating ${field}:`, error)
    } finally {
      setSaving(false)
      setEditingName(false)
      setEditingDescription(false)
      setEditingDueDate(false)
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
    const hasRequests = (job?.taskCount || 0) > 0
    
    // Different confirmation messages based on whether task has requests
    const confirmMessage = hasRequests
      ? "This task has requests and will be archived (not permanently deleted). Continue?"
      : "Are you sure you want to permanently delete this task? This cannot be undone."
    
    if (!confirm(confirmMessage)) return
    
    try {
      // If no requests, try hard delete; otherwise archive
      const url = hasRequests 
        ? `/api/jobs/${jobId}` 
        : `/api/jobs/${jobId}?hard=true`
      
      const response = await fetch(url, {
        method: "DELETE",
        credentials: "include"
      })
      
      if (response.ok) {
        router.push("/dashboard/jobs")
      } else {
        const data = await response.json()
        // If hard delete was blocked due to requests, fall back to archive
        if (data.code === "HAS_REQUESTS") {
          const archiveResponse = await fetch(`/api/jobs/${jobId}`, {
            method: "DELETE",
            credentials: "include"
          })
          if (archiveResponse.ok) {
            router.push("/dashboard/jobs")
          }
        } else {
          alert(data.error || "Failed to delete task")
        }
      }
    } catch (error) {
      console.error("Error deleting job:", error)
    }
  }

  const handleAddCollaborator = async (userId: string) => {
    setAddingCollaborator(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, role: "COLLABORATOR" })
      })
      if (response.ok) {
        fetchCollaborators()
        setIsAddCollaboratorOpen(false)
      }
    } catch (error) {
      console.error("Error adding collaborator:", error)
    } finally {
      setAddingCollaborator(false)
    }
  }

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    try {
      await fetch(`/api/jobs/${jobId}/collaborators?collaboratorId=${collaboratorId}`, {
        method: "DELETE",
        credentials: "include"
      })
      fetchCollaborators()
    } catch (error) {
      console.error("Error removing collaborator:", error)
    }
  }

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ labels: { ...job?.labels, notes } })
      })
      setEditingNotes(false)
      fetchJob()
    } catch (error) {
      console.error("Error saving notes:", error)
    } finally {
      setSavingNotes(false)
    }
  }

  // Handle @mention in comment input
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setNewComment(value)
    
    // Check for @mention trigger
    const lastAtIndex = value.lastIndexOf("@")
    if (lastAtIndex !== -1) {
      const textAfterAt = value.slice(lastAtIndex + 1)
      const hasSpaceAfterAt = textAfterAt.includes(" ")
      if (!hasSpaceAfterAt && textAfterAt.length <= 20) {
        setMentionFilter(textAfterAt.toLowerCase())
        setShowMentionSuggestions(true)
      } else {
        setShowMentionSuggestions(false)
      }
    } else {
      setShowMentionSuggestions(false)
    }
  }

  const handleMentionSelect = (user: { id: string; name: string | null; email: string }) => {
    const lastAtIndex = newComment.lastIndexOf("@")
    const displayName = user.name || user.email.split("@")[0]
    const newValue = newComment.slice(0, lastAtIndex) + `@${displayName} `
    setNewComment(newValue)
    setShowMentionSuggestions(false)
  }

  const filteredTeamMembers = teamMembers.filter(m => {
    if (!mentionFilter) return true
    const name = (m.name || "").toLowerCase()
    const email = m.email.toLowerCase()
    return name.includes(mentionFilter) || email.includes(mentionFilter)
  })

  // ============================================
  // Render
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
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
          action={{ label: "Back to Tasks", onClick: () => router.push("/dashboard/jobs") }}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-8 py-3 flex items-center justify-between">
          <Link href="/dashboard/jobs" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to {UI_LABELS.jobsPageTitle}</span>
          </Link>
          {permissions?.canEdit && (
            <button 
              onClick={handleDelete}
              className="p-1.5 text-gray-400 hover:text-red-600 transition-colors flex items-center gap-1.5"
              title={(job?.taskCount || 0) > 0 ? "Archive task (has requests)" : "Delete task permanently"}
            >
              {(job?.taskCount || 0) > 0 ? (
                <>
                  <Archive className="w-4 h-4" />
                  <span className="text-xs">Archive</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span className="text-xs">Delete</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="grid grid-cols-12 gap-8">
          {/* Main Content - 8 columns */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            {/* Header Section */}
            <div className="pb-6 border-b border-gray-100">
                    {/* Title + Status */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {/* Inline editable name */}
                          {editingName ? (
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onBlur={() => {
                                if (editName.trim() && editName !== job.name) {
                                  handleSaveField("name", editName.trim())
                                } else {
                                  setEditName(job.name)
                                  setEditingName(false)
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  if (editName.trim() && editName !== job.name) {
                                    handleSaveField("name", editName.trim())
                                  } else {
                                    setEditName(job.name)
                                    setEditingName(false)
                                  }
                                }
                                if (e.key === "Escape") {
                                  setEditName(job.name)
                                  setEditingName(false)
                                }
                              }}
                              autoFocus
                              className="text-2xl font-semibold h-auto py-1 px-2 -ml-2"
                            />
                          ) : (
                            <div className="group flex items-center gap-2">
                              <h1 className="text-2xl font-semibold text-gray-900">{job.name}</h1>
                              {permissions?.canEdit && (
                                <button
                                  onClick={() => setEditingName(true)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 transition-opacity"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          )}
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
                                      {["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETE"].map(status => (
                                        <button
                                          key={status}
                                          onClick={() => handleStatusChange(status)}
                                          className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${job.status === status ? "bg-gray-50 font-medium" : ""}`}
                                        >
                                          <StatusBadge status={status} size="sm" />
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <StatusBadge status={job.status} />
                          )}
                        </div>
                        {/* Inline editable description */}
                        {editingDescription ? (
                          <Input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            onBlur={() => {
                              const newDesc = editDescription.trim() || null
                              if (newDesc !== (job.description || null)) {
                                handleSaveField("description", newDesc)
                              } else {
                                setEditDescription(job.description || "")
                                setEditingDescription(false)
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const newDesc = editDescription.trim() || null
                                if (newDesc !== (job.description || null)) {
                                  handleSaveField("description", newDesc)
                                } else {
                                  setEditDescription(job.description || "")
                                  setEditingDescription(false)
                                }
                              }
                              if (e.key === "Escape") {
                                setEditDescription(job.description || "")
                                setEditingDescription(false)
                              }
                            }}
                            autoFocus
                            placeholder="Add a description..."
                            className="text-gray-500 mb-3 h-auto py-1 px-2 -ml-2"
                          />
                        ) : (
                          <div className="group flex items-center gap-2 mb-3">
                            {job.description ? (
                              <p className="text-gray-500">{job.description}</p>
                            ) : (
                              permissions?.canEdit && (
                                <p className="text-gray-400 italic">Add a description...</p>
                              )
                            )}
                            {permissions?.canEdit && (
                              <button
                                onClick={() => setEditingDescription(true)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 transition-opacity"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline editable Deadline */}
                    <div className="flex items-center gap-2 mb-3 text-sm">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">Deadline:</span>
                      {editingDueDate ? (
                        <Input
                          type="date"
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                          onBlur={() => {
                            const newDate = editDueDate || null
                            const currentDate = job.dueDate ? job.dueDate.split("T")[0] : null
                            if (newDate !== currentDate) {
                              handleSaveField("dueDate", newDate)
                            } else {
                              setEditDueDate(job.dueDate ? job.dueDate.split("T")[0] : "")
                              setEditingDueDate(false)
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const newDate = editDueDate || null
                              const currentDate = job.dueDate ? job.dueDate.split("T")[0] : null
                              if (newDate !== currentDate) {
                                handleSaveField("dueDate", newDate)
                              } else {
                                setEditDueDate(job.dueDate ? job.dueDate.split("T")[0] : "")
                                setEditingDueDate(false)
                              }
                            }
                            if (e.key === "Escape") {
                              setEditDueDate(job.dueDate ? job.dueDate.split("T")[0] : "")
                              setEditingDueDate(false)
                            }
                          }}
                          autoFocus
                          className="w-48 h-8"
                        />
                      ) : (
                        <div className="group flex items-center gap-2">
                          {job.dueDate ? (
                            <span className={`${
                              differenceInDays(new Date(job.dueDate), new Date()) < 0 
                                ? "text-red-600 font-medium" 
                                : differenceInDays(new Date(job.dueDate), new Date()) <= 3
                                ? "text-amber-600 font-medium"
                                : "text-gray-700"
                            }`}>
                              {format(new Date(job.dueDate), "EEEE, MMMM d, yyyy")}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">Not set</span>
                          )}
                          {permissions?.canEdit && (
                            <button
                              onClick={() => setEditingDueDate(true)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 transition-opacity"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

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
                              {/* Step 1: Select Type */}
                              <div>
                                <Label>Step 1: Select Type</Label>
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
                              
                              {/* Step 2: Select specific item based on type */}
                              <div>
                                <Label>
                                  Step 2: Select {stakeholderType === "contact_type" ? "Contact Type" : stakeholderType === "group" ? "Group" : "Individual"}
                                </Label>
                                
                                {stakeholderType === "contact_type" && (
                                  <div className="mt-2">
                                    {availableTypes.length > 0 ? (
                                      <Select onValueChange={(v) => {
                                        const type = availableTypes.find(t => t.value === v)
                                        if (type) handleAddStakeholder("contact_type", type.value, type.label)
                                      }}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select a contact type..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {availableTypes.map(type => (
                                            <SelectItem key={type.value} value={type.value}>
                                              {type.label} ({type.count} contacts)
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center mt-2">
                                        <p className="text-sm text-gray-600 mb-2">
                                          No contact types found. Add contacts with types first.
                                        </p>
                                        <a 
                                          href="/dashboard/contacts" 
                                          className="text-sm font-medium text-blue-600 hover:text-blue-800"
                                        >
                                          Go to Contacts →
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                {stakeholderType === "group" && (
                                  <div className="mt-2">
                                    {availableGroups.length > 0 ? (
                                      <Select onValueChange={(v) => {
                                        const group = availableGroups.find(g => g.id === v)
                                        if (group) handleAddStakeholder("group", group.id, group.name)
                                      }}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select a group..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {availableGroups.map(group => (
                                            <SelectItem key={group.id} value={group.id}>
                                              {group.name} ({group.memberCount} members)
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center mt-2">
                                        <p className="text-sm text-gray-600 mb-2">
                                          No groups found. Create groups in the Contacts page first.
                                        </p>
                                        <a 
                                          href="/dashboard/contacts" 
                                          className="text-sm font-medium text-blue-600 hover:text-blue-800"
                                        >
                                          Go to Contacts →
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                {stakeholderType === "individual" && (
                                  <div className="mt-2">
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
                                            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 border"
                                          >
                                            <div className="font-medium text-sm">{entity.firstName} {entity.lastName || ""}</div>
                                            {entity.email && <div className="text-xs text-gray-500">{entity.email}</div>}
                                          </button>
                                        ))
                                      ) : searchQuery.length >= 2 ? (
                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                                          <p className="text-sm text-gray-600 mb-2">
                                            No contacts found matching "{searchQuery}"
                                          </p>
                                          <a 
                                            href="/dashboard/contacts" 
                                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                                          >
                                            Add contacts →
                                          </a>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-500 text-center py-4">Type at least 2 characters to search</p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
            </div>

            {/* Task AI Summary - shows when requests exist */}
            {requests.length > 0 && (
              <TaskAISummary
                jobId={jobId}
                jobName={job.name}
                jobStatus={job.status}
                dueDate={job.dueDate}
                requests={requests.map(r => ({
                  id: r.id,
                  status: r.status,
                  sentAt: r.sentAt,
                  taskCount: r.taskCount,
                  recipients: r.recipients.map(rec => ({
                    name: rec.name,
                    email: rec.email,
                    status: rec.status,
                    readStatus: rec.readStatus,
                    hasReplied: rec.hasReplied
                  })),
                  reminderConfig: r.reminderConfig
                }))}
                stakeholderCount={stakeholders.length}
                taskCount={job.taskCount}
                respondedCount={job.respondedCount}
                completedCount={job.completedCount}
              />
            )}

            {/* Conditional Primary Section based on Mode */}
            {itemMode === "setup" && (
              stakeholders.length === 0 && !noStakeholdersNeeded ? (
                // No stakeholders and not marked as internal-only - show warning with CTA to add
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-8 text-center">
                  <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Add stakeholders to send a request</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    You need to add stakeholders (contacts, groups, or types) before you can send a request for this item.
                  </p>
                  <Button
                    onClick={() => setIsAddStakeholderOpen(true)}
                    className="bg-gray-900 hover:bg-gray-800"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Stakeholders
                  </Button>
                </div>
              ) : noStakeholdersNeeded && stakeholders.length === 0 ? (
                // Marked as no stakeholders needed - show internal item info
                <div className="border border-gray-200 rounded-lg p-6 text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-6 h-6 text-gray-500" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">Internal Item</h3>
                  <p className="text-sm text-gray-500">
                    This item has no stakeholders. You can add stakeholders anytime if needed.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddStakeholderOpen(true)}
                    className="mt-3"
                  >
                    <UserPlus className="w-3 h-3 mr-1" />
                    Add Stakeholders
                  </Button>
                </div>
              ) : (
                // Has stakeholders - show Send Request CTA
                <div className="border border-gray-200 rounded-lg p-8 text-center">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-6 h-6 text-orange-500" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to send a request</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Send an email to {stakeholderContacts.filter(c => c.email).length} stakeholder{stakeholderContacts.filter(c => c.email).length !== 1 ? 's' : ''} for this item.
                  </p>
                  <Button
                    onClick={() => setIsSendRequestOpen(true)}
                    className="bg-gray-900 hover:bg-gray-800"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send Request
                  </Button>
                </div>
              )
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
                      stakeholders.length === 0 && !noStakeholdersNeeded ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsAddStakeholderOpen(true)}
                          title="Add stakeholders to send requests"
                        >
                          <UserPlus className="w-3 h-3 mr-1" />
                          Add Stakeholders
                        </Button>
                      ) : stakeholders.length > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsSendRequestOpen(true)}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      ) : null
                    }
                  />
                  {requestsExpanded && (
                    <div className="space-y-3 mt-3">
                      {requests.map(request => (
                        <RequestCardExpandable
                          key={request.id}
                          request={request}
                          onRefresh={fetchRequests}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Collection Section - Evidence/Attachments */}
            <Card>
              <CardContent className="p-4">
                <SectionHeader
                  title="Collection"
                  count={job?.collectedItemCount}
                  icon={<Inbox className="w-4 h-4 text-purple-500" />}
                  collapsible
                  expanded={collectionExpanded}
                  onToggle={() => setCollectionExpanded(!collectionExpanded)}
                />
                {collectionExpanded && (
                  <div className="mt-3">
                    <CollectionTab jobId={jobId} />
                  </div>
                )}
              </CardContent>
            </Card>

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
                    {/* Comment Input with @mention support */}
                    <div className="flex gap-3 mb-4">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">
                        {getInitials(job.owner.name, job.owner.email)}
                      </div>
                      <div className="flex-1 relative">
                        <Textarea
                          id="comment-input"
                          placeholder="Add a comment... Use @ to mention team members"
                          value={newComment}
                          onChange={handleCommentChange}
                          onBlur={() => setTimeout(() => setShowMentionSuggestions(false), 200)}
                          className="min-h-[80px] resize-none"
                        />
                        {/* @mention suggestions dropdown */}
                        {showMentionSuggestions && filteredTeamMembers.length > 0 && (
                          <div className="absolute left-0 right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                            <div className="p-1">
                              <p className="text-xs text-gray-500 px-2 py-1">Tag a team member</p>
                              {filteredTeamMembers.slice(0, 5).map(member => (
                                <button
                                  key={member.id}
                                  onClick={() => handleMentionSelect(member)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 text-left"
                                >
                                  <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium">
                                    {getInitials(member.name, member.email)}
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {member.name || member.email.split("@")[0]}
                                    </div>
                                    <div className="text-xs text-gray-500">{member.email}</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs text-gray-400">
                            Type @ to mention team members
                          </p>
                          <button
                            onClick={handleAddComment}
                            disabled={!newComment.trim() || submittingComment}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
                          >
                            <Send className="w-3 h-3" />
                            {submittingComment ? "Posting..." : "Post"}
                          </button>
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
                              {/* Render comment with highlighted @mentions */}
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                {comment.content.split(/(@\w+)/g).map((part, i) => 
                                  part.startsWith("@") ? (
                                    <span key={i} className="text-orange-600 font-medium">{part}</span>
                                  ) : part
                                )}
                              </p>
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
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-medium">
                    {getInitials(job.owner.name, job.owner.email)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{job.owner.name || job.owner.email.split("@")[0]}</div>
                    <div className="text-sm text-gray-500">{job.owner.email}</div>
                  </div>
                </div>
                {permissions?.isOwner && (
                  <p className="text-xs text-orange-500 mt-2">You own this item</p>
                )}
              </CardContent>
            </Card>

            {/* Collaborators */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Collaborators
                    {collaborators.length > 0 && (
                      <span className="text-gray-400 font-normal ml-1">({collaborators.length})</span>
                    )}
                  </h4>
                  {permissions?.canManageCollaborators && (
                    <Dialog open={isAddCollaboratorOpen} onOpenChange={setIsAddCollaboratorOpen}>
                      <DialogTrigger asChild>
                        <button className="text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1">
                          <UserPlus className="w-3 h-3" />
                          Add
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Collaborator</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {teamMembers
                            .filter(m => m.id !== job.ownerId && !collaborators.some(c => c.userId === m.id))
                            .map(member => (
                              <button
                                key={member.id}
                                onClick={() => handleAddCollaborator(member.id)}
                                disabled={addingCollaborator}
                                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
                              >
                                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium">
                                  {getInitials(member.name, member.email)}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {member.name || member.email.split("@")[0]}
                                  </div>
                                  <div className="text-xs text-gray-500">{member.email}</div>
                                </div>
                              </button>
                            ))}
                          {teamMembers.filter(m => m.id !== job.ownerId && !collaborators.some(c => c.userId === m.id)).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4">No team members available to add</p>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
                {collaborators.length === 0 ? (
                  <p className="text-sm text-gray-500">No collaborators yet</p>
                ) : (
                  <div className="space-y-2">
                    {collaborators.map(collab => (
                      <div key={collab.id} className="flex items-center justify-between p-2 rounded bg-gray-50">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gray-300 rounded-full flex items-center justify-center text-white text-xs font-medium">
                            {getInitials(collab.user.name, collab.user.email)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {collab.user.name || collab.user.email.split("@")[0]}
                            </div>
                            <div className="text-xs text-gray-500">{collab.role}</div>
                          </div>
                        </div>
                        {permissions?.canManageCollaborators && (
                          <button
                            onClick={() => handleRemoveCollaborator(collab.id)}
                            className="text-gray-400 hover:text-red-500 p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
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
                  <ContactLabelsTable jobId={jobId} canEdit={permissions?.canEdit} />
                </CardContent>
              </Card>
            )}

            {/* Notes (Owner's private notes) */}
            {permissions?.isOwner && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</h4>
                    {!editingNotes ? (
                      <button
                        onClick={() => {
                          setNotes((job?.labels as any)?.notes || "")
                          setEditingNotes(true)
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={handleSaveNotes}
                          disabled={savingNotes}
                          className="text-xs text-green-600 hover:text-green-700"
                        >
                          <Save className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingNotes(false)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {editingNotes ? (
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add private notes about this item..."
                      className="min-h-[100px] text-sm resize-none"
                    />
                  ) : (
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {(job?.labels as any)?.notes || (
                        <span className="text-gray-400 italic">No notes yet. Click edit to add.</span>
                      )}
                    </p>
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

      {/* Send Request Modal */}
      <SendRequestModal
        open={isSendRequestOpen}
        onOpenChange={setIsSendRequestOpen}
        job={{
          id: job.id,
          name: job.name,
          description: job.description,
          dueDate: job.dueDate,
          labels: job.labels,
        }}
        stakeholderContacts={stakeholderContacts.filter(c => c.email).map(c => ({
          id: c.id,
          email: c.email!,
          firstName: c.firstName,
          lastName: c.lastName,
          contactType: c.stakeholderType === "contact_type" ? c.stakeholderName : undefined,
        }))}
        onSuccess={() => {
          // Refresh data after successful send
          fetchJob()
          fetchRequests()
          fetchTasks()
          fetchTimeline()
        }}
      />

    </div>
  )
}
