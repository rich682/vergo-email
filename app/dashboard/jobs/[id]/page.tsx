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
  Plus, ChevronDown, ChevronUp, Bell, RefreshCw, Tag, Building2, MoreHorizontal,
  FileText, FolderOpen, FileSpreadsheet, ExternalLink
} from "lucide-react"
import { formatDistanceToNow, format, differenceInDays, differenceInHours, parseISO, startOfDay } from "date-fns"
import { parseDateOnly } from "@/lib/utils/timezone"

// Alias for backward compatibility - use parseDateOnly from centralized utility
const parseDateForDisplay = parseDateOnly
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

// Form requests panel
import { FormRequestsPanel } from "@/components/jobs/form-requests-panel"

// Draft Request Review Modal
import { DraftRequestReviewModal } from "@/components/jobs/draft-request-review-modal"

// Task AI Summary
import { TaskAISummary } from "@/components/jobs/task-ai-summary"

// Report tab
import { ReportTab } from "@/components/jobs/report-tab"


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
  isSnapshot?: boolean
  // Report configuration (for REPORTS type)
  reportDefinitionId?: string | null
  reportFilterBindings?: Record<string, string[]> | null
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

  // Get initial tab from URL query parameter
  const initialTab = searchParams.get("tab") as "overview" | "requests" | "collection" | "report" | null

  // Core state
  const [job, setJob] = useState<Job | null>(null)
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<"overview" | "requests" | "collection" | "report">(initialTab || "overview")
  
  // Inline editing states
  const [editingName, setEditingName] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [editingDueDate, setEditingDueDate] = useState(false)

  // Data state
  const [tasks, setTasks] = useState<JobTask[]>([])
  const [requests, setRequests] = useState<JobRequest[]>([])
  const [formRequestCount, setFormRequestCount] = useState(0)
  const [draftRequests, setDraftRequests] = useState<any[]>([])
  const [comments, setComments] = useState<JobComment[]>([])
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])

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

  // Draft Request Review Modal
  const [isDraftReviewOpen, setIsDraftReviewOpen] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState<any>(null)

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
      const response = await fetch(`/api/task-instances/${jobId}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        const taskInstance = data.taskInstance
        setJob(taskInstance)
        setPermissions(data.permissions)
        setEditName(taskInstance.name)
        setEditDescription(taskInstance.description || "")
        setEditDueDate(taskInstance.dueDate ? taskInstance.dueDate.split("T")[0] : "")
        const jobLabels = taskInstance.labels
        if (Array.isArray(jobLabels)) {
          setEditLabels(jobLabels)
        } else if (jobLabels?.tags) {
          setEditLabels(jobLabels.tags)
        } else {
          setEditLabels([])
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

  const fetchDraftRequests = useCallback(async () => {
    try {
      // Use consolidated requests endpoint with includeDrafts param
      const response = await fetch(`/api/task-instances/${jobId}/requests?includeDrafts=true`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setDraftRequests(data.draftRequests || [])
      }
    } catch (error) {
      console.error("Error fetching draft requests:", error)
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

  useEffect(() => {
    fetchJob()
    fetchTasks()
    fetchRequests()
    fetchDraftRequests()
    fetchFormRequestCount()
    fetchComments()
    fetchTimeline()
    fetchCollaborators()
    fetchTeamMembers()
  }, [fetchJob, fetchTasks, fetchRequests, fetchDraftRequests, fetchFormRequestCount, fetchComments, fetchTimeline, fetchCollaborators, fetchTeamMembers])

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

  const handleAddLabel = async (label: string) => {
    if (!label.trim() || displayLabels.includes(label)) return
    const newLabels = [...displayLabels, label.trim()]
    setEditLabels(newLabels)
    setNewLabelInput("")
    try {
      await fetch(`/api/task-instances/${jobId}`, {
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
      await fetch(`/api/task-instances/${jobId}`, {
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

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSubmittingComment(true)
    try {
      const response = await fetch(`/api/task-instances/${jobId}/comments`, {
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
        router.push("/dashboard/jobs")
      } else {
        const data = await response.json()
        if (data.code === "HAS_REQUESTS") {
          const archiveResponse = await fetch(`/api/task-instances/${jobId}`, {
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
  }

  const filteredTeamMembers = teamMembers.filter(m => {
    if (!m) return false
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
          <div className="flex items-center gap-3">
            {permissions?.canEdit && (
              <Button 
                onClick={() => setIsSendRequestOpen(true)}
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Request
              </Button>
            )}
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
      </div>

      <div className="px-8 py-6">
        <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "overview" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Overview
          </button>

          {/* Requests tab - only visible to owners/admins */}
          {permissions?.canEdit && (
            <button
              onClick={() => setActiveTab("requests")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === "requests" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Requests ({requests.length + formRequestCount})
              {draftRequests.length > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                  {draftRequests.length} draft{draftRequests.length > 1 ? 's' : ''}
                </span>
              )}
            </button>
          )}

          {/* Evidence tab - only visible to owners/admins */}
          {permissions?.canEdit && (
            <button
              onClick={() => setActiveTab("collection")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "collection" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Evidence ({job.collectedItemCount || 0})
            </button>
          )}

          {(job.reportDefinitionId || permissions?.isAdmin) && (
            <button
              onClick={() => setActiveTab("report")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "report" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Report
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
                        {/* Draft Request Badge - shown in header when drafts exist */}
                        {draftRequests.length > 0 && (
                          <button
                            onClick={() => {
                              setSelectedDraft(draftRequests[0])
                              setIsDraftReviewOpen(true)
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                            title="Review draft requests copied from prior period"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            {draftRequests.length} draft{draftRequests.length > 1 ? 's' : ''} to review
                          </button>
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
                  </div>

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

                <Card>
                  <CardContent className="p-4">
                    <SectionHeader title="Activity" icon={<MessageSquare className="w-4 h-4 text-gray-500" />} collapsible expanded={timelineExpanded} onToggle={() => setTimelineExpanded(!timelineExpanded)} />
                    {timelineExpanded && (
                      <div className="mt-3">
                        <div className="flex gap-3 mb-4">
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium flex-shrink-0">
                            {getInitials(job.owner?.name || null, job.owner?.email || '')}
                          </div>
                          <div className="flex-1 relative">
                            <Textarea placeholder="Add a comment..." value={newComment} onChange={handleCommentChange} className="min-h-[80px] resize-none text-sm" />
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-[10px] text-gray-400">Type @ to mention team members</p>
                              <button onClick={handleAddComment} disabled={!newComment.trim() || submittingComment} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors">
                                <Send className="w-3 h-3" />
                                {submittingComment ? "Posting..." : "Post"}
                              </button>
                            </div>
                          </div>
                        </div>
                        {comments.length === 0 ? <p className="text-sm text-gray-500 text-center py-4">No activity yet</p> : (
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
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === "requests" && permissions?.canEdit && (
              <div className="space-y-4">
                {/* Draft Requests Banner */}
                {draftRequests.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-amber-900">
                          {draftRequests.length} Draft Request{draftRequests.length > 1 ? 's' : ''} from Prior Period
                        </h4>
                        <p className="text-xs text-amber-700 mt-1">
                          These requests were copied from the previous period. Review recipients and content before sending.
                        </p>
                        <div className="mt-3 space-y-2">
                          {draftRequests.slice(0, 3).map((draft: any) => (
                            <button
                              key={draft.id}
                              onClick={() => {
                                setSelectedDraft(draft)
                                setIsDraftReviewOpen(true)
                              }}
                              className="w-full flex items-center justify-between bg-white rounded-md px-3 py-2 border border-amber-100 hover:border-amber-300 hover:bg-amber-50 transition-colors cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium text-gray-900">
                                  {draft.entity ? `${draft.entity.firstName} ${draft.entity.lastName || ''}`.trim() : 'No recipient'}
                                </span>
                                {draft.entity?.email && (
                                  <span className="text-gray-500 text-xs">{draft.entity.email}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-amber-600 truncate max-w-[200px]">
                                  {draft.subject ? draft.subject.substring(0, 40) + (draft.subject.length > 40 ? '...' : '') : 'No subject'}
                                </span>
                                <span className="text-xs text-gray-400">Click to review</span>
                              </div>
                            </button>
                          ))}
                          {draftRequests.length > 3 && (
                            <button
                              onClick={() => {
                                setSelectedDraft(draftRequests[0])
                                setIsDraftReviewOpen(true)
                              }}
                              className="text-xs text-amber-700 hover:text-amber-900 underline"
                            >
                              + {draftRequests.length - 3} more - click to review all
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <SectionHeader title="Requests" count={requests.length} icon={<Mail className="w-4 h-4 text-blue-500" />} action={<Button size="sm" variant="outline" onClick={() => setIsSendRequestOpen(true)}><Plus className="w-3 h-3 mr-1" /> New</Button>} />
                <div className="space-y-3">
                  {requests.length === 0 ? <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200"><p className="text-sm text-gray-500">No requests sent yet</p></div> : requests.map(r => <RequestCardExpandable key={r.id} request={r} onRefresh={fetchRequests} />)}
                </div>
                
                {/* Form Requests */}
                <div className="mt-6">
                  <FormRequestsPanel jobId={jobId} />
                </div>
              </div>
            )}

            {activeTab === "collection" && permissions?.canEdit && (
              <div className="space-y-4">
                <SectionHeader title="Evidence Collection" count={job.collectedItemCount} icon={<FolderOpen className="w-4 h-4 text-purple-500" />} />
                <CollectionTab jobId={jobId} />
              </div>
            )}

            {activeTab === "report" && (job.reportDefinitionId || permissions?.isAdmin) && (
              <div className="space-y-4">
                <SectionHeader title="Report" icon={<FileText className="w-4 h-4 text-blue-600" />} />
                <ReportTab
                  jobId={jobId}
                  reportDefinitionId={job.reportDefinitionId || null}
                  reportFilterBindings={job.reportFilterBindings || null}
                  boardPeriodStart={job.board?.periodStart}
                  boardCadence={job.board?.cadence}
                  isAdmin={permissions?.isAdmin}
                  onConfigChange={(config) => {
                    // Update local state when config changes
                    setJob(prev => prev ? {
                      ...prev,
                      reportDefinitionId: config.reportDefinitionId,
                      reportFilterBindings: config.reportFilterBindings,
                    } : null)
                  }}
                />
              </div>
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
        onSuccess={() => { fetchJob(); fetchRequests(); fetchFormRequestCount(); fetchTasks(); fetchTimeline(); fetchDraftRequests(); }}
      />

      <DraftRequestReviewModal
        open={isDraftReviewOpen}
        onOpenChange={setIsDraftReviewOpen}
        taskInstanceId={jobId}
        draft={selectedDraft}
        availableContacts={[]}
        onSuccess={() => { 
          fetchDraftRequests()
          fetchRequests()
          fetchFormRequestCount()
          setSelectedDraft(null)
        }}
      />
    </div>
  )
}
