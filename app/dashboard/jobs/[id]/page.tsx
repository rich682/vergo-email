"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  Plus, ChevronDown, ChevronUp, ExternalLink, Bell, RefreshCw, Eye, Tag, Building2
} from "lucide-react"
import { formatDistanceToNow, format, differenceInDays, differenceInHours } from "date-fns"
import { UI_LABELS } from "@/lib/ui-labels"

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
  user: {
    id: string
    name: string | null
    email: string
  }
}

interface JobComment {
  id: string
  jobId: string
  authorId: string
  content: string
  mentions: string[] | null
  createdAt: string
  author: {
    id: string
    name: string | null
    email: string
  }
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
  status: "ACTIVE" | "WAITING" | "COMPLETED" | "ARCHIVED"
  dueDate: string | null
  labels: string[] | null
  stakeholders?: JobStakeholder[]
  createdAt: string
  updatedAt: string
  owner: JobOwner
  collaborators?: JobCollaborator[]
  client?: {
    id: string
    firstName: string
    lastName: string | null
    email: string | null
  } | null
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

interface TaskEntity {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
}

interface JobTask {
  id: string
  entityId: string | null
  entity: TaskEntity | null
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
  user: {
    id: string
    name: string | null
    email: string
  }
}

interface ContactType {
  value: string
  label: string
  count: number
}

interface Group {
  id: string
  name: string
  memberCount: number
}

interface Entity {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
}

// ============================================
// Next Action Logic
// ============================================

type NextActionPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
type NextActionSeverity = "high" | "medium" | "low" | "success"

interface NextAction {
  priority: NextActionPriority
  severity: NextActionSeverity
  message: string
  subMessage?: string
  primaryAction?: { label: string; href?: string; onClick?: () => void }
  secondaryAction?: { label: string; href?: string; onClick?: () => void }
  dismissible: boolean
}

function computeNextAction(
  job: Job,
  awaitingTasks: JobTask[],
  hasNewReplies: boolean
): NextAction | null {
  const now = new Date()
  const dueDate = job.dueDate ? new Date(job.dueDate) : null
  const daysUntilDue = dueDate ? differenceInDays(dueDate, now) : null

  // Priority 1: No requests yet
  if (job.taskCount === 0) {
    return {
      priority: 1,
      severity: "medium",
      message: "No requests yet",
      subMessage: "Add your first request to start tracking progress",
      primaryAction: { label: "Add First Request", href: `/dashboard/quest/new?jobId=${job.id}` },
      dismissible: false
    }
  }

  // Priority 2: Due date passed
  if (dueDate && daysUntilDue !== null && daysUntilDue < 0) {
    return {
      priority: 2,
      severity: "high",
      message: `Deadline passed!`,
      subMessage: `This item was due ${format(dueDate, "MMM d, yyyy")}`,
      primaryAction: { label: "Mark Complete" },
      secondaryAction: { label: "Extend Deadline" },
      dismissible: false
    }
  }

  // Priority 3: Due soon and behind
  if (dueDate && daysUntilDue !== null && daysUntilDue <= 2 && job.respondedCount < job.taskCount) {
    return {
      priority: 3,
      severity: "high",
      message: `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}`,
      subMessage: `${awaitingTasks.length} recipient${awaitingTasks.length !== 1 ? "s" : ""} still awaiting response`,
      primaryAction: { label: "Send Bulk Reminder" },
      dismissible: false
    }
  }

  // Priority 4: Tasks awaiting 7+ days
  const tasksAwaiting7Days = awaitingTasks.filter(t => {
    const created = new Date(t.createdAt)
    return differenceInDays(now, created) >= 7
  })
  if (tasksAwaiting7Days.length > 0) {
    const names = tasksAwaiting7Days.slice(0, 3).map(t => 
      t.entity?.email || "Unknown"
    ).join(", ")
    return {
      priority: 4,
      severity: "high",
      message: `${tasksAwaiting7Days.length} client${tasksAwaiting7Days.length !== 1 ? "s" : ""} awaiting response for 7+ days`,
      subMessage: names + (tasksAwaiting7Days.length > 3 ? ` and ${tasksAwaiting7Days.length - 3} more` : ""),
      primaryAction: { label: "Send Reminder" },
      secondaryAction: { label: "View Details" },
      dismissible: true
    }
  }

  // Priority 5: Tasks awaiting 3+ days
  const tasksAwaiting3Days = awaitingTasks.filter(t => {
    const created = new Date(t.createdAt)
    return differenceInDays(now, created) >= 3
  })
  if (tasksAwaiting3Days.length > 0) {
    const names = tasksAwaiting3Days.slice(0, 3).map(t => 
      t.entity?.email || "Unknown"
    ).join(", ")
    return {
      priority: 5,
      severity: "medium",
      message: `${tasksAwaiting3Days.length} client${tasksAwaiting3Days.length !== 1 ? "s" : ""} awaiting response for 3+ days`,
      subMessage: names + (tasksAwaiting3Days.length > 3 ? ` and ${tasksAwaiting3Days.length - 3} more` : ""),
      primaryAction: { label: "Send Reminder" },
      secondaryAction: { label: "View Details" },
      dismissible: true
    }
  }

  // Priority 6: New replies to review
  if (hasNewReplies) {
    return {
      priority: 6,
      severity: "medium",
      message: "New replies to review",
      primaryAction: { label: "View Replies" },
      dismissible: true
    }
  }

  // Priority 7: All responded
  if (job.respondedCount === job.taskCount && job.taskCount > 0 && job.completedCount < job.taskCount) {
    return {
      priority: 7,
      severity: "success",
      message: "All clients responded!",
      subMessage: "Review responses and mark complete",
      primaryAction: { label: "Review & Complete" },
      dismissible: true
    }
  }

  // Priority 8: All complete
  if (job.completedCount === job.taskCount && job.taskCount > 0) {
    return {
      priority: 8,
      severity: "success",
      message: `${UI_LABELS.jobSingular} complete`,
      subMessage: "All requests have been fulfilled",
      primaryAction: { label: `Archive ${UI_LABELS.jobSingular}` },
      dismissible: true
    }
  }

  // Priority 9: No action needed
  return null
}

// ============================================
// Status Config
// ============================================

const STATUS_CONFIG = {
  ACTIVE: { label: "Active", color: "bg-blue-100 text-blue-800", icon: RefreshCw },
  WAITING: { label: "Waiting", color: "bg-amber-100 text-amber-800", icon: Clock },
  COMPLETED: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle },
  ARCHIVED: { label: "Archived", color: "bg-gray-100 text-gray-600", icon: Archive }
}

