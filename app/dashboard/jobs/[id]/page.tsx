"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { 
  ArrowLeft, Edit2, Save, X, Trash2, Calendar, Users, CheckCircle, 
  Clock, Archive, Mail, User, UserPlus, MessageSquare, Send, AlertCircle,
  Plus, ChevronDown, ChevronUp, Bell, RefreshCw, Building2, MoreHorizontal,
  FileText, FolderOpen, FileSpreadsheet, ExternalLink, Scale, ClipboardList
} from "lucide-react"
import { formatDistanceToNow, format, differenceInDays, differenceInHours, parseISO, startOfDay } from "date-fns"
import { parseDateOnly } from "@/lib/utils/timezone"

// Alias for backward compatibility - use parseDateOnly from centralized utility
const parseDateForDisplay = parseDateOnly
import { UI_LABELS } from "@/lib/ui-labels"
import { hasModuleAccess, canPerformAction, type ModuleKey } from "@/lib/permissions"
import { usePermissions } from "@/components/permissions-context"

// Design system components
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { SectionHeader } from "@/components/ui/section-header"

// Send Request Modal
import { SendRequestModal } from "@/components/jobs/send-request-modal"


// Collection components
import { CollectionTab } from "@/components/jobs/collection/collection-tab"


// Request card with expandable recipient grid

// Forms tab
import { FormsTab } from "@/components/jobs/forms-tab"
import { SendFormModal } from "@/components/jobs/send-form-modal"

// Draft Request Review Modal

// Task AI Summary
import { TaskAISummary } from "@/components/jobs/task-ai-summary"

// Report tab
import { ReportTab } from "@/components/jobs/report-tab"

// Reconciliation tab
import { ReconciliationTab } from "@/components/jobs/reconciliation/reconciliation-tab"

// Task-scoped tabs
import { AnalysisTab } from "@/components/jobs/analysis-tab"
import { AgentTab } from "@/components/jobs/agent-tab"

// Tab-to-task-type mapping: which tabs are visible for each task type
const TASK_TYPE_TAB_MAP: Record<string, string[]> = {
  request: ["requests", "collection", "agent"],
  form: ["forms", "agent"],
  report: ["report", "agent"],
  reconciliation: ["reconciliation", "agent"],
  analysis: ["analysis", "agent"],
  other: [],  // Overview only
}


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


interface Job {
  id: string
  name: string
  description: string | null
  ownerId: string
  status: string
  lineageId: string | null
  dueDate: string | null
  labels: any | null
  boardId: string | null
  board?: { id: string; name: string; cadence: string | null; periodStart: string | null; periodEnd: string | null } | null
  createdAt: string
  updatedAt: string
  owner: JobOwner
  collaborators?: JobCollaborator[]
  client?: { id: string; firstName: string; lastName: string | null; email: string | null; companyName: string | null } | null
  taskCount: number
  respondedCount: number
  completedCount: number
  collectedItemCount?: number
  generatedReportCount?: number
  reconciliationRunCount?: number
  isSnapshot?: boolean
  // Report configuration (for REPORTS type)
  reportDefinitionId?: string | null
  reportFilterBindings?: Record<string, string[]> | null
  // Reconciliation configuration
  reconciliationConfigId?: string | null
  // Task type for agent integration
  taskType?: string | null
}

interface Permissions {
  canEdit: boolean
  canUpdateStatus: boolean
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
  const searchParams = useSearchParams()
  const jobId = params.id as string

  type TabId = "overview" | "requests" | "forms" | "collection" | "report" | "reconciliation" | "analysis" | "agent"

  // Get initial tab from URL query parameter
  const initialTab = searchParams.get("tab") as TabId | null

  // Core state
  const [job, setJob] = useState<Job | null>(null)
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const { role: sessionRole, orgActionPermissions } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>(initialTab || "overview")
  const [initialTabApplied, setInitialTabApplied] = useState(false)
  
  // Inline editing states
  const [editingName, setEditingName] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [editingDueDate, setEditingDueDate] = useState(false)

