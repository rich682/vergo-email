"use client"

/**
 * Send Request Modal
 * 
 * Modal for composing and sending requests from a Checklist Item.
 * This is a thin UX wrapper over the existing Quest engine.
 * 
 * State Machine:
 * idle → drafting → ready → refining → ready → sending → success/error
 * 
 * Execution uses existing endpoints:
 * - POST /api/quests (create)
 * - POST /api/quests/[id]/execute (send)
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Mail,
  Send,
  Sparkles,
  AlertCircle,
  CheckCircle,
  Loader2,
  Users,
  Clock,
  X,
  Eye,
  ChevronLeft,
  ChevronRight,
  Tag,
  Filter,
  FileSpreadsheet,
  UserCheck,
  Bell,
  Settings,
  ArrowRight,
  Calendar,
  CalendarClock,
  ClipboardList,
  Paperclip,
  Upload,
  File,
  Trash2,
  Search,
  Check,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { formatPeriodDisplay } from "@/lib/utils/timezone"

// Data Personalization Flow
import { DataPersonalizationFlow } from "./data-personalization-flow"

// Form Request Flow
import { FormRequestFlow } from "./form-request-flow"

// Types
interface JobLabel {
  id: string
  name: string
  color: string | null
}

interface ContactLabelInfo {
  labelId: string
  labelName: string
  labelColor: string | null
}

interface StakeholderContact {
  id: string
  email: string | null
  firstName: string
  lastName: string | null
  contactType?: string
  labels?: ContactLabelInfo[] // Labels applied to this contact for this job
}

interface Job {
  id: string
  name: string
  description: string | null
  dueDate: string | null
  labels: any
  board?: {
    id: string
    name: string
    cadence: string | null
    periodStart: string | null
    periodEnd: string | null
  } | null
}

// Attachment for email
interface EmailAttachment {
  id: string
  filename: string
  content: string // Base64 encoded
  contentType: string
  size: number
}

// Max total attachment size (10MB)
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

interface SendRequestModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: Job
  stakeholderContacts?: StakeholderContact[] // Optional, no longer used - recipients fetched at request time
  onSuccess: () => void
}

type ModalState = 
  | "idle"
  | "mode_selection"
  | "selecting_recipients"
  | "drafting"
  | "ready"
  | "refining"
  | "sending"
  | "success"
  | "error"

type RequestMode = "standard" | "data_personalization" | "form_request"

type SendTiming = "immediate" | "scheduled"

interface DraftResponse {
  success: boolean
  draft: {
    subject: string
    body: string
  }
  recipients: Array<{
    id: string
    email: string
    firstName: string
    lastName: string | null
    contactType?: string
  }>
  itemContext: {
    name: string
    description: string | null
    dueDate: string | null
    labels: string[]
  }
  usedFallback: boolean
  noRecipients?: boolean
}

// Error codes from backend
type QuestErrorCode = 
  | "QUEST_UI_DISABLED"
  | "SENDER_NOT_CONNECTED"
  | "NO_VALID_RECIPIENTS"
  | "UNRESOLVED_VARIABLES"
  | "INVALID_REQUEST_PAYLOAD"
  | "ORG_ACCESS_DENIED"
  | "QUEST_NOT_READY"
  | "PROVIDER_SEND_FAILED"
  | "UNKNOWN"

// Map error codes to user-friendly messages
function getErrorMessage(errorCode: QuestErrorCode | undefined, fallbackMessage: string): string {
  switch (errorCode) {
    case "SENDER_NOT_CONNECTED":
      return "Connect your email account to send requests. Go to Settings → Email Accounts."
    case "NO_VALID_RECIPIENTS":
      return "No valid recipients selected. Please select at least one recipient with a valid email address."
    case "UNRESOLVED_VARIABLES":
      return "This message contains placeholders that can't be resolved for some recipients."
    case "PROVIDER_SEND_FAILED":
      return "Email provider failed to send. Please try again or check your email account connection."
    case "QUEST_NOT_READY":
      return "The request is not ready to send. Please try again."
    case "ORG_ACCESS_DENIED":
      return "You don't have permission to perform this action."
    case "INVALID_REQUEST_PAYLOAD":
      return "Invalid request data. Please refresh and try again."
    case "QUEST_UI_DISABLED":
      return "This feature is currently disabled."
    default:
      return fallbackMessage || "An unexpected error occurred. Please try again."
  }
}

export function SendRequestModal({
  open,
  onOpenChange,
  job,
  stakeholderContacts = [], // Optional, no longer used - recipients fetched at request time
  onSuccess,
}: SendRequestModalProps) {
  const router = useRouter()
  
  // Email account state
  const [hasEmailAccount, setHasEmailAccount] = useState<boolean | null>(null) // null = loading
  const [checkingAccounts, setCheckingAccounts] = useState(false)
  
  // State
  const [state, setState] = useState<ModalState>("mode_selection")
  const [mode, setMode] = useState<RequestMode | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [refinementInstruction, setRefinementInstruction] = useState("")
  const [sendTiming, setSendTiming] = useState<SendTiming>("immediate")
  const [scheduleOffsetDays, setScheduleOffsetDays] = useState(5) // Days before period end
  const [remindersEnabled, setRemindersEnabled] = useState(false)
  const [reminderDays, setReminderDays] = useState(7) // Default to weekly
  const [usedFallback, setUsedFallback] = useState(false)
  const [noRecipients, setNoRecipients] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Attachments
  const [attachments, setAttachments] = useState<EmailAttachment[]>([])
  
  // Computed: is this a recurring board (non-AD_HOC cadence with period dates)?
  const isRecurringBoard = Boolean(
    job.board?.cadence && 
    job.board.cadence !== "AD_HOC" && 
    job.board.periodStart && 
    job.board.periodEnd
  )
  
  // Recipients with exclusion toggles
  const [recipients, setRecipients] = useState<Array<StakeholderContact & { included: boolean }>>([])
  
  // Label filter state
  const [availableLabels, setAvailableLabels] = useState<JobLabel[]>([])
  const [selectedLabelFilter, setSelectedLabelFilter] = useState<string | null>(null) // null = all, "none" = no labels, or label ID
  const [showLabelFilter, setShowLabelFilter] = useState(false)
  
  // Preview state
  const [showPreview, setShowPreview] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  
  // Recipient search state
  const [recipientSearchQuery, setRecipientSearchQuery] = useState("")
  const [recipientSearchResults, setRecipientSearchResults] = useState<{
    entities: Array<{ id: string; firstName: string; email: string; isInternal?: boolean }>
  } | null>(null)
  const [recipientSearchLoading, setRecipientSearchLoading] = useState(false)
  const [searchTimeoutRef, setSearchTimeoutRef] = useState<NodeJS.Timeout | null>(null)
  
  // All available recipients for selection
  const [allAvailableRecipients, setAllAvailableRecipients] = useState<Array<{
    id: string
    name: string
    email: string
    type: "user" | "entity"
    subLabel?: string
  }>>([])
  const [loadingAllRecipients, setLoadingAllRecipients] = useState(false)
  const [recipientSelectionSearch, setRecipientSelectionSearch] = useState("")
  
  // Selected recipients for draft generation (used in selecting_recipients step)
  const [selectedRecipientsForDraft, setSelectedRecipientsForDraft] = useState<Map<string, {
    id: string
    name: string
    email: string
    type: "user" | "entity"
  }>>(new Map())
  
  // Send confirmation state
  const [showSendConfirmation, setShowSendConfirmation] = useState(false)
  
  // Reminder preview state
  const [showReminderPreview, setShowReminderPreview] = useState(false)
  const [reminderPreviews, setReminderPreviews] = useState<Array<{
    subject: string
    body: string
    reminderNumber: number
    tone: string
  }>>([])
  const [loadingReminderPreviews, setLoadingReminderPreviews] = useState(false)
  const [reminderPreviewIndex, setReminderPreviewIndex] = useState(0)

  // Check if user has connected email accounts
  const checkEmailAccounts = useCallback(async () => {
    setCheckingAccounts(true)
    try {
      const response = await fetch("/api/email-accounts", {
        credentials: "include",
      })
      if (response.ok) {
        const accounts = await response.json()
        // Check if there's at least one active account
        const hasActive = Array.isArray(accounts) && accounts.some((a: any) => a.isActive)
        setHasEmailAccount(hasActive)
      } else {
        setHasEmailAccount(false)
      }
    } catch (err) {
      console.error("Error checking email accounts:", err)
      setHasEmailAccount(false)
    } finally {
      setCheckingAccounts(false)
    }
  }, [])

  // Check email accounts when modal opens
  useEffect(() => {
    if (open && hasEmailAccount === null) {
      checkEmailAccounts()
    }
  }, [open, hasEmailAccount, checkEmailAccounts])

  // Fetch all available recipients (users and entities)
  const fetchAllRecipients = useCallback(async () => {
    try {
      setLoadingAllRecipients(true)
      const allRecipients: Array<{
        id: string
        name: string
        email: string
        type: "user" | "entity"
        subLabel?: string
      }> = []

      // Fetch internal users
      const usersResponse = await fetch("/api/users", { credentials: "include" })
      if (usersResponse.ok) {
        const usersData = await usersResponse.json()
        const users = usersData.users || []
        for (const user of users) {
          if (user.email) {
            allRecipients.push({
              id: user.id,
              name: user.name || user.email,
              email: user.email,
              type: "user",
              subLabel: user.role?.toLowerCase(),
            })
          }
        }
      }

      // Fetch all entities/contacts
      const entitiesResponse = await fetch("/api/entities", { credentials: "include" })
      if (entitiesResponse.ok) {
        const entities = await entitiesResponse.json()
        for (const entity of entities) {
          if (entity.email) {
            const fullName = entity.firstName + (entity.lastName ? ` ${entity.lastName}` : "")
            allRecipients.push({
              id: entity.id,
              name: fullName || entity.email,
              email: entity.email,
              type: "entity",
              subLabel: entity.contactType?.toLowerCase(),
            })
          }
        }
      }

      setAllAvailableRecipients(allRecipients)
    } catch (err) {
      console.error("Error fetching all recipients:", err)
    } finally {
      setLoadingAllRecipients(false)
    }
  }, [])

  // Toggle recipient selection
  const toggleRecipientSelection = useCallback((recipient: {
    id: string
    name: string
    email: string
    type: "user" | "entity"
  }) => {
    setSelectedRecipientsForDraft(prev => {
      const newMap = new Map(prev)
      if (newMap.has(recipient.id)) {
        newMap.delete(recipient.id)
      } else {
        newMap.set(recipient.id, recipient)
      }
      return newMap
    })
  }, [])

  // Fetch labels for this job
  const fetchLabels = useCallback(async () => {
    try {
      const response = await fetch(`/api/task-instances/${job.id}/labels`, {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setAvailableLabels(data.labels || [])
      }
    } catch (err) {
      console.error("Error fetching labels:", err)
    }
  }, [job.id])

  // Fetch contact labels for this job
  const fetchContactLabels = useCallback(async (): Promise<Map<string, ContactLabelInfo[]>> => {
    const labelMap = new Map<string, ContactLabelInfo[]>()
    try {
      const response = await fetch(`/api/task-instances/${job.id}/contact-labels`, {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        const contacts = data.contacts || []
        for (const contact of contacts) {
          const labels: ContactLabelInfo[] = (contact.jobLabels || []).map((jl: any) => ({
            labelId: jl.jobLabel.id,
            labelName: jl.jobLabel.name,
            labelColor: jl.jobLabel.color,
          }))
          labelMap.set(contact.id, labels)
        }
      }
    } catch (err) {
      console.error("Error fetching contact labels:", err)
    }
    return labelMap
  }, [job.id])

  // Fetch draft with selected recipients
  const fetchDraft = useCallback(async (selectedRecipientsList?: Array<{
    id: string
    name: string
    email: string
    type: "user" | "entity"
  }>) => {
    setState("drafting")
    setError(null)
    
    try {
      // Fetch labels and contact labels in parallel with draft
      const [draftResponse, contactLabelsMap] = await Promise.all([
        fetch(`/api/task-instances/${job.id}/request/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            recipients: selectedRecipientsList || []
          })
        }),
        fetchContactLabels(),
      ])

      if (!draftResponse.ok) {
        const data = await draftResponse.json()
        throw new Error(data.error || "Failed to generate draft")
      }

      const data: DraftResponse = await draftResponse.json()
      
      setSubject(data.draft.subject)
      setBody(data.draft.body)
      setUsedFallback(data.usedFallback)
      setNoRecipients(data.noRecipients || false)
      
      // Initialize recipients from response with labels (all included by default)
      setRecipients(
        data.recipients.map(r => ({
          ...r,
          included: true,
          labels: contactLabelsMap.get(r.id) || [],
        }))
      )
      
      setState("ready")
    } catch (err: any) {
      console.error("Draft fetch error:", err)
      setError(err.message || "Failed to generate draft")
      // Still allow editing with fallback - use selected recipients
      setSubject(`Request: ${job.name}`)
      setBody(`Hi {{First Name}},\n\nI'm reaching out regarding ${job.name}.\n\nPlease let me know if you have any questions.\n\nBest regards`)
      setUsedFallback(true)
      
      // Use selected recipients if available
      if (selectedRecipientsList && selectedRecipientsList.length > 0) {
        setRecipients(selectedRecipientsList.map(r => {
          const nameParts = r.name.split(' ')
          return {
            id: r.id,
            email: r.email,
            firstName: nameParts[0] || r.name,
            lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
            included: true,
            labels: []
          }
        }))
      } else {
        setRecipients([])
      }
      setState("ready")
    }
  }, [job.id, job.name, fetchContactLabels])

  // Handle proceeding from recipient selection to AI draft generation
  const handleProceedToDraft = useCallback(() => {
    const selectedList = Array.from(selectedRecipientsForDraft.values())
    if (selectedList.length === 0) {
      setError("Please select at least one recipient")
      return
    }
    // Generate draft with selected recipients
    fetchDraft(selectedList)
  }, [selectedRecipientsForDraft, fetchDraft])

  // Fetch labels when standard mode is selected (but not draft - that comes after recipient selection)
  useEffect(() => {
    if (open && mode === "standard" && (state === "idle" || state === "selecting_recipients")) {
      fetchLabels()
    }
  }, [open, mode, state, fetchLabels])

  // Handle mode selection
  const handleModeSelect = (selectedMode: RequestMode) => {
    setMode(selectedMode)
    if (selectedMode === "standard") {
      setState("selecting_recipients") // Go to recipient selection first
    } else if (selectedMode === "data_personalization") {
      setState("idle") // Move past mode_selection to show the flow component
    } else if (selectedMode === "form_request") {
      setState("idle") // Move past mode_selection to show the form request flow
    }
  }

  // Load all recipients when entering selecting_recipients state
  useEffect(() => {
    if (state === "selecting_recipients" && allAvailableRecipients.length === 0) {
      fetchAllRecipients()
    }
  }, [state, allAvailableRecipients.length, fetchAllRecipients])

  // Debounced recipient search
  const handleRecipientSearch = useCallback((query: string) => {
    setRecipientSearchQuery(query)
    
    // Clear previous timeout
    if (searchTimeoutRef) {
      clearTimeout(searchTimeoutRef)
    }
    
    // Clear results if query too short
    if (query.length < 2) {
      setRecipientSearchResults(null)
      return
    }
    
    // Debounce the search
    const timeout = setTimeout(async () => {
      setRecipientSearchLoading(true)
      try {
        const response = await fetch(`/api/recipients/search?q=${encodeURIComponent(query)}`, {
          credentials: "include"
        })
        if (response.ok) {
          const data = await response.json()
          setRecipientSearchResults({ entities: data.entities || [] })
        }
      } catch (err) {
        console.error("Error searching recipients:", err)
      } finally {
        setRecipientSearchLoading(false)
      }
    }, 300)
    
    setSearchTimeoutRef(timeout)
  }, [searchTimeoutRef])

  // Add recipient from search
  const addRecipientFromSearch = useCallback((entity: { id: string; firstName: string; email: string }) => {
    // Check if already in recipients
    if (recipients.some(r => r.id === entity.id)) {
      return
    }
    
    setRecipients(prev => [
      ...prev,
      {
        id: entity.id,
        email: entity.email,
        firstName: entity.firstName,
        lastName: null,
        included: true,
        labels: []
      }
    ])
    
    // Clear search
    setRecipientSearchQuery("")
    setRecipientSearchResults(null)
  }, [recipients])

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setState("mode_selection")
      setMode(null)
      setSubject("")
      setBody("")
      setRefinementInstruction("")
      setSendTiming("immediate")
      setScheduleOffsetDays(5)
      setRemindersEnabled(false)
      setReminderDays(7)
      setUsedFallback(false)
      setNoRecipients(false)
      setError(null)
      setAttachments([])
      setRecipients([])
      setShowPreview(false)
      setPreviewIndex(0)
      setAvailableLabels([])
      setSelectedLabelFilter(null)
      setShowLabelFilter(false)
      setShowReminderPreview(false)
      setReminderPreviews([])
      setReminderPreviewIndex(0)
      setHasEmailAccount(null) // Reset so we re-check next time
      // Reset search state
      setRecipientSearchQuery("")
      setRecipientSearchResults(null)
      if (searchTimeoutRef) clearTimeout(searchTimeoutRef)
      // Reset recipient selection state
      setSelectedRecipientsForDraft(new Map())
      setRecipientSelectionSearch("")
      setAllAvailableRecipients([])
    }
  }, [open, searchTimeoutRef])

  // Fetch reminder previews
  const fetchReminderPreviews = async () => {
    if (!subject.trim() || !body.trim()) {
      setError("Please enter a subject and body before previewing reminders")
      return
    }
    
    setLoadingReminderPreviews(true)
    setShowReminderPreview(true)
    
    try {
      const response = await fetch(`/api/task-instances/${job.id}/request/reminder-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          recipientName: recipients.find(r => r.included)?.firstName || "{{First Name}}",
          reminderDays
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to generate reminder previews")
      }

      const data = await response.json()
      setReminderPreviews(data.drafts || [])
      setReminderPreviewIndex(0)
    } catch (err: any) {
      console.error("Error fetching reminder previews:", err)
      setError(err.message || "Failed to generate reminder previews")
      setShowReminderPreview(false)
    } finally {
      setLoadingReminderPreviews(false)
    }
  }

  // Handle file attachment
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newAttachments: EmailAttachment[] = []
    let totalSize = attachments.reduce((sum, a) => sum + a.size, 0)

    for (const file of Array.from(files)) {
      // Check total size
      if (totalSize + file.size > MAX_ATTACHMENT_SIZE) {
        setError(`Total attachment size cannot exceed ${Math.round(MAX_ATTACHMENT_SIZE / 1024 / 1024)}MB`)
        break
      }

      // Read file as base64
      const content = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          // Remove data URL prefix to get just base64
          const base64 = result.split(',')[1] || result
          resolve(base64)
        }
        reader.readAsDataURL(file)
      })

      newAttachments.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        filename: file.name,
        content,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      })

      totalSize += file.size
    }

    setAttachments(prev => [...prev, ...newAttachments])
    // Reset input
    e.target.value = ''
  }

  // Remove attachment
  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  // Handle refinement
  const handleRefine = async () => {
    if (!refinementInstruction.trim()) return
    
    setState("refining")
    setError(null)
    
    try {
      const response = await fetch(`/api/task-instances/${job.id}/request/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          instruction: refinementInstruction.trim(),
          currentDraft: { subject, body },
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to refine draft")
      }

      const data = await response.json()
      
      setSubject(data.draft.subject)
      setBody(data.draft.body)
      setRefinementInstruction("")
      setState("ready")
    } catch (err: any) {
      console.error("Refine error:", err)
      setError(err.message || "Failed to refine draft")
      setState("ready")
    }
  }

  // Toggle recipient inclusion
  const toggleRecipient = (id: string) => {
    setRecipients(prev =>
      prev.map(r =>
        r.id === id ? { ...r, included: !r.included } : r
      )
    )
  }

  // Handle send button click - show confirmation first
  const handleSendClick = () => {
    const includedRecipients = recipients.filter(r => r.included)
    
    if (includedRecipients.length === 0) {
      setError("Please select at least one recipient")
      return
    }
    
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required")
      return
    }

    // Show confirmation dialog
    setShowSendConfirmation(true)
  }

  // Handle confirmed send
  const handleSendConfirmed = async () => {
    setShowSendConfirmation(false)
    const includedRecipients = recipients.filter(r => r.included)

    setState("sending")
    setError(null)

    try {
      // Build interpretation matching existing Quest structure
      // Separate entity IDs and user IDs based on selected recipient types
      const selectedRecipientTypes = Array.from(selectedRecipientsForDraft.values())
      const entityIds = selectedRecipientTypes.filter(r => r.type === "entity").map(r => r.id)
      const userIds = selectedRecipientTypes.filter(r => r.type === "user").map(r => r.id)
      
      // Fallback: if no typed recipients, treat all as entities (legacy behavior)
      const fallbackEntityIds = entityIds.length === 0 && userIds.length === 0
        ? includedRecipients.map(r => r.id)
        : entityIds

      const isScheduled = sendTiming === "scheduled"

      const interpretation = {
        recipientSelection: {
          entityIds: fallbackEntityIds.length > 0 ? fallbackEntityIds : undefined,
          userIds: userIds.length > 0 ? userIds : undefined,
        },
        scheduleIntent: {
          sendTiming: isScheduled ? "scheduled" as const : "immediate" as const,
          deadline: job.dueDate || undefined,
        },
        reminderIntent: {
          enabled: isScheduled ? false : remindersEnabled, // Reminders disabled for scheduled
          frequency: remindersEnabled && !isScheduled ? "custom" : undefined,
          customDays: remindersEnabled && !isScheduled ? reminderDays : undefined,
          stopCondition: "reply_or_deadline" as const,
        },
        requestType: "one-off" as const,
        confidence: "high" as const,
        interpretationSummary: {
          audienceDescription: `${includedRecipients.length} stakeholder${includedRecipients.length !== 1 ? "s" : ""}`,
          scheduleDescription: isScheduled ? `Scheduled: ${scheduleOffsetDays} days before period end` : "Send immediately",
          assumptions: ["Auto-drafted from Item context"],
        },
        warnings: [],
        resolvedCounts: {
          matchingRecipients: includedRecipients.length,
          excludedCount: recipients.length - includedRecipients.length,
        },
      }

      // For scheduled sends, create a draft request directly
      if (isScheduled) {
        // Create draft request via the task-instances requests endpoint
        const draftResponse = await fetch(`/api/task-instances/${job.id}/requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action: "create_draft",
            entityId: includedRecipients[0]?.id, // Primary recipient
            subject: subject.trim(),
            body: body.trim(),
            scheduleConfig: {
              mode: "period_aware",
              anchor: "period_end",
              offsetDays: -scheduleOffsetDays, // Negative = days before period end
              weekendRule: "previous",
              sendTime: "09:00"
            },
            // Reminders disabled for now (coming soon)
            remindersEnabled: false,
          }),
        })

        if (!draftResponse.ok) {
          // Try to parse error response, but handle empty response gracefully
          let errorMessage = "Failed to schedule request"
          try {
            const data = await draftResponse.json()
            errorMessage = data.error || data.message || errorMessage
          } catch {
            // Response body was empty or invalid JSON
            errorMessage = `Server error (${draftResponse.status}): ${draftResponse.statusText || "Unknown error"}`
          }
          throw new Error(errorMessage)
        }

        // Parse success response
        const result = await draftResponse.json()
        console.log(`Request scheduled: ${scheduleOffsetDays} days before period end`, result)
        setState("success")
        
        // Auto-close after success
        setTimeout(() => {
          onOpenChange(false)
          onSuccess()
        }, 1500)
        return
      }

      // For immediate sends, use the Quest flow
      // 1. Create Quest via existing endpoint
      const createResponse = await fetch("/api/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          originalPrompt: `Request for Item: ${job.name}`,
          interpretation,
          jobId: job.id,
          confirmedSchedule: { sendTiming: "immediate" },
          confirmedReminders: remindersEnabled
            ? {
                enabled: true,
                frequency: "custom",
                customDays: reminderDays,
                stopCondition: "reply_or_deadline",
              }
            : { enabled: false },
        }),
      })

      if (!createResponse.ok) {
        const data = await createResponse.json()
        const errorMessage = getErrorMessage(data.errorCode, data.error || "Failed to create request")
        throw new Error(errorMessage)
      }

      const { quest } = await createResponse.json()

      // 2. Execute via existing endpoint (with subject/body overrides)
      const executeResponse = await fetch(`/api/quests/${quest.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          attachments: attachments.map(a => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        }),
      })

      if (!executeResponse.ok) {
        const data = await executeResponse.json()
        // Use data.message for actual error details, fall back to data.error
        const errorMessage = getErrorMessage(data.errorCode, data.message || data.error || "Failed to send request")
        throw new Error(errorMessage)
      }

      const result = await executeResponse.json()
      
      console.log(`Request sent: ${result.emailsSent} emails`)
      
      setState("success")
      
      // Auto-close after success
      setTimeout(() => {
        onOpenChange(false)
        onSuccess()
      }, 1500)
      
    } catch (err: any) {
      console.error("Send error:", err)
      setError(err.message || "Failed to send request")
      setState("error")
    }
  }

  // Filter recipients by label
  const applyLabelFilter = useCallback((labelFilter: string | null) => {
    setSelectedLabelFilter(labelFilter)
    
    // Update recipient inclusion based on filter
    setRecipients(prev => prev.map(r => {
      if (labelFilter === null) {
        // Show all - keep current inclusion state
        return r
      } else if (labelFilter === "none") {
        // Only include recipients with no labels
        return { ...r, included: !r.labels || r.labels.length === 0 }
      } else {
        // Only include recipients with the selected label
        return { ...r, included: r.labels?.some(l => l.labelId === labelFilter) || false }
      }
    }))
  }, [])

  // Computed values
  const includedCount = recipients.filter(r => r.included).length
  const totalCount = recipients.length
  const includedRecipients = recipients.filter(r => r.included)
  
  // Count recipients by label for filter display
  const labelCounts = useMemo(() => {
    const counts = new Map<string, number>()
    let noLabelCount = 0
    
    for (const r of recipients) {
      if (!r.labels || r.labels.length === 0) {
        noLabelCount++
      } else {
        for (const label of r.labels) {
          counts.set(label.labelId, (counts.get(label.labelId) || 0) + 1)
        }
      }
    }
    
    return { labelCounts: counts, noLabelCount }
  }, [recipients])
  
  // Preview helpers
  const currentPreviewRecipient = includedRecipients[previewIndex]
  
  const getPersonalizedBody = (recipient: StakeholderContact | undefined) => {
    if (!recipient) return body
    return body
      .replace(/\{\{First Name\}\}/gi, recipient.firstName || "")
      .replace(/\{\{Last Name\}\}/gi, recipient.lastName || "")
      .replace(/\{\{Email\}\}/gi, recipient.email || "")
  }
  
  const nextPreview = () => {
    setPreviewIndex(prev => (prev + 1) % includedRecipients.length)
  }
  
  const prevPreview = () => {
    setPreviewIndex(prev => (prev - 1 + includedRecipients.length) % includedRecipients.length)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-500" />
            Send Request
          </DialogTitle>
          <DialogDescription>
            Send a request for: <strong>{job.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
        {/* Loading email account check */}
        {(checkingAccounts || hasEmailAccount === null) && state === "mode_selection" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            <p className="mt-3 text-sm text-gray-500">Checking email connection...</p>
          </div>
        )}

        {/* No email account warning */}
        {hasEmailAccount === false && state === "mode_selection" && !checkingAccounts && (
          <div className="py-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                <Mail className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Connect an email account first
              </h3>
              <p className="text-sm text-gray-500 max-w-md mb-6">
                To send requests, you need to connect your Gmail or Microsoft email account. 
                This lets Vergo send emails on your behalf and track responses.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    onOpenChange(false)
                    router.push("/dashboard/settings")
                  }}
                  className="bg-gray-900 hover:bg-gray-800"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Go to Settings
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Mode Selection */}
        {state === "mode_selection" && hasEmailAccount === true && !checkingAccounts && (
          <div className="space-y-6 py-4">
            <p className="text-sm text-gray-600 text-center">
              Choose how you want to send this request
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Standard Mode */}
              <button
                onClick={() => handleModeSelect("standard")}
                className="flex flex-col items-center p-6 border-2 border-gray-200 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-all group"
              >
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                  <UserCheck className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Standard Request</h3>
                <p className="text-sm text-gray-500 text-center">
                  Send an AI-drafted email to selected recipients. Choose from your contacts and team members.
                </p>
                <span className="mt-3 text-xs text-blue-600 font-medium">
                  Select recipients at send time
                </span>
              </button>

              {/* Data Personalization Mode */}
              <button
                onClick={() => handleModeSelect("data_personalization")}
                className="flex flex-col items-center p-6 border-2 border-gray-200 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-all group"
              >
                <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors">
                  <FileSpreadsheet className="w-7 h-7 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Data Personalization</h3>
                <p className="text-sm text-gray-500 text-center">
                  Select a database with recipient data. Create personalized emails with merge fields.
                </p>
                <span className="mt-3 text-xs text-purple-600 font-medium">
                  Select from your databases
                </span>
              </button>

              {/* Form Request Mode */}
              <button
                onClick={() => handleModeSelect("form_request")}
                className="flex flex-col items-center p-6 border-2 border-gray-200 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-all group relative"
              >
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
                  <ClipboardList className="w-7 h-7 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Form Completion</h3>
                <p className="text-sm text-gray-500 text-center">
                  Send a form link for stakeholders to fill out. Collect structured data responses.
                </p>
                <span className="mt-3 text-xs text-green-600 font-medium">
                  Structured data collection
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Data Personalization Flow */}
        {mode === "data_personalization" && state !== "mode_selection" && (
          <DataPersonalizationFlow
            jobId={job.id}
            jobName={job.name}
            boardPeriod={
              job.board?.periodStart && job.board?.cadence
                ? formatPeriodDisplay(
                    job.board.periodStart,
                    job.board.periodEnd,
                    job.board.cadence as any,
                    "UTC"
                  )
                : null
            }
            onSuccess={() => {
              onOpenChange(false)
              onSuccess()
            }}
            onCancel={() => {
              setMode(null)
              setState("mode_selection")
            }}
          />
        )}

        {/* Form Request Flow */}
        {mode === "form_request" && state !== "mode_selection" && (
          <FormRequestFlow
            jobId={job.id}
            jobName={job.name}
            boardPeriod={
              job.board?.periodStart && job.board?.cadence
                ? formatPeriodDisplay(
                    job.board.periodStart,
                    job.board.periodEnd,
                    job.board.cadence as any,
                    "UTC"
                  )
                : null
            }
            deadlineDate={job.dueDate}
            onSuccess={() => {
              onOpenChange(false)
              onSuccess()
            }}
            onCancel={() => {
              setMode(null)
              setState("mode_selection")
            }}
          />
        )}

        {/* Recipient Selection for Standard Request */}
        {mode === "standard" && state === "selecting_recipients" && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setMode(null)
                  setState("mode_selection")
                  setSelectedRecipientsForDraft(new Map())
                  setRecipientSelectionSearch("")
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h3 className="font-medium text-gray-900">Select Recipients</h3>
                <p className="text-sm text-gray-500">
                  Choose who should receive this request
                </p>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name or email..."
                value={recipientSelectionSearch}
                onChange={(e) => setRecipientSelectionSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Selected Count */}
            {selectedRecipientsForDraft.size > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-orange-50 px-3 py-2 rounded-lg">
                <Users className="w-4 h-4 text-orange-500" />
                <span>{selectedRecipientsForDraft.size} recipient{selectedRecipientsForDraft.size !== 1 ? 's' : ''} selected</span>
              </div>
            )}

            {/* Recipient List */}
            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              {loadingAllRecipients ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  <span className="ml-2 text-sm text-gray-500">Loading contacts...</span>
                </div>
              ) : allAvailableRecipients.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No contacts found</p>
                  <p className="text-xs mt-1">Add team members or stakeholders to your organization first.</p>
                </div>
              ) : (
                <>
                  {/* Team Members Section */}
                  {allAvailableRecipients.filter(r => r.type === "user").length > 0 && (
                    <div>
                      <div className="px-3 py-2 bg-gray-50 border-b sticky top-0">
                        <span className="text-xs font-medium text-gray-500 uppercase">Team Members</span>
                      </div>
                      {allAvailableRecipients
                        .filter(r => r.type === "user")
                        .filter(r => 
                          recipientSelectionSearch === "" ||
                          r.name.toLowerCase().includes(recipientSelectionSearch.toLowerCase()) ||
                          r.email.toLowerCase().includes(recipientSelectionSearch.toLowerCase())
                        )
                        .map(recipient => (
                          <button
                            key={`user-${recipient.id}`}
                            onClick={() => toggleRecipientSelection(recipient)}
                            className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors ${
                              selectedRecipientsForDraft.has(recipient.id) ? 'bg-orange-50' : ''
                            }`}
                          >
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                              selectedRecipientsForDraft.has(recipient.id)
                                ? 'bg-orange-500 border-orange-500'
                                : 'border-gray-300'
                            }`}>
                              {selectedRecipientsForDraft.has(recipient.id) && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <div className="flex-1 text-left">
                              <div className="text-sm font-medium text-gray-900">{recipient.name}</div>
                              <div className="text-xs text-gray-500">{recipient.email}</div>
                            </div>
                            {recipient.subLabel && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                {recipient.subLabel}
                              </span>
                            )}
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Stakeholders Section */}
                  {allAvailableRecipients.filter(r => r.type === "entity").length > 0 && (
                    <div>
                      <div className="px-3 py-2 bg-gray-50 border-b border-t sticky top-0">
                        <span className="text-xs font-medium text-gray-500 uppercase">Stakeholders</span>
                      </div>
                      {allAvailableRecipients
                        .filter(r => r.type === "entity")
                        .filter(r => 
                          recipientSelectionSearch === "" ||
                          r.name.toLowerCase().includes(recipientSelectionSearch.toLowerCase()) ||
                          r.email.toLowerCase().includes(recipientSelectionSearch.toLowerCase())
                        )
                        .map(recipient => (
                          <button
                            key={`entity-${recipient.id}`}
                            onClick={() => toggleRecipientSelection(recipient)}
                            className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors ${
                              selectedRecipientsForDraft.has(recipient.id) ? 'bg-orange-50' : ''
                            }`}
                          >
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                              selectedRecipientsForDraft.has(recipient.id)
                                ? 'bg-orange-500 border-orange-500'
                                : 'border-gray-300'
                            }`}>
                              {selectedRecipientsForDraft.has(recipient.id) && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <div className="flex-1 text-left">
                              <div className="text-sm font-medium text-gray-900">{recipient.name}</div>
                              <div className="text-xs text-gray-500">{recipient.email}</div>
                            </div>
                            {recipient.subLabel && (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                {recipient.subLabel}
                              </span>
                            )}
                          </button>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setMode(null)
                  setState("mode_selection")
                  setSelectedRecipientsForDraft(new Map())
                  setRecipientSelectionSearch("")
                  setError(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleProceedToDraft}
                disabled={selectedRecipientsForDraft.size === 0}
                className="bg-orange-500 hover:bg-orange-600"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Drafting State */}
        {mode === "standard" && state === "drafting" && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-orange-500 animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-orange-400 rounded-full animate-ping" />
            </div>
            <h3 className="mt-4 font-medium text-gray-900">Drafting your email...</h3>
            <p className="text-sm text-gray-500 mt-1">Using Item context to generate a personalized draft</p>
          </div>
        )}

        {/* Success State */}
        {mode === "standard" && state === "success" && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              sendTiming === "scheduled" ? "bg-blue-100" : "bg-green-100"
            }`}>
              {sendTiming === "scheduled" ? (
                <CalendarClock className="w-8 h-8 text-blue-500" />
              ) : (
                <CheckCircle className="w-8 h-8 text-green-500" />
              )}
            </div>
            <h3 className="mt-4 font-medium text-gray-900">
              {sendTiming === "scheduled" ? "Draft Saved!" : "Request Sent!"}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {sendTiming === "scheduled" 
                ? "Review and send from the Requests tab"
                : `Sent to ${includedCount} recipient${includedCount !== 1 ? "s" : ""}`
              }
            </p>
          </div>
        )}

        {/* Ready/Refining/Error/Sending States - Show Form */}
        {mode === "standard" && (state === "ready" || state === "refining" || state === "error" || state === "sending") && (
          <div className="space-y-4">
            {/* Error Alert */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Error</p>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Fallback Warning */}
            {usedFallback && !error && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Using template draft</p>
                  <p className="text-sm text-amber-700">
                    AI generation was unavailable. You can edit the draft below.
                  </p>
                </div>
              </div>
            )}

            {/* Recipients - Collapsible Dropdown */}
            <div>
              <details className="group">
                <summary className="flex items-center justify-between cursor-pointer list-none">
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <Users className="w-4 h-4 text-gray-500" />
                    Recipients ({includedCount} of {totalCount})
                  </Label>
                  <div className="flex items-center gap-2">
                    {/* Label Filter */}
                    {availableLabels.length > 0 && (
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            setShowLabelFilter(!showLabelFilter)
                          }}
                          className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors ${
                            selectedLabelFilter !== null
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          <Filter className="w-3.5 h-3.5" />
                          {selectedLabelFilter === null 
                            ? "Filter" 
                            : selectedLabelFilter === "none"
                            ? "No label"
                            : availableLabels.find(l => l.id === selectedLabelFilter)?.name || "Filter"
                          }
                        </button>
                        
                        {showLabelFilter && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setShowLabelFilter(false)} 
                            />
                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[180px] py-1">
                              <button
                                type="button"
                                onClick={() => {
                                  applyLabelFilter(null)
                                  setShowLabelFilter(false)
                                }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                                  selectedLabelFilter === null ? "bg-gray-50 font-medium" : ""
                                }`}
                              >
                                All recipients
                                <span className="text-xs text-gray-400 ml-2">({totalCount})</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  applyLabelFilter("none")
                                  setShowLabelFilter(false)
                                }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                                  selectedLabelFilter === "none" ? "bg-gray-50 font-medium" : ""
                                }`}
                              >
                                No label
                                <span className="text-xs text-gray-400 ml-2">({labelCounts.noLabelCount})</span>
                              </button>
                              <div className="border-t border-gray-100 my-1" />
                              {availableLabels.map(label => (
                                <button
                                  key={label.id}
                                  type="button"
                                  onClick={() => {
                                    applyLabelFilter(label.id)
                                    setShowLabelFilter(false)
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${
                                    selectedLabelFilter === label.id ? "bg-gray-50 font-medium" : ""
                                  }`}
                                >
                                  <div 
                                    className="w-2.5 h-2.5 rounded-full" 
                                    style={{ backgroundColor: label.color || "#6b7280" }}
                                  />
                                  <span className="capitalize">{label.name}</span>
                                  <span className="text-xs text-gray-400 ml-auto">
                                    ({labelCounts.labelCounts.get(label.id) || 0})
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <svg 
                      className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </summary>
                
                {/* Recipient Search */}
                <div className="mt-2 relative">
                  <Input
                    type="text"
                    placeholder="Search contacts to add..."
                    value={recipientSearchQuery}
                    onChange={(e) => handleRecipientSearch(e.target.value)}
                    className="w-full text-sm"
                  />
                  {recipientSearchLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                  )}
                  {recipientSearchResults && recipientSearchResults.entities.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {recipientSearchResults.entities.map(entity => {
                        const alreadyAdded = recipients.some(r => r.id === entity.id)
                        return (
                          <button
                            key={entity.id}
                            type="button"
                            onClick={() => !alreadyAdded && addRecipientFromSearch(entity)}
                            disabled={alreadyAdded}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                              alreadyAdded ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                          >
                            <div>
                              <div className="font-medium text-gray-900">{entity.firstName}</div>
                              <div className="text-xs text-gray-500">{entity.email}</div>
                            </div>
                            {alreadyAdded ? (
                              <span className="text-xs text-gray-400">Added</span>
                            ) : (
                              <span className="text-xs text-orange-600">+ Add</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {recipientSearchResults && recipientSearchResults.entities.length === 0 && recipientSearchQuery.length >= 2 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-500 text-center">
                      No contacts found
                    </div>
                  )}
                </div>
                
                <div className="mt-2 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                  {recipients.length === 0 ? (
                    <p className="p-3 text-sm text-gray-500 text-center">No recipients with email addresses</p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {recipients.map(recipient => (
                        <label
                          key={recipient.id}
                          className={`flex items-center gap-3 p-2 cursor-pointer hover:bg-gray-50 ${
                            !recipient.included ? "opacity-50" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={recipient.included}
                            onChange={() => toggleRecipient(recipient.id)}
                            className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {recipient.firstName} {recipient.lastName || ""}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {recipient.email}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Show labels */}
                            {recipient.labels && recipient.labels.length > 0 && (
                              <div className="flex gap-1">
                                {recipient.labels.slice(0, 2).map(label => (
                                  <span
                                    key={label.labelId}
                                    className="text-xs px-1.5 py-0.5 rounded capitalize"
                                    style={{
                                      backgroundColor: `${label.labelColor || "#6b7280"}20`,
                                      color: label.labelColor || "#6b7280",
                                    }}
                                  >
                                    {label.labelName}
                                  </span>
                                ))}
                                {recipient.labels.length > 2 && (
                                  <span className="text-xs text-gray-400">
                                    +{recipient.labels.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                            {recipient.contactType && (
                              <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">
                                {recipient.contactType}
                              </span>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </div>

            {/* Subject */}
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
                className="mt-1"
              />
            </div>

            {/* Body with Preview Toggle */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="body">Message</Label>
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors ${
                    showPreview 
                      ? "bg-orange-100 text-orange-700" 
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  {showPreview ? "Hide Preview" : "Preview"}
                </button>
              </div>
              
              {!showPreview ? (
                <>
                  <Textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Email body..."
                    rows={14}
                    className="mt-1 resize-none"
                    style={{ fontFamily: "Arial, sans-serif", fontSize: "14px" }}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use {"{{First Name}}"} to personalize for each recipient
                  </p>
                </>
              ) : (
                <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden">
                  {/* Preview Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        Preview for: {currentPreviewRecipient?.firstName} {currentPreviewRecipient?.lastName || ""}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({currentPreviewRecipient?.email})
                      </span>
                    </div>
                    {includedRecipients.length > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={prevPreview}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          <ChevronLeft className="w-4 h-4 text-gray-600" />
                        </button>
                        <span className="text-xs text-gray-500 min-w-[60px] text-center">
                          {previewIndex + 1} of {includedRecipients.length}
                        </span>
                        <button
                          type="button"
                          onClick={nextPreview}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          <ChevronRight className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Preview Content */}
                  <div className="p-4 bg-white min-h-[200px]" style={{ fontFamily: "Arial, sans-serif" }}>
                    <div className="text-sm text-gray-500 mb-2">
                      <strong>Subject:</strong> {subject}
                    </div>
                    <div 
                      className="text-sm text-gray-900 whitespace-pre-wrap"
                      style={{ fontFamily: "Arial, sans-serif", fontSize: "14px", lineHeight: "1.6" }}
                    >
                      {getPersonalizedBody(currentPreviewRecipient)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Attachments */}
            <div className="border-t border-gray-200 pt-4">
              <Label className="flex items-center gap-2 mb-2">
                <Paperclip className="w-4 h-4 text-gray-500" />
                Attachments
              </Label>
              
              {/* File list */}
              {attachments.length > 0 && (
                <div className="space-y-2 mb-3">
                  {attachments.map(attachment => (
                    <div 
                      key={attachment.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-700 truncate">{attachment.filename}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">({formatFileSize(attachment.size)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="text-xs text-gray-400">
                    Total: {formatFileSize(attachments.reduce((sum, a) => sum + a.size, 0))} / {Math.round(MAX_ATTACHMENT_SIZE / 1024 / 1024)}MB
                  </div>
                </div>
              )}
              
              {/* Upload button */}
              <label className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                Add files
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>

            {/* Refinement */}
            <div className="border-t border-gray-200 pt-4">
              <Label htmlFor="refine" className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-500" />
                Refine with AI (optional)
              </Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="refine"
                  value={refinementInstruction}
                  onChange={(e) => setRefinementInstruction(e.target.value)}
                  placeholder="e.g., also ask for their W-9"
                  disabled={state === "refining"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && refinementInstruction.trim()) {
                      e.preventDefault()
                      handleRefine()
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={handleRefine}
                  disabled={!refinementInstruction.trim() || state === "refining"}
                >
                  {state === "refining" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Refine"
                  )}
                </Button>
              </div>
            </div>

            {/* Schedule Section */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-gray-500" />
                <Label>When to send</Label>
              </div>
              
              <div className="space-y-2">
                {/* Send Now Option */}
                <label 
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    sendTiming === "immediate" 
                      ? "border-orange-500 bg-orange-50" 
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="sendTiming"
                    value="immediate"
                    checked={sendTiming === "immediate"}
                    onChange={() => setSendTiming("immediate")}
                    className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-gray-600" />
                      <span className="font-medium text-gray-900">Send now</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Emails go out immediately</p>
                  </div>
                </label>

                {/* Schedule Option */}
                <label 
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    sendTiming === "scheduled" 
                      ? "border-orange-500 bg-orange-50" 
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="sendTiming"
                    value="scheduled"
                    checked={sendTiming === "scheduled"}
                    onChange={() => setSendTiming("scheduled")}
                    className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-gray-600" />
                      <span className="font-medium text-gray-900">Schedule for later</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Send at a specific time relative to the period
                    </p>
                  </div>
                </label>
              </div>

              {/* Schedule Options - shown when scheduled is selected */}
              {sendTiming === "scheduled" && (
                <div className="mt-3 ml-6 space-y-3">
                  {/* Days before period end selector */}
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      When should this be sent?
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={scheduleOffsetDays}
                        onChange={(e) => setScheduleOffsetDays(Number(e.target.value))}
                        className="block w-24 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={5}>5</option>
                        <option value={7}>7</option>
                        <option value={10}>10</option>
                        <option value={14}>14</option>
                        <option value={21}>21</option>
                        <option value={30}>30</option>
                      </select>
                      <span className="text-sm text-gray-700">business days before period end</span>
                    </div>
                    {job.board?.periodEnd && (
                      <p className="text-xs text-gray-500 mt-2">
                        Current period ends: {(() => {
                          const datePart = job.board.periodEnd.split("T")[0]
                          const [year, month, day] = datePart.split("-").map(Number)
                          return new Date(year, month - 1, day).toLocaleDateString()
                        })()}
                      </p>
                    )}
                  </div>
                  
                  {/* Info box */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <CalendarClock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-blue-900">How scheduling works</p>
                        <p className="text-xs text-blue-700 mt-1">
                          This request will be saved as a draft with the scheduled date. 
                          {isRecurringBoard && " The timing will automatically carry over to future periods."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Reminders Section */}
            <div className={`border-t border-gray-200 pt-4 ${sendTiming === "scheduled" ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <div>
                    <Label htmlFor="reminders" className={sendTiming === "scheduled" ? "cursor-not-allowed" : "cursor-pointer"}>
                      Send reminders
                    </Label>
                    <p className="text-xs text-gray-500">
                      {sendTiming === "scheduled" 
                        ? "Coming soon for scheduled requests"
                        : "Automatic follow-ups until reply or deadline"
                      }
                    </p>
                  </div>
                </div>
                <button
                  id="reminders"
                  type="button"
                  role="switch"
                  aria-checked={remindersEnabled && sendTiming !== "scheduled"}
                  onClick={() => sendTiming !== "scheduled" && setRemindersEnabled(!remindersEnabled)}
                  disabled={sendTiming === "scheduled"}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${sendTiming === "scheduled" 
                      ? "bg-gray-200 cursor-not-allowed" 
                      : remindersEnabled 
                        ? "bg-orange-500" 
                        : "bg-gray-200"
                    }
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${remindersEnabled && sendTiming !== "scheduled" ? "translate-x-6" : "translate-x-1"}
                    `}
                  />
                </button>
              </div>
              
              {/* Reminder Frequency Options */}
              {remindersEnabled && sendTiming !== "scheduled" && (
                <div className="mt-3 ml-6 p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-600 mb-2 block">Remind every:</Label>
                  <div className="flex items-center gap-2">
                    <select
                      value={reminderDays}
                      onChange={(e) => setReminderDays(Number(e.target.value))}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    >
                      <option value={1}>1 day</option>
                      <option value={2}>2 days</option>
                      <option value={3}>3 days</option>
                      <option value={5}>5 days</option>
                      <option value={7}>7 days (weekly)</option>
                      <option value={14}>14 days (bi-weekly)</option>
                      <option value={30}>30 days (monthly)</option>
                    </select>
                    <span className="text-xs text-gray-500">until they reply or deadline passes</span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-gray-500">
                      <Sparkles className="w-3 h-3 inline mr-1" />
                      Each reminder will be uniquely AI-generated
                    </p>
                    <button
                      type="button"
                      onClick={fetchReminderPreviews}
                      disabled={loadingReminderPreviews || !subject.trim() || !body.trim()}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-orange-600 bg-orange-50 rounded-md hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      {loadingReminderPreviews ? "Loading..." : "Preview Reminders"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={state === "sending"}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendClick}
                disabled={
                  state === "sending" ||
                  state === "refining" ||
                  includedCount === 0 ||
                  !subject.trim() ||
                  !body.trim()
                }
                className="bg-gray-900 hover:bg-gray-800"
              >
                {state === "sending" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {sendTiming === "scheduled" ? "Scheduling..." : "Sending..."}
                  </>
                ) : sendTiming === "scheduled" ? (
                  <>
                    <CalendarClock className="w-4 h-4 mr-2" />
                    Schedule Request
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send to {includedCount} recipient{includedCount !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Sending State */}
        {mode === "standard" && state === "sending" && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
            </div>
            <h3 className="mt-4 font-medium text-gray-900">
              {sendTiming === "scheduled" ? "Scheduling request..." : "Sending request..."}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {sendTiming === "scheduled" 
                ? `Scheduling to send ${scheduleOffsetDays} days before period end`
                : `Sending to ${includedCount} recipient${includedCount !== 1 ? "s" : ""}`
              }
            </p>
          </div>
        )}
        </div>
      </DialogContent>

      {/* Send Confirmation Dialog */}
      <Dialog open={showSendConfirmation} onOpenChange={setShowSendConfirmation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {sendTiming === "scheduled" ? (
                <CalendarClock className="w-5 h-5 text-blue-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-500" />
              )}
              {sendTiming === "scheduled" ? "Confirm Schedule" : "Confirm Send"}
            </DialogTitle>
            <DialogDescription>
              {sendTiming === "scheduled"
                ? `This request will be scheduled to send ${scheduleOffsetDays} business days before period end.`
                : "You are about to send emails to real recipients. This action cannot be undone."
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-3">
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Recipients:</span>
                <span className="font-medium">{includedCount} contact{includedCount !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subject:</span>
                <span className="font-medium truncate max-w-[200px]">{subject}</span>
              </div>
              {sendTiming === "scheduled" && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Schedule:</span>
                  <span className="font-medium">{scheduleOffsetDays} days before period end</span>
                </div>
              )}
              {remindersEnabled && sendTiming !== "scheduled" && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Reminders:</span>
                  <span className="font-medium">Every {reminderDays} day{reminderDays !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
            
            <p className="text-sm text-gray-600">
              {sendTiming === "scheduled"
                ? "Are you sure you want to schedule this request?"
                : "Are you sure you want to send this request?"
              }
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSendConfirmation(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendConfirmed}
              className="bg-gray-900 hover:bg-gray-800"
            >
              {sendTiming === "scheduled" ? (
                <>
                  <CalendarClock className="w-4 h-4 mr-2" />
                  Yes, Schedule
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Yes, Send Now
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reminder Preview Dialog */}
      <Dialog open={showReminderPreview} onOpenChange={setShowReminderPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-orange-500" />
              Reminder Email Previews
            </DialogTitle>
            <DialogDescription>
              Preview what your reminder emails will look like. Each reminder is uniquely AI-generated.
            </DialogDescription>
          </DialogHeader>
          
          {loadingReminderPreviews ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              <p className="mt-3 text-sm text-gray-500">Generating reminder previews...</p>
            </div>
          ) : reminderPreviews.length > 0 ? (
            <div className="space-y-4">
              {/* Reminder Tabs */}
              <div className="flex gap-2 border-b border-gray-200 pb-2">
                {reminderPreviews.map((preview, idx) => (
                  <button
                    key={idx}
                    onClick={() => setReminderPreviewIndex(idx)}
                    className={`
                      px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors
                      ${reminderPreviewIndex === idx 
                        ? "bg-orange-100 text-orange-700 border-b-2 border-orange-500" 
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      }
                    `}
                  >
                    Reminder #{preview.reminderNumber}
                  </button>
                ))}
              </div>

              {/* Selected Reminder Preview */}
              {reminderPreviews[reminderPreviewIndex] && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Tone:</span>
                    <span className={`
                      px-2 py-0.5 rounded-full text-xs font-medium
                      ${reminderPreviewIndex === 0 ? "bg-green-100 text-green-700" : 
                        reminderPreviewIndex === 1 ? "bg-blue-100 text-blue-700" : 
                        "bg-amber-100 text-amber-700"}
                    `}>
                      {reminderPreviews[reminderPreviewIndex].tone}
                    </span>
                    <span className="text-gray-400 text-xs ml-2">
                      (Sent after {(reminderPreviewIndex + 1) * reminderDays} days if no reply)
                    </span>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Subject</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {reminderPreviews[reminderPreviewIndex].subject}
                      </p>
                    </div>
                    <div className="p-4 bg-white">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Message</p>
                      <div 
                        className="text-sm text-gray-700 whitespace-pre-wrap"
                        style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6" }}
                      >
                        {reminderPreviews[reminderPreviewIndex].body}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                    Note: Actual reminder content may vary slightly as each is generated fresh when sent.
                    Reminders stop automatically when the recipient replies.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No reminder previews available
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <Button
              variant="outline"
              onClick={() => setShowReminderPreview(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