const SEVERITY_STYLES = {
  high: "bg-red-50 border-red-200 text-red-800",
  medium: "bg-amber-50 border-amber-200 text-amber-800",
  low: "bg-blue-50 border-blue-200 text-blue-800",
  success: "bg-green-50 border-green-200 text-green-800"
}

// Helper to get initials
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

  // Tasks state (for awaiting response section + timeline)
  const [tasks, setTasks] = useState<JobTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  // Requests state (EmailDrafts associated with this job)
  const [requests, setRequests] = useState<JobRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)

  // Comments state
  const [comments, setComments] = useState<JobComment[]>([])
  const [newComment, setNewComment] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)

  // Timeline state
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [timelineError, setTimelineError] = useState<string | null>(null)

  // Tasks error state
  const [tasksError, setTasksError] = useState<string | null>(null)

  // Timeline filter
  const [timelineFilter, setTimelineFilter] = useState<"all" | "emails" | "comments">("all")

  // Collaborator management
  const [isAddCollaboratorOpen, setIsAddCollaboratorOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [addingCollaborator, setAddingCollaborator] = useState(false)

  // Next action banner
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Awaiting response expanded
  const [awaitingExpanded, setAwaitingExpanded] = useState(true)

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editStatus, setEditStatus] = useState<Job["status"]>("ACTIVE")
  const [editDueDate, setEditDueDate] = useState("")
  const [editLabels, setEditLabels] = useState<string[]>([])
  const [newLabelInput, setNewLabelInput] = useState("")

  // Stakeholder management
  const [isAddStakeholderOpen, setIsAddStakeholderOpen] = useState(false)
  const [stakeholderType, setStakeholderType] = useState<"contact_type" | "group" | "individual">("contact_type")
  const [stakeholders, setStakeholders] = useState<JobStakeholder[]>([])
  const [availableTypes, setAvailableTypes] = useState<ContactType[]>([])
  const [availableGroups, setAvailableGroups] = useState<Group[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Entity[]>([])
  const [searchingEntities, setSearchingEntities] = useState(false)

  // ============================================
  // Data Fetching
  // ============================================

  const fetchJob = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/jobs/${jobId}`, {
        credentials: "include"
      })

      if (response.ok) {
        const data = await response.json()
        setJob(data.job)
        setPermissions(data.permissions)
        // Initialize edit form
        setEditName(data.job.name)
        setEditDescription(data.job.description || "")
        setEditStatus(data.job.status)
        setEditDueDate(data.job.dueDate ? data.job.dueDate.split("T")[0] : "")
        // Parse labels from the job
        const jobLabels = data.job.labels
        if (Array.isArray(jobLabels)) {
          setEditLabels(jobLabels)
        } else if (jobLabels?.tags) {
          setEditLabels(jobLabels.tags)
        } else {
          setEditLabels([])
        }
        // Parse stakeholders
        if (data.job.stakeholders) {
          setStakeholders(data.job.stakeholders)
        }
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

  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/comments`, {
        credentials: "include"
      })
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
      setTimelineLoading(true)
      setTimelineError(null)
      const filterParam = timelineFilter !== "all" ? `&filter=${timelineFilter}` : ""
      const response = await fetch(`/api/jobs/${jobId}/timeline?limit=50${filterParam}`, {
        credentials: "include"
      })
      if (response.ok) {
        const data = await response.json()
        setTimelineEvents(data.events || [])
      } else {
        setTimelineError("Unable to load timeline")
        setTimelineEvents([])
      }
    } catch (error) {
      console.error("Error fetching timeline:", error)
      setTimelineError("Unable to load timeline")
      setTimelineEvents([])
    } finally {
      setTimelineLoading(false)
    }
  }, [jobId, timelineFilter])

  const fetchTasks = useCallback(async () => {
    try {
      setTasksLoading(true)
      setTasksError(null)
      const response = await fetch(`/api/tasks?jobId=${jobId}`, {
        credentials: "include"
      })
      if (response.ok) {
        const jobTasks = await response.json()
        setTasks(Array.isArray(jobTasks) ? jobTasks : [])
      } else {
        setTasksError("Unable to load tasks")
        setTasks([])
      }
    } catch (error) {
      console.error("Error fetching tasks:", error)
      setTasksError("Unable to load tasks")
      setTasks([])
    } finally {
      setTasksLoading(false)
    }
  }, [jobId])

  const fetchRequests = useCallback(async () => {
    try {
      setRequestsLoading(true)
      const response = await fetch(`/api/jobs/${jobId}/requests`, {
        credentials: "include"
      })
      if (response.ok) {
        const data = await response.json()
        setRequests(data.requests || [])
      } else {
        setRequests([])
      }
    } catch (error) {
      console.error("Error fetching requests:", error)
      setRequests([])
    } finally {
      setRequestsLoading(false)
    }
  }, [jobId])

  const fetchStakeholderOptions = useCallback(async () => {
    try {
      // Fetch contact types
      const typesRes = await fetch("/api/contacts/type-counts", { credentials: "include" })
      if (typesRes.ok) {
        const typesData = await typesRes.json()
        // Transform the response into the expected format
        const types: ContactType[] = []
        
        // Add built-in types
        const builtInCounts = typesData.builtInCounts || {}
        const builtInLabels: Record<string, string> = {
          EMPLOYEE: "Employee",
          VENDOR: "Vendor", 
          CLIENT: "Client",
          PARTNER: "Partner",
          OTHER: "Other"
        }
        for (const [value, label] of Object.entries(builtInLabels)) {
          if (builtInCounts[value] !== undefined) {
            types.push({ value, label, count: builtInCounts[value] })
          } else {
            // Include even if count is 0 so users can see all options
            types.push({ value, label, count: 0 })
          }
        }
        
        // Add custom types
        const customTypes = typesData.customTypes || []
        for (const ct of customTypes) {
          types.push({ value: `CUSTOM:${ct.label}`, label: ct.label, count: ct.count })
        }
        
        setAvailableTypes(types)
      }
      // Fetch groups - API returns array directly
      const groupsRes = await fetch("/api/groups", { credentials: "include" })
      if (groupsRes.ok) {
        const groupsData = await groupsRes.json()
        // API returns array directly, transform to expected format
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

  useEffect(() => {
    fetchJob()
    fetchComments()
    fetchTasks()
    fetchTimeline()
    fetchRequests()
    fetchStakeholderOptions()
  }, [fetchJob, fetchComments, fetchTasks, fetchTimeline, fetchRequests, fetchStakeholderOptions])

  // Search for individual contacts
  const searchEntities = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    setSearchingEntities(true)
    try {
      const response = await fetch(`/api/entities?search=${encodeURIComponent(query)}`, {
        credentials: "include"
      })
      if (response.ok) {
        const data = await response.json()
        // API returns array directly
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

  // ============================================
  // Computed Values
  // ============================================

  const awaitingTasks = useMemo(() => {
    return tasks.filter(t => t.status === "AWAITING_RESPONSE")
  }, [tasks])

  const hasNewReplies = useMemo(() => {
    const now = new Date()
    return tasks.some(t => {
      if (!t.hasReplies || !t.lastActivityAt) return false
      const lastActivity = new Date(t.lastActivityAt)
      return differenceInHours(now, lastActivity) <= 24
    })
  }, [tasks])

  const nextAction = useMemo(() => {
    if (!job) return null
    return computeNextAction(job, awaitingTasks, hasNewReplies)
  }, [job, awaitingTasks, hasNewReplies])

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
          status: editStatus,
          dueDate: editDueDate || null,
          labels: { tags: editLabels },
          stakeholders: stakeholders
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

  const cancelEdit = () => {
    if (job) {
      setEditName(job.name)
      setEditDescription(job.description || "")
      setEditStatus(job.status)
      setEditDueDate(job.dueDate ? job.dueDate.split("T")[0] : "")
      const jobLabels = job.labels
      if (Array.isArray(jobLabels)) {
        setEditLabels(jobLabels)
      } else if (jobLabels && typeof jobLabels === 'object' && 'tags' in jobLabels) {
        setEditLabels((jobLabels as any).tags || [])
      } else {
        setEditLabels([])
      }
      setStakeholders(job.stakeholders || [])
    }
    setEditing(false)
  }

  const handleAddLabel = () => {
    const label = newLabelInput.trim()
    if (label && !editLabels.includes(label)) {
      setEditLabels([...editLabels, label])
      setNewLabelInput("")
    }
  }

  const handleRemoveLabel = (label: string) => {
    setEditLabels(editLabels.filter(l => l !== label))
  }

  const handleAddStakeholder = (type: "contact_type" | "group" | "individual", id: string, name: string) => {
    const exists = stakeholders.some(s => s.type === type && s.id === id)
    if (!exists) {
      setStakeholders([...stakeholders, { type, id, name }])
    }
    setIsAddStakeholderOpen(false)
    setSearchQuery("")
    setSearchResults([])
  }

  const handleRemoveStakeholder = (type: string, id: string) => {
    setStakeholders(stakeholders.filter(s => !(s.type === type && s.id === id)))
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

  const handleDeleteComment = async (commentId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/comments?commentId=${commentId}`, {
        method: "DELETE",
        credentials: "include"
      })

      if (response.ok) {
        setComments(prev => prev.filter(c => c.id !== commentId))
      }
    } catch (error) {
      console.error("Error deleting comment:", error)
    }
  }

  const handleAddCollaborator = async () => {
    if (!selectedUserId) return

    setAddingCollaborator(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: selectedUserId })
      })

      if (response.ok) {
        await fetchJob()
        setIsAddCollaboratorOpen(false)
        setSelectedUserId("")
      }
    } catch (error) {
      console.error("Error adding collaborator:", error)
    } finally {
      setAddingCollaborator(false)
    }
  }

  const handleRemoveCollaborator = async (userId: string) => {
    if (!confirm("Remove this collaborator?")) return

    try {
      const response = await fetch(`/api/jobs/${jobId}/collaborators?userId=${userId}`, {
        method: "DELETE",
        credentials: "include"
      })

      if (response.ok) {
        await fetchJob()
      }
    } catch (error) {
      console.error("Error removing collaborator:", error)
    }
  }

  // ============================================
  // Render Helpers
  // ============================================

  const renderTimelineEvent = (event: TimelineEvent) => {
    const iconMap = {
      comment: <MessageSquare className="w-4 h-4 text-blue-500" />,
      email_sent: <Mail className="w-4 h-4 text-gray-500" />,
      email_reply: <Mail className="w-4 h-4 text-green-500" />,
      reminder_sent: <Bell className="w-4 h-4 text-amber-500" />
    }

    const bgMap = {
      comment: "bg-blue-50",
      email_sent: "bg-gray-50",
      email_reply: "bg-green-50",
      reminder_sent: "bg-amber-50"
    }

    const hasRequestLink = event.taskId && event.taskName && event.type !== "comment"

    const eventContent = (
      <div className={`flex gap-3 p-3 rounded-lg ${bgMap[event.type]} ${hasRequestLink ? "cursor-pointer hover:ring-2 hover:ring-gray-200 transition-all" : ""}`}>
        <div className="flex-shrink-0 mt-0.5">
          {iconMap[event.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {event.type === "comment" && event.author && (
              <span className="font-medium text-sm text-gray-900">
                {event.author.name || event.author.email.split("@")[0]}
              </span>
            )}
            {(event.type === "email_sent" || event.type === "email_reply") && (
              <span className="font-medium text-sm text-gray-900">
                {event.type === "email_reply" ? "Reply from " : "Email to "}
                {event.recipientName || event.recipientEmail || "Unknown"}
              </span>
            )}
            {event.type === "reminder_sent" && (
              <span className="font-medium text-sm text-gray-900">
                Reminder sent to {event.recipientName || event.recipientEmail}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-2">{event.content}</p>
          {event.taskName && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                {event.taskName}
              </span>
              {hasRequestLink && (
                <span className="text-xs text-blue-600 flex items-center gap-1">
                  View thread <ExternalLink className="w-3 h-3" />
                </span>
              )}
            </div>
          )}
        </div>
        {event.type === "comment" && (permissions?.isOwner || permissions?.isAdmin) && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleDeleteComment(event.id.replace("comment-", ""))
            }}
            className="text-gray-400 hover:text-red-500 self-start"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    )

    if (hasRequestLink) {
      return (
        <Link 
          key={event.id}
          href={`/dashboard/requests?campaignName=${encodeURIComponent(event.taskName!)}`}
        >
          {eventContent}
        </Link>
      )
    }

    return <div key={event.id}>{eventContent}</div>
  }

  // ============================================
  // Loading State
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-gray-500">{UI_LABELS.jobSingular} not found</p>
      </div>
    )
  }

  // Parse labels for display
  const displayLabels = Array.isArray(job.labels) 
    ? job.labels 
    : (job.labels as any)?.tags || []

  // ============================================
  // Main Render
  // ============================================

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push("/dashboard/jobs")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {UI_LABELS.jobsNavLabel}
      </button>

      {/* ============================================ */}
      {/* HEADER SECTION */}
      {/* ============================================ */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="editName">{UI_LABELS.jobSingular} Name</Label>
                    <Input
                      id="editName"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="editDescription">Description</Label>
                    <Input
                      id="editDescription"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Optional description"
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="editStatus">Status</Label>
                      <Select value={editStatus} onValueChange={(v) => setEditStatus(v as Job["status"])}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="WAITING">Waiting</SelectItem>
                          <SelectItem value="COMPLETED">Completed</SelectItem>
                          <SelectItem value="ARCHIVED">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="editDueDate">Deadline</Label>
                      <Input
                        id="editDueDate"
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* Labels Editor */}
                  <div>
                    <Label>Labels</Label>
                    <div className="flex flex-wrap gap-2 mt-2 mb-2">
                      {editLabels.map((label, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full"
                        >
                          {label}
                          <button
                            type="button"
                            onClick={() => handleRemoveLabel(label)}
                            className="hover:text-blue-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add label (e.g., January, Urgent)"
                        value={newLabelInput}
                        onChange={(e) => setNewLabelInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleAddLabel()
                          }
                        }}
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" onClick={handleAddLabel}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Stakeholders Editor */}
                  <div>
                    <Label>Stakeholders</Label>
                    <p className="text-xs text-gray-500 mb-2">Link contact types, groups, or individuals to this item</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {stakeholders.map((s, idx) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${
                            s.type === "contact_type" ? "bg-purple-100 text-purple-800" :
                            s.type === "group" ? "bg-green-100 text-green-800" :
                            "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {s.type === "contact_type" && <Building2 className="w-3 h-3" />}
                          {s.type === "group" && <Users className="w-3 h-3" />}
                          {s.type === "individual" && <User className="w-3 h-3" />}
                          {s.name}
                          <button
                            type="button"
                            onClick={() => handleRemoveStakeholder(s.type, s.id)}
                            className="hover:opacity-70"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <Dialog open={isAddStakeholderOpen} onOpenChange={setIsAddStakeholderOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline" size="sm">
                          <Plus className="w-4 h-4 mr-1" />
                          Add Stakeholder
                        </Button>
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
                            <div className="space-y-2">
                              <Label>Select Contact Type</Label>
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {availableTypes.map(type => (
                                  <button
                                    key={type.value}
                                    type="button"
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
                            </div>
                          )}

                          {stakeholderType === "group" && (
                            <div className="space-y-2">
                              <Label>Select Group</Label>
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {availableGroups.map(group => (
                                  <button
                                    key={group.id}
                                    type="button"
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
                            </div>
                          )}

                          {stakeholderType === "individual" && (
                            <div className="space-y-2">
                              <Label>Search Contacts</Label>
                              <Input
                                placeholder="Search by name or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                              />
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {searchingEntities ? (
                                  <div className="flex justify-center py-4">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400"></div>
                                  </div>
                                ) : searchResults.length > 0 ? (
                                  searchResults.map(entity => (
                                    <button
                                      key={entity.id}
                                      type="button"
                                      onClick={() => handleAddStakeholder(
                                        "individual", 
                                        entity.id, 
                                        `${entity.firstName} ${entity.lastName || ""}`.trim()
                                      )}
                                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
                                    >
                                      <div className="font-medium text-sm">
                                        {entity.firstName} {entity.lastName || ""}
                                      </div>
                                      {entity.email && (
                                        <div className="text-xs text-gray-500">{entity.email}</div>
                                      )}
                                    </button>
                                  ))
                                ) : searchQuery.length >= 2 ? (
                                  <p className="text-sm text-gray-500 text-center py-4">No contacts found</p>
                                ) : (
                                  <p className="text-sm text-gray-500 text-center py-4">Type at least 2 characters to search</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="outline" onClick={cancelEdit}>
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl font-bold text-gray-900">{job.name}</h1>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_CONFIG[job.status]?.color}`}>
                      {STATUS_CONFIG[job.status]?.label}
                    </span>
                  </div>
                  {job.description && (
                    <p className="text-gray-500 mb-3">{job.description}</p>
                  )}
                  
                  {/* Deadline - prominent display */}
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
                  {displayLabels.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {displayLabels.map((label: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stakeholders */}
                  {stakeholders.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {stakeholders.map((s, idx) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${
                            s.type === "contact_type" ? "bg-purple-100 text-purple-800" :
                            s.type === "group" ? "bg-green-100 text-green-800" :
                            "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {s.type === "contact_type" && <Building2 className="w-3 h-3" />}
                          {s.type === "group" && <Users className="w-3 h-3" />}
                          {s.type === "individual" && <User className="w-3 h-3" />}
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {job.owner.name || job.owner.email.split("@")[0]}
                    </span>
                    {job.client && (
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {job.client.firstName} {job.client.lastName || ""}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {!editing && permissions?.canEdit && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button variant="outline" onClick={handleDelete} className="text-red-600 hover:text-red-700">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ============================================ */}
      {/* NEXT ACTION BANNER */}
      {/* ============================================ */}
      {nextAction && !bannerDismissed && (
        <div className={`mb-6 p-4 rounded-lg border ${SEVERITY_STYLES[nextAction.severity]}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{nextAction.message}</p>
                {nextAction.subMessage && (
                  <p className="text-sm opacity-80 mt-0.5">{nextAction.subMessage}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {nextAction.primaryAction && (
                nextAction.primaryAction.href ? (
                  <Link href={nextAction.primaryAction.href}>
                    <Button size="sm" className="bg-white text-gray-900 hover:bg-gray-100 border">
                      {nextAction.primaryAction.label}
                    </Button>
                  </Link>
                ) : (
                  <Button size="sm" className="bg-white text-gray-900 hover:bg-gray-100 border">
                    {nextAction.primaryAction.label}
                  </Button>
                )
              )}
              {nextAction.secondaryAction && (
                <Button size="sm" variant="ghost">
                  {nextAction.secondaryAction.label}
                </Button>
              )}
              {nextAction.dismissible && (
                <button
                  onClick={() => setBannerDismissed(true)}
                  className="text-current opacity-60 hover:opacity-100"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============================================ */}
        {/* MAIN CONTENT COLUMN */}
        {/* ============================================ */}
        <div className="lg:col-span-2 space-y-6">
          {/* Primary Actions */}
          <div className="flex gap-3">
            <Link href={`/dashboard/quest/new?jobId=${job.id}`}>
              <Button className="bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Request
              </Button>
            </Link>
            <Button variant="outline" onClick={() => document.getElementById("comment-input")?.focus()}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Comment
            </Button>
          </div>

          {/* Awaiting Response Section */}
          <Card>
            <CardHeader className="pb-2">
              <button
                onClick={() => setAwaitingExpanded(!awaitingExpanded)}
                className="flex items-center justify-between w-full"
              >
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  Awaiting Response
                  <span className="text-sm font-normal text-gray-500">
                    ({awaitingTasks.length})
                  </span>
                </CardTitle>
                {awaitingExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
            </CardHeader>
            {awaitingExpanded && (
              <CardContent>
                {tasksLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                  </div>
                ) : tasksError ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-red-500">{tasksError}</p>
                    <button 
                      onClick={fetchTasks}
                      className="text-xs text-blue-600 hover:underline mt-1"
                    >
                      Try again
                    </button>
                  </div>
                ) : awaitingTasks.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No one is currently awaiting a response
                  </p>
                ) : (
                  <div className="space-y-3">
                    {awaitingTasks.map(task => {
                      const daysWaiting = differenceInDays(new Date(), new Date(task.createdAt))
                      const isUrgent = daysWaiting >= 7
                      const isWarning = daysWaiting >= 3 && daysWaiting < 7

                      return (
                        <div 
                          key={task.id} 
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            isUrgent ? "bg-red-50" : isWarning ? "bg-amber-50" : "bg-gray-50"
                          }`}
                        >
                          <Link 
                            href={task.campaignName 
                              ? `/dashboard/requests?campaignName=${encodeURIComponent(task.campaignName)}`
                              : `/dashboard/requests`
                            }
                            className="flex items-center gap-3 flex-1 hover:opacity-80"
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              isUrgent ? "bg-red-100" : isWarning ? "bg-amber-100" : "bg-gray-200"
                            }`}>
                              <User className={`w-4 h-4 ${
                                isUrgent ? "text-red-600" : isWarning ? "text-amber-600" : "text-gray-500"
                              }`} />
                            </div>
                            <div>
                              <div className="font-medium text-sm text-gray-900">
                                {task.entity?.email || "Unknown recipient"}
                              </div>
                              <div className="text-xs text-gray-500">
                                {task.campaignName || "Request"} • {daysWaiting} day{daysWaiting !== 1 ? "s" : ""} waiting
                              </div>
                            </div>
                          </Link>
                          <Button size="sm" variant="outline" className="text-xs">
                            <Bell className="w-3 h-3 mr-1" />
                            Send Reminder
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Requests Section */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-500" />
                  Requests
                  <span className="text-sm font-normal text-gray-500">
                    ({requests.length})
                  </span>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {requestsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : requests.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500 mb-3">No requests in this item yet</p>
                  <Link href={`/dashboard/quest/new?jobId=${jobId}`}>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                      <Plus className="w-4 h-4 mr-1" />
                      Add First Request
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {requests.map(request => (
                    <Link
                      key={request.id}
                      href={`/dashboard/requests?campaignName=${encodeURIComponent(request.suggestedCampaignName || '')}`}
                      className="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {request.generatedSubject || request.suggestedCampaignName || "Untitled Request"}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                            <span>{request.taskCount} recipient{request.taskCount !== 1 ? "s" : ""}</span>
                            <span>•</span>
                            <span>{format(new Date(request.createdAt), "MMM d, yyyy")}</span>
                            {request.sentAt && (
                              <>
                                <span>•</span>
                                <span className="text-green-600">Sent</span>
                              </>
                            )}
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Timeline
                </CardTitle>
                <div className="flex gap-1">
                  {(["all", "emails", "comments"] as const).map(filter => (
                    <button
                      key={filter}
                      onClick={() => setTimelineFilter(filter)}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        timelineFilter === filter
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Add Comment Input */}
              <div className="flex gap-2 mb-4">
                <Textarea
                  id="comment-input"
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[60px]"
                />
                <Button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || submittingComment}
                  className="bg-green-600 hover:bg-green-700 self-end"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              {/* Timeline Events */}
              {timelineLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                </div>
              ) : timelineError ? (
                <div className="text-center py-4">
                  <p className="text-sm text-amber-600">{timelineError}</p>
                  <p className="text-xs text-gray-500 mt-1">Comments are still available below</p>
                  <button 
                    onClick={fetchTimeline}
                    className="text-xs text-blue-600 hover:underline mt-2"
                  >
                    Try again
                  </button>
                  {comments.length > 0 && (
                    <div className="mt-4 space-y-3 text-left">
                      {comments.slice(0, 10).map(comment => (
                        <div key={comment.id} className="flex gap-3 p-3 rounded-lg bg-blue-50">
                          <MessageSquare className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
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
              ) : timelineEvents.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No activity yet
                </p>
              ) : (
                <div className="space-y-3">
                  {timelineEvents.slice(0, 20).map(event => renderTimelineEvent(event))}
                  {timelineEvents.length > 20 && (
                    <button className="w-full text-center text-sm text-blue-600 hover:underline py-2">
                      Load more...
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ============================================ */}
        {/* SIDEBAR */}
        {/* ============================================ */}
        <div className="space-y-6">
          {/* Owner Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Owner</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-medium">
                  {getInitials(job.owner.name, job.owner.email)}
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {job.owner.name || job.owner.email.split("@")[0]}
                  </div>
                  <div className="text-sm text-gray-500">{job.owner.email}</div>
                </div>
              </div>
              {permissions?.isOwner && (
                <p className="text-xs text-green-600 mt-2">You own this item</p>
              )}
            </CardContent>
          </Card>

          {/* Collaborators Card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-700">Collaborators</CardTitle>
                {permissions?.canManageCollaborators && (
                  <Dialog open={isAddCollaboratorOpen} onOpenChange={setIsAddCollaboratorOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2">
                        <UserPlus className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Collaborator</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div>
                          <Label>User ID</Label>
                          <Input
                            placeholder="Enter user ID"
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Enter the user ID of the team member to add
                          </p>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setIsAddCollaboratorOpen(false)}>
                            Cancel
                          </Button>
                          <Button
                            onClick={handleAddCollaborator}
                            disabled={!selectedUserId || addingCollaborator}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {addingCollaborator ? "Adding..." : "Add"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {(!job.collaborators || job.collaborators.length === 0) ? (
                <p className="text-sm text-gray-500">No collaborators yet</p>
              ) : (
                <div className="space-y-3">
                  {job.collaborators.map((collab) => (
                    <div key={collab.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
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
                          onClick={() => handleRemoveCollaborator(collab.userId)}
                          className="text-gray-400 hover:text-red-500"
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

          {/* Quick Stats Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-900">{format(new Date(job.createdAt), "MMM d, yyyy")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Last activity</span>
                  <span className="text-gray-900">
                    {formatDistanceToNow(new Date(job.updatedAt), { addSuffix: true })}
                  </span>
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
  )
}