  // Data state
  const [tasks, setTasks] = useState<JobTask[]>([])
  const [requests, setRequests] = useState<JobRequest[]>([])
  const [formRequestCount, setFormRequestCount] = useState(0)
  const [comments, setComments] = useState<JobComment[]>([])
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])

  // Loading states
  const [tasksLoading, setTasksLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(true)

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editDueDate, setEditDueDate] = useState("")

  // Comment state
  const [newComment, setNewComment] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)

  // UI state
  const [awaitingExpanded, setAwaitingExpanded] = useState(true)
  const [requestsExpanded, setRequestsExpanded] = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(true)
  const [collectionExpanded, setCollectionExpanded] = useState(false)
  


  // Status dropdown
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false)
  // Task type dropdown
  const [isTaskTypeDropdownOpen, setIsTaskTypeDropdownOpen] = useState(false)
  const [customStatusInput, setCustomStatusInput] = useState("")

  // Collaborators
  const [collaborators, setCollaborators] = useState<JobCollaborator[]>([])
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string | null; email: string }>>([])
  const [isAddCollaboratorOpen, setIsAddCollaboratorOpen] = useState(false)
  const [addingCollaborator, setAddingCollaborator] = useState(false)

  // Send Request Modal
  const [isSendRequestOpen, setIsSendRequestOpen] = useState(false)
  // Send Form Modal
  const [isSendFormOpen, setIsSendFormOpen] = useState(false)

  // Notes
  const [notes, setNotes] = useState("")
  const [editingNotes, setEditingNotes] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  // Mention suggestions
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState("")
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([])

  // ============================================
  // Computed values
  // ============================================

  const awaitingTasks = useMemo(() => tasks.filter(t => t.status === "AWAITING_RESPONSE"), [tasks])
  const itemMode = useMemo(() => job ? getItemMode(job, tasks, requests) : "setup", [job, tasks, requests])
  
  // Tab visibility based on task type
  const visibleTabs = useMemo(() => {
    const tabs = new Set<string>(["overview"])
    const typeTabs = TASK_TYPE_TAB_MAP[job?.taskType || ""] || []
    typeTabs.forEach(t => tabs.add(t))
    return tabs
  }, [job?.taskType])

  // ============================================
  // Data Fetching
  // ============================================

  const fetchJob = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/task-instances/${jobId}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        const taskInstance = data.taskInstance
        setJob(taskInstance)
        setPermissions(data.permissions)
        setEditName(taskInstance.name)
        setEditDescription(taskInstance.description || "")
        setEditDueDate(taskInstance.dueDate ? taskInstance.dueDate.split("T")[0] : "")
      } else if (response.status === 404) {
        router.push("/dashboard/boards")
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/boards"
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
      const response = await fetch(`/api/requests?taskInstanceId=${jobId}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setTasks(data.requests || [])
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
      const response = await fetch(`/api/task-instances/${jobId}/requests`, { credentials: "include" })
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

  const fetchFormRequestCount = useCallback(async () => {
    try {
      const response = await fetch(`/api/task-instances/${jobId}/form-requests`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setFormRequestCount(data.formRequests?.length || 0)
      }
    } catch (error) {
      console.error("Error fetching form request count:", error)
    }
  }, [jobId])

  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/task-instances/${jobId}/comments`, { credentials: "include" })
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
      const response = await fetch(`/api/task-instances/${jobId}/timeline`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setTimelineEvents(data.events || [])
      }
    } catch (error) {
      console.error("Error fetching timeline:", error)
    }
  }, [jobId])


  const fetchCollaborators = useCallback(async () => {
    try {
      const response = await fetch(`/api/task-instances/${jobId}/collaborators`, { credentials: "include" })
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
        setTeamMembers((data.users || []).filter((u: any) => u != null).map((u: any) => ({ id: u.id, name: u.name || null, email: u.email || '' })))
      }
    } catch (error) {
      console.error("Error fetching team members:", error)
    }
  }, [])

  // Tier 1: Essential data needed for page chrome (header, tab labels, sidebar)
  useEffect(() => {
    Promise.all([
      fetchJob(),
      fetchRequests(),
      fetchFormRequestCount(),
      fetchCollaborators(),
      fetchTeamMembers(),
    ])
  }, [fetchJob, fetchRequests, fetchFormRequestCount, fetchCollaborators, fetchTeamMembers])

  // Default to task-type tab when job loads (unless URL has explicit ?tab=)
  useEffect(() => {
    if (job && !initialTabApplied && !searchParams.get("tab")) {
      const typeTabMap: Record<string, TabId> = {
        request: "requests",
        form: "forms",
        report: "report",
        reconciliation: "reconciliation",
        analysis: "analysis",
      }
      const defaultTab = job.taskType ? typeTabMap[job.taskType] : undefined
      if (defaultTab) {
        setActiveTab(defaultTab)
      }
      setInitialTabApplied(true)
    }
  }, [job, initialTabApplied, searchParams])

  // Tier 2: Lazy-load data only when the overview tab is active
  useEffect(() => {
    if (activeTab === "overview") {
      Promise.all([
        fetchComments(),
        fetchTimeline(),
        fetchTasks(),
      ])
    }
  }, [activeTab, fetchComments, fetchTimeline, fetchTasks])

  // ============================================
  // Handlers
  // ============================================

  // Inline save for individual fields
  const handleSaveField = async (field: "name" | "description" | "dueDate", value: string | null) => {
    setSaving(true)
    try {
      const response = await fetch(`/api/task-instances/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value })
      })
      if (response.ok) {
        const data = await response.json()
        setJob(data.taskInstance)
        // Update edit states
        setEditName(data.taskInstance.name)
        setEditDescription(data.taskInstance.description || "")
        setEditDueDate(data.taskInstance.dueDate ? data.taskInstance.dueDate.split("T")[0] : "")
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
      await fetch(`/api/task-instances/${jobId}`, {
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

  const handleTaskTypeChange = async (newType: string | null) => {
    setJob(prev => prev ? { ...prev, taskType: newType } : null)
    setIsTaskTypeDropdownOpen(false)
    try {
      await fetch(`/api/task-instances/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ taskType: newType })
      })
    } catch (error) {
      console.error("Error updating task type:", error)
      fetchJob()
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSubmittingComment(true)
    try {
      const response = await fetch(`/api/task-instances/${jobId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content: newComment.trim(),
          mentions: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
        })
      })
      if (response.ok) {
        const data = await response.json()
        setComments(prev => [data.comment, ...prev])
        setNewComment("")
        setMentionedUserIds([])
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
    
    const confirmMessage = hasRequests
      ? "This task has requests and will be archived (not permanently deleted). Continue?"
      : "Are you sure you want to permanently delete this task? This cannot be undone."
    
    if (!confirm(confirmMessage)) return
    
    try {
      const url = hasRequests 
        ? `/api/task-instances/${jobId}` 
        : `/api/task-instances/${jobId}?hard=true`
      
      const response = await fetch(url, {
        method: "DELETE",
        credentials: "include"
      })
      
      if (response.ok) {
        router.push("/dashboard/boards")
      } else {
        const data = await response.json()
        if (data.code === "HAS_REQUESTS") {
          const archiveResponse = await fetch(`/api/task-instances/${jobId}`, {
            method: "DELETE",
            credentials: "include"
          })
          if (archiveResponse.ok) {
            router.push("/dashboard/boards")
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
      const response = await fetch(`/api/task-instances/${jobId}/collaborators`, {
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

  const handleRemoveCollaborator = async (userId: string) => {
    try {
      await fetch(`/api/task-instances/${jobId}/collaborators?userId=${userId}`, {
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
      await fetch(`/api/task-instances/${jobId}`, {
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

  const handleConvertToRecurring = async () => {
    if (!job) return
    setSaving(true)
    try {
      const response = await fetch(`/api/task-instances/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ createLineage: true })
      })
      if (response.ok) {
        fetchJob()
        alert("Task converted to a recurring obligation. It will now appear in future periods of this board.")
      }
    } catch (error) {
      console.error("Error converting to recurring:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setNewComment(value)
    
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
    setMentionedUserIds(prev => prev.includes(user.id) ? prev : [...prev, user.id])
  }

  // Merge team members and collaborators for mention suggestions (deduped by user id)
  const mentionableUsers = useMemo(() => {
    const userMap = new Map<string, { id: string; name: string | null; email: string }>()
    for (const m of teamMembers) {
      if (m) userMap.set(m.id, m)
    }
    for (const c of collaborators) {
      if (c?.user) userMap.set(c.user.id, c.user)
    }
    return Array.from(userMap.values())
  }, [teamMembers, collaborators])

  const filteredMentionUsers = mentionableUsers.filter(m => {
    if (!mentionFilter) return true
    const name = (m.name || "").toLowerCase()
    const email = (m.email || "").toLowerCase()
    return name.includes(mentionFilter) || email.includes(mentionFilter)
  })

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
          action={{ label: "Back to Boards", onClick: () => router.push("/dashboard/boards") }}
        />
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="bg-white border-b border-gray-200 sticky top-16 z-10">
        <div className="px-8 py-3 flex items-center justify-between">
          <Link 
            href={job?.boardId ? `/dashboard/jobs?boardId=${job.boardId}` : "/dashboard/boards"} 
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">
              {job?.board ? `Back to ${job.board.name || 'Board'}` : "Back to Boards"}
            </span>
          </Link>
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "overview" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Overview
          </button>

          {/* Requests tab */}
          {visibleTabs.has("requests") && hasModuleAccess(sessionRole, "requests", orgActionPermissions) && (
            <button
              onClick={() => setActiveTab("requests")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === "requests" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Requests ({requests.length})
            </button>
          )}

          {/* Forms tab */}
          {visibleTabs.has("forms") && hasModuleAccess(sessionRole, "forms", orgActionPermissions) && (
            <button
              onClick={() => setActiveTab("forms")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === "forms" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Forms ({formRequestCount})
            </button>
          )}

          {/* Documents tab */}
          {visibleTabs.has("collection") && hasModuleAccess(sessionRole, "collection", orgActionPermissions) && (
            <button
              onClick={() => setActiveTab("collection")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "collection" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Documents ({job.collectedItemCount || 0})
            </button>
          )}

          {/* Report tab */}
          {visibleTabs.has("report") && hasModuleAccess(sessionRole, "reports", orgActionPermissions) && (
            <button
              onClick={() => setActiveTab("report")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "report" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Report ({job.generatedReportCount || 0})
            </button>
          )}

          {/* Reconciliation tab */}
          {visibleTabs.has("reconciliation") && hasModuleAccess(sessionRole, "reconciliations", orgActionPermissions) && (
            <button
              onClick={() => setActiveTab("reconciliation")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "reconciliation" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Reconciliation ({job.reconciliationRunCount || 0})
            </button>
          )}

          {/* Analysis tab */}
          {visibleTabs.has("analysis") && (
            <button
              onClick={() => setActiveTab("analysis")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "analysis" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Analysis
            </button>
          )}

          {/* Agent tab */}
          {visibleTabs.has("agent") && (
            <button
              onClick={() => setActiveTab("agent")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "agent" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Agent
            </button>
          )}

        </div>

        <div className="grid grid-cols-12 gap-8">
          <div className={`col-span-12 ${activeTab === "overview" ? "lg:col-span-8" : ""} space-y-6`}>
            {activeTab === "overview" && (
              <>
                <div className="pb-6 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
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
                            {permissions?.canEdit ? (
                              <div className="relative">
                                <button
                                  onClick={() => setIsTaskTypeDropdownOpen(!isTaskTypeDropdownOpen)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider transition-colors ${
                                    job.taskType === "reconciliation" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" :
                                    job.taskType === "report" ? "bg-blue-50 text-blue-700 hover:bg-blue-100" :
                                    job.taskType === "form" ? "bg-purple-50 text-purple-700 hover:bg-purple-100" :
                                    job.taskType === "request" ? "bg-amber-50 text-amber-700 hover:bg-amber-100" :
                                    job.taskType === "analysis" ? "bg-cyan-50 text-cyan-700 hover:bg-cyan-100" :
                                    "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                  }`}
                                >
                                  {job.taskType || "Set type"}
                                  <ChevronDown className="w-2.5 h-2.5" />
                                </button>
                                {isTaskTypeDropdownOpen && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsTaskTypeDropdownOpen(false)} />
                                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[160px]">
                                      <div className="py-1">
                                        {[
                                          { value: "request", label: "Request", color: "bg-amber-500" },
                                          { value: "form", label: "Form", color: "bg-purple-500" },
                                          { value: "report", label: "Report", color: "bg-blue-500" },
                                          { value: "reconciliation", label: "Reconciliation", color: "bg-emerald-500" },
                                          { value: "analysis", label: "Analysis", color: "bg-cyan-500" },
                                          { value: "other", label: "Other", color: "bg-gray-400" },
                                        ].map(opt => (
                                          <button
                                            key={opt.value}
                                            onClick={() => handleTaskTypeChange(opt.value)}
                                            className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${job.taskType === opt.value ? "bg-gray-50 font-medium" : ""}`}
                                          >
                                            <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                                            {opt.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            ) : job.taskType ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${
                                job.taskType === "reconciliation" ? "bg-emerald-50 text-emerald-700" :
                                job.taskType === "report" ? "bg-blue-50 text-blue-700" :
                                job.taskType === "form" ? "bg-purple-50 text-purple-700" :
                                job.taskType === "request" ? "bg-amber-50 text-amber-700" :
                                job.taskType === "analysis" ? "bg-cyan-50 text-cyan-700" :
                                "bg-gray-100 text-gray-600"
                              }`}>
                                {job.taskType}
                              </span>
                            ) : null}
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
                        {(permissions?.canEdit || permissions?.canUpdateStatus) ? (
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

                    {/* Delete Button */}
                    {(permissions?.isAdmin || permissions?.isOwner) && (
                      <button
                        onClick={handleDelete}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-3 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">Target Date:</span>
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
                            differenceInDays(parseDateForDisplay(job.dueDate), new Date()) < 0 
                              ? "text-red-600 font-medium" 
                              : differenceInDays(parseDateForDisplay(job.dueDate), new Date()) <= 3
                              ? "text-amber-600 font-medium"
                              : "text-gray-700"
                          }`}>
                            {format(parseDateForDisplay(job.dueDate), "EEEE, MMMM d, yyyy")}
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

                </div>

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
                      recipients: (r.recipients || []).filter(rec => rec != null).map(rec => ({
                        name: rec.name || 'Unknown',
                        email: rec.email || 'Unknown',
                        status: rec.status || 'NO_REPLY',
                        readStatus: rec.readStatus || 'unread',
                        hasReplied: rec.hasReplied || false
                      })),
                      reminderConfig: r.reminderConfig
                    }))}
                    stakeholderCount={0}
                    taskCount={job.taskCount}
                    respondedCount={job.respondedCount}
                    completedCount={job.completedCount}
                  />
                )}

                {/* Activity Timeline */}
                <Card>
                  <CardContent className="p-4">
                    <SectionHeader title="Activity" icon={<Clock className="w-4 h-4 text-gray-500" />} collapsible expanded={timelineExpanded} onToggle={() => setTimelineExpanded(!timelineExpanded)} />
                    {timelineExpanded && (
                      <div className="mt-3">
                        {timelineEvents.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">No activity yet</p>
                        ) : (
                          <div className="space-y-2">
                            {timelineEvents.map(event => (
                              <div key={event.id} className="flex items-start gap-3 py-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                  event.type === "email_sent" ? "bg-blue-100" :
                                  event.type === "email_reply" ? "bg-green-100" :
                                  event.type === "reminder_sent" ? "bg-amber-100" :
                                  "bg-gray-100"
                                }`}>
                                  {event.type === "email_sent" ? (
                                    <Mail className="w-3 h-3 text-blue-600" />
                                  ) : event.type === "email_reply" ? (
                                    <MessageSquare className="w-3 h-3 text-green-600" />
                                  ) : event.type === "reminder_sent" ? (
                                    <Clock className="w-3 h-3 text-amber-600" />
                                  ) : (
                                    <MessageSquare className="w-3 h-3 text-gray-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-700">
                                    {event.type === "email_sent" && (
                                      <>
                                        <span className="font-medium">{event.author?.name || event.author?.email?.split("@")[0] || "System"}</span>
                                        {" sent a request to "}
                                        <span className="font-medium">{event.recipientName || event.recipientEmail || "recipient"}</span>
                                      </>
                                    )}
                                    {event.type === "email_reply" && (
                                      <>
                                        <span className="font-medium">{event.recipientName || event.recipientEmail || "Contact"}</span>
                                        {" replied to a request"}
                                      </>
                                    )}
                                    {event.type === "reminder_sent" && (
                                      <>
                                        {"Reminder sent to "}
                                        <span className="font-medium">{event.recipientName || event.recipientEmail || "recipient"}</span>
                                      </>
                                    )}
                                    {event.type === "comment" && (
                                      <>
                                        <span className="font-medium">{event.author?.name || event.author?.email?.split("@")[0] || "Unknown"}</span>
                                        {" left a comment"}
                                      </>
                                    )}
                                  </p>
                                  <span className="text-[10px] text-gray-400">
                                    {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Comments Section */}
                <Card>
                  <CardContent className="p-4">
                    <SectionHeader title="Comments" icon={<MessageSquare className="w-4 h-4 text-gray-500" />} collapsible expanded={true} onToggle={() => {}} />
                    <div className="mt-3">
                      <div className="flex gap-3 mb-4">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">
                          {getInitials(job.owner?.name || null, job.owner?.email || '')}
                        </div>
                        <div className="flex-1 relative">
                          <Textarea placeholder="Add a comment..." value={newComment} onChange={handleCommentChange} className="min-h-[80px] resize-none text-sm" />
                          {showMentionSuggestions && filteredMentionUsers.length > 0 && (
                            <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                              {filteredMentionUsers.slice(0, 8).map(user => (
                                <button
                                  key={user.id}
                                  onClick={() => handleMentionSelect(user)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                >
                                  <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-medium text-gray-600 flex-shrink-0">
                                    {getInitials(user.name, user.email)}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-medium text-gray-900">{user.name || user.email.split("@")[0]}</span>
                                    {user.name && <span className="text-gray-500 ml-1.5">{user.email}</span>}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-[10px] text-gray-400">Type @ to mention team members</p>
                            <button onClick={handleAddComment} disabled={!newComment.trim() || submittingComment} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors">
                              <Send className="w-3 h-3" />
                              {submittingComment ? "Posting..." : "Post"}
                            </button>
                          </div>
                        </div>
                      </div>
                      {comments.length === 0 ? <p className="text-sm text-gray-500 text-center py-4">No comments yet</p> : (
                        <div className="space-y-3">
                          {comments.map(comment => (
                            <div key={comment.id} className="flex gap-3">
                              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">{getInitials(comment.author?.name || null, comment.author?.email || '')}</div>
                              <div className="flex-1 bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-xs text-gray-900">{comment.author?.name || comment.author?.email?.split("@")[0] || 'Unknown'}</span>
                                  <span className="text-[10px] text-gray-500">{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                                </div>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === "requests" && hasModuleAccess(sessionRole, "requests", orgActionPermissions) && (
              <div className="space-y-4">
                <SectionHeader title="Requests" count={requests.reduce((sum: number, r: any) => sum + (r.recipients?.length || 0), 0)} icon={<Mail className="w-4 h-4 text-blue-500" />} action={permissions?.canEdit && !!canPerformAction(sessionRole, "requests:manage", orgActionPermissions) ? <Button size="sm" variant="outline" onClick={() => setIsSendRequestOpen(true)}><Plus className="w-3 h-3 mr-1" /> New</Button> : undefined} />
                {requests.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <p className="text-sm text-gray-500">No requests sent yet</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {requests.flatMap((r: any) =>
                          (r.recipients || []).map((recipient: any) => (
                            <tr
                              key={recipient.id}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => {
                                if (recipient.latestReply) {
                                  router.push(`/dashboard/review/${recipient.id}`)
                                }
                              }}
                            >
                              <td className="px-4 py-2">
                                <span className="text-sm text-gray-900 truncate max-w-[250px] block">
                                  {r.generatedSubject || "Untitled"}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <div>
                                  <span className="text-sm font-medium text-gray-900">{recipient.name}</span>
                                  {recipient.email && recipient.email !== "Unknown" && (
                                    <span className="text-xs text-gray-400 ml-1">({recipient.email})</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <StatusBadge
                                  status={
                                    ["REPLIED", "HAS_ATTACHMENTS", "VERIFYING"].includes(recipient.status) && recipient.readStatus === "read"
                                      ? "READ"
                                      : recipient.status || "NO_REPLY"
                                  }
                                  size="sm"
                                />
                              </td>
                              <td className="px-4 py-2">
                                {recipient.riskLevel === "high" ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">High</span>
                                ) : recipient.riskLevel === "medium" ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Medium</span>
                                ) : recipient.riskLevel === "low" ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Low</span>
                                ) : (
                                  <span className="text-sm text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                <span className="text-sm text-gray-600">
                                  {recipient.sentMessage?.sentAt
                                    ? format(new Date(recipient.sentMessage.sentAt), "MMM d, yyyy")
                                    : r.sentAt
                                    ? format(new Date(r.sentAt), "MMM d, yyyy")
                                    : "—"}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                
              </div>
            )}

            {activeTab === "forms" && hasModuleAccess(sessionRole, "forms", orgActionPermissions) && (
              <div className="space-y-4">
                <SectionHeader
                  title="Forms"
                  count={formRequestCount}
                  icon={<ClipboardList className="w-4 h-4 text-purple-500" />}
                  action={permissions?.canEdit && !!canPerformAction(sessionRole, "forms:send", orgActionPermissions)
                    ? <Button size="sm" variant="outline" onClick={() => setIsSendFormOpen(true)}><Plus className="w-3 h-3 mr-1" /> Send Form</Button>
                    : undefined}
                />
                <FormsTab jobId={jobId} onFormsSent={() => fetchFormRequestCount()} />
              </div>
            )}

            {activeTab === "collection" && hasModuleAccess(sessionRole, "collection", orgActionPermissions) && (
              <div className="space-y-4">
                <SectionHeader title="Documents" count={job.collectedItemCount} icon={<FolderOpen className="w-4 h-4 text-purple-500" />} />
                <CollectionTab jobId={jobId} readOnly={!permissions?.canEdit || !canPerformAction(sessionRole, "collection:manage", orgActionPermissions)} />
              </div>
            )}

            {activeTab === "report" && hasModuleAccess(sessionRole, "reports", orgActionPermissions) && (
              <div className="space-y-4">
                <SectionHeader title="Report" icon={<FileText className="w-4 h-4 text-blue-600" />} />
                <ReportTab
                  jobId={jobId}
                  reportDefinitionId={job.reportDefinitionId || null}
                  boardPeriodStart={job.board?.periodStart}
                  boardCadence={job.board?.cadence}
                  canManageReports={canPerformAction(sessionRole, "reports:manage", orgActionPermissions)}
                  onConfigChange={(config) => {
                    // Update local state when config changes
                    setJob(prev => prev ? {
                      ...prev,
                      reportDefinitionId: config.reportDefinitionId,
                    } : null)
                  }}
                />
              </div>
            )}

            {activeTab === "reconciliation" && hasModuleAccess(sessionRole, "reconciliations", orgActionPermissions) && (
              <div className="space-y-4">
                <SectionHeader title="Reconciliation" icon={<Scale className="w-4 h-4 text-orange-600" />} />
                <ReconciliationTab jobId={jobId} taskName={job.name} readOnly={!permissions?.canEdit || !canPerformAction(sessionRole, "reconciliations:manage", orgActionPermissions)} onConfigChange={() => fetchJob()} />
              </div>
            )}

            {activeTab === "analysis" && (
              <AnalysisTab jobId={jobId} taskName={job.name} />
            )}

            {activeTab === "agent" && (
              <AgentTab
                jobId={jobId}
                lineageId={job.lineageId}
                taskType={job.taskType ?? null}
                taskName={job.name}
                canEdit={permissions?.canEdit}
                reconciliationConfigId={job.reconciliationConfigId ?? null}
                reportDefinitionId={job.reportDefinitionId ?? null}
                requestCount={requests.length}
                formRequestCount={formRequestCount}
                onJobUpdate={() => fetchJob()}
              />
            )}
          </div>

          {activeTab === "overview" && (
            <div className="col-span-12 lg:col-span-4 space-y-4">
              <Card>
                <CardContent className="p-4">
                  <h4 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-3">Owner</h4>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium">{getInitials(job.owner?.name || null, job.owner?.email || '')}</div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{job.owner?.name || job.owner?.email?.split("@")[0] || 'Unknown'}</div>
                      <div className="text-[10px] text-gray-500">{job.owner?.email || ''}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Collaborators</h4>
                    {permissions?.canManageCollaborators && (
                      <Popover open={isAddCollaboratorOpen} onOpenChange={setIsAddCollaboratorOpen}>
                        <PopoverTrigger asChild>
                          <button className="text-[10px] text-orange-500 hover:text-orange-600 flex items-center gap-1">
                            <UserPlus className="w-3 h-3" /> Add
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2" align="end">
                          <div className="space-y-1">
                            {teamMembers
                              .filter(m => m.id !== job?.ownerId && !collaborators.some(c => c.userId === m.id))
                              .map(member => (
                                <button
                                  key={member.id}
                                  onClick={() => handleAddCollaborator(member.id)}
                                  disabled={addingCollaborator}
                                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-gray-100 text-left text-sm disabled:opacity-50"
                                >
                                  <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-white text-[10px]">
                                    {getInitials(member?.name || null, member?.email || '')}
                                  </div>
                                  <span>{member?.name || member?.email?.split("@")[0] || 'Unknown'}</span>
                                </button>
                              ))}
                            {teamMembers.filter(m => m.id !== job?.ownerId && !collaborators.some(c => c.userId === m.id)).length === 0 && (
                              <p className="text-xs text-gray-500 p-2">No team members available</p>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  {collaborators.length === 0 ? <p className="text-xs text-gray-500 italic">None yet</p> : (
                    <div className="space-y-2">
                      {collaborators.map(c => (
                        <div key={c.id} className="flex items-center justify-between p-2 rounded bg-gray-50 text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-white text-[10px]">{getInitials(c.user?.name || null, c.user?.email || '')}</div>
                            <span>{c.user?.name || c.user?.email?.split("@")[0] || 'Unknown'}</span>
                          </div>
                          {permissions?.canManageCollaborators && <button onClick={() => handleRemoveCollaborator(c.userId)} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>


              {permissions?.isOwner && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Notes</h4>
                      {!editingNotes ? <button onClick={() => { setNotes(job.labels?.notes || ""); setEditingNotes(true); }} className="text-gray-400 hover:text-gray-600"><Edit2 className="w-3 h-3" /></button> : <div className="flex gap-2"><button onClick={handleSaveNotes} className="text-green-600"><Save className="w-3 h-3" /></button><button onClick={() => setEditingNotes(false)} className="text-gray-400"><X className="w-3 h-3" /></button></div>}
                    </div>
                    {editingNotes ? <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[100px] text-sm" /> : <p className="text-xs text-gray-600">{job.labels?.notes || "No notes yet"}</p>}
                  </CardContent>
                </Card>
              )}

            </div>
          )}
        </div>
      </div>

      <SendRequestModal
        open={isSendRequestOpen}
        onOpenChange={setIsSendRequestOpen}
        job={{ 
          id: job.id, 
          name: job.name, 
          description: job.description, 
          dueDate: job.dueDate, 
          labels: job.labels,
          board: job.board ? {
            id: job.board.id,
            name: job.board.name,
            cadence: job.board.cadence,
            periodStart: job.board.periodStart,
            periodEnd: job.board.periodEnd
          } : null
        }}
        stakeholderContacts={[]}
        onSuccess={() => { fetchJob(); fetchRequests(); fetchFormRequestCount(); fetchTasks(); fetchTimeline(); }}
      />

      <SendFormModal
        open={isSendFormOpen}
        onOpenChange={setIsSendFormOpen}
        jobId={job.id}
        jobName={job.name}
        dueDate={job.dueDate}
        board={job.board ? {
          id: job.board.id,
          name: job.board.name,
          cadence: job.board.cadence,
          periodStart: job.board.periodStart,
          periodEnd: job.board.periodEnd
        } : null}
        onSuccess={() => { fetchFormRequestCount(); }}
      />
    </div>
  )
}
