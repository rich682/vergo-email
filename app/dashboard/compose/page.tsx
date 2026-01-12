"use client"

import { useState, useEffect, Suspense, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RecipientSelector, SelectedRecipient } from "@/components/compose/recipient-selector"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getRequestGrouping } from "@/lib/requestGrouping"
import { PreviewPanel } from "@/components/compose/preview-panel"

type RemindersConfigState = {
  enabled: boolean
  startDelayDays: number
  cadenceDays: number
  maxCount: number
}

function ComposePageContent() {
  const searchParams = useSearchParams()
  const isRequestMode = searchParams.get('mode') === 'request'
  const [requestName, setRequestName] = useState("")
  const [requestNameError, setRequestNameError] = useState<string | null>(null)
  const [recipientsError, setRecipientsError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState("")
  const [selectedRecipients, setSelectedRecipients] = useState<SelectedRecipient[]>([])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<any>(null)
  const [warning, setWarning] = useState<{ externalCount: number; internalCount: number } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduleDateTime, setScheduleDateTime] = useState("")
  const [selectedGroupId, setSelectedGroupId] = useState<string>("")
  const [scheduleName, setScheduleName] = useState("")
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: string; name: string }>>([])
  const [scheduling, setScheduling] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [emailAccounts, setEmailAccounts] = useState<Array<{ id: string; email: string; provider: string }>>([])
  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState<string | undefined>(undefined)
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [aiEnriching, setAiEnriching] = useState(false)
  
  // Preview panel state
  const [previewSubject, setPreviewSubject] = useState("")
  const [previewBody, setPreviewBody] = useState("")
  const [aiSubject, setAiSubject] = useState<string | undefined>(undefined)
  const [aiBody, setAiBody] = useState<string | undefined>(undefined)
  const [subjectUserEdited, setSubjectUserEdited] = useState(false)
  const [bodyUserEdited, setBodyUserEdited] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // Recipient source state (default contact; CSV available via deep link)
  const [recipientSource, setRecipientSource] = useState<"contact" | "csv">("contact")
  
  // CSV mode state
  const [csvData, setCsvData] = useState<{
    recipients: { emails: string[]; count: number }
    tags: string[]
    emailColumnName: string
    missingCountsByTag: Record<string, number>
    blockingErrors: string[]
    rows: Array<Record<string, string>>
    emailColumn: string
    tagColumns: string[]
    normalizedTagMap: Record<string, string>
  } | null>(null)
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvUploadError, setCsvUploadError] = useState<string | null>(null)
  const [availableTags, setAvailableTags] = useState<string[]>([]) // Derived from CSV or contact fields
  const [availableStateKeys, setAvailableStateKeys] = useState<Array<{ stateKey: string; count: number }>>([])
  const [selectedDataFields, setSelectedDataFields] = useState<string[]>([]) // Multiple data personalization fields
  const [requireSliceData, setRequireSliceData] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<SelectedRecipient[]>([]) // Groups filter (optional)
  const [filterExpanded, setFilterExpanded] = useState(false)
  const [filterStats, setFilterStats] = useState<{ total: number; included: number; excluded: number } | null>(null)
  
  // Deadline state
  const [deadlineDate, setDeadlineDate] = useState<string>("") // Deadline date (ISO string format)
  
  // Reminder state
  const [remindersConfig, setRemindersConfig] = useState<RemindersConfigState>({
    enabled: false,
    startDelayDays: 2,
    cadenceDays: 3,
    maxCount: 2
  })

  const updateRemindersConfig = (updates: Partial<RemindersConfigState>) =>
    setRemindersConfig((prev) => ({ ...prev, ...updates }))
  
  // Personalization mode: "none" | "contact" | "csv"
  const personalizationMode = recipientSource === "csv" && csvData ? "csv" : (recipientSource === "contact" ? "contact" : "none")
  const [blockOnMissingValues, setBlockOnMissingValues] = useState(true)

  // Honor deep-link CSV mode via ?source=csv, default to contact mode otherwise
  useEffect(() => {
    const sourceParam = searchParams.get("source")
    if (sourceParam === "csv" && recipientSource !== "csv") {
      setRecipientSource("csv")
      setSelectedRecipients([])
      setRecipientsError(null)
    } else if (sourceParam !== "csv" && recipientSource !== "contact") {
      setRecipientSource("contact")
      setCsvData(null)
      setAvailableTags([])
      setCsvUploadError(null)
    }
  }, [searchParams, recipientSource])

  // Load available state keys for filtering
  useEffect(() => {
    if (!isRequestMode) return
    const loadStateKeys = async () => {
      try {
        const res = await fetch("/api/contacts/state-keys")
        if (res.ok) {
          const data = await res.json()
          setAvailableStateKeys(data || [])
        }
      } catch (err) {
        console.error("Error loading state keys", err)
      }
    }
    loadStateKeys()
  }, [isRequestMode])

  useEffect(() => {
    setFilterStats(null)
  }, [selectedDataFields])

  // Update availableTags when selectedDataFields changes (for contact mode)
  useEffect(() => {
    if (recipientSource === "contact") {
      // Base tags always available
      const baseTags = ["First Name", "Email"]
      // Add selected data personalization fields
      const allTags = [...baseTags, ...selectedDataFields]
      setAvailableTags(allTags)
    }
  }, [selectedDataFields, recipientSource])

  // Handle CSV file upload
  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setCsvUploadError("Please select a CSV file")
      return
    }

    setCsvUploading(true)
    setCsvUploadError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/email-drafts/csv-upload", {
        method: "POST",
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to upload CSV" }))
        throw new Error(errorData.error || "Failed to upload CSV")
      }

      const result = await response.json()
      if (result.success && result.data) {
        // CSV columns automatically become tags (all non-email columns)
        const tags = result.data.tags || result.data.tagColumns || []
        setAvailableTags(tags)
        setCsvData({
          recipients: result.data.recipients || { emails: [], count: 0 },
          tags,
          emailColumnName: result.data.emailColumnName || result.data.emailColumn,
          missingCountsByTag: result.data.missingCountsByTag || result.data.validation?.missingValues || {},
          blockingErrors: result.data.blockingErrors || [],
          rows: result.data.rows,
          emailColumn: result.data.emailColumn,
          tagColumns: result.data.tagColumns,
          normalizedTagMap: result.data.normalizedTagMap || {}
        })
      } else {
        throw new Error("Invalid response from server")
      }
    } catch (error: any) {
      setCsvUploadError(error.message || "Failed to upload CSV")
      setCsvData(null)
      setAvailableTags([])
    } finally {
      setCsvUploading(false)
      // Reset file input
      if (event.target) {
        event.target.value = ""
      }
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return

    // Validate request name in request mode
    if (isRequestMode) {
      const trimmedName = requestName.trim()
      if (!trimmedName) {
        setRequestNameError("Request name is required")
        return
      }
      setRequestNameError(null)
    }

    // Validate recipients based on recipient source
    if (isRequestMode) {
      if (recipientSource === "contact") {
        // Check if any stakeholder (contact or type) is selected
        const hasStakeholders = selectedRecipients.some(r => r.type === "entity" || r.type === "contactType")
        if (!hasStakeholders) {
          setRecipientsError("At least one contact or type must be selected as stakeholder")
          return
        }
        setRecipientsError(null)
      } else if (recipientSource === "csv") {
        if (!csvData) {
          setError("Please upload a CSV file")
          setLoading(false)
          return
        }
        if (csvData.blockingErrors && csvData.blockingErrors.length > 0) {
          setError(`CSV has errors: ${csvData.blockingErrors.join(", ")}`)
          setLoading(false)
          return
        }
        if (csvData.recipients.count === 0) {
          setError("CSV must contain at least one recipient")
          setLoading(false)
          return
        }
      }
    }

    // Generate new idempotency key
    const newIdempotencyKey = crypto.randomUUID()
    setIdempotencyKey(newIdempotencyKey)

    // Create new AbortController for this request (for fetch abort)
    const abortController = new AbortController()

    setLoading(true)
    setAiEnriching(false)
    setError(null)
    
    try {
      // Build state filter payload - supports multiple data fields
      const stateFilterPayload = selectedDataFields.length > 0
        ? { stateKeys: selectedDataFields, mode: requireSliceData ? "has" : undefined }
        : undefined

      // Build recipients data based on source
      let finalRecipientsData = undefined
      if (recipientSource === "contact") {
        // Stakeholders: individual contacts and contact types
        const entityIds = selectedRecipients.filter(r => r.type === "entity").map(r => r.id)
        const contactTypes = selectedRecipients.filter(r => r.type === "contactType").map(r => r.id)
        // Groups: optional filter from separate selector
        const groupIds = selectedGroups.filter(r => r.type === "group").map(r => r.id)
        
        finalRecipientsData = (selectedRecipients.length > 0 || selectedGroups.length > 0) ? {
          entityIds,
          groupIds,
          contactTypes,
          stateFilter: stateFilterPayload
        } : undefined
        
        if (isRequestMode && (!finalRecipientsData || (entityIds.length === 0 && contactTypes.length === 0))) {
          setRecipientsError("At least one contact or type must be selected")
          setLoading(false)
          return
        }
      } else if (recipientSource === "csv" && csvData) {
        // For CSV mode, recipients come from CSV - create a placeholder structure
        // The actual recipients will be determined when sending from CSV data
        finalRecipientsData = {
          entityIds: [],
          groupIds: []
        }
      }

      // Build personalization payload based on recipient source
      const personalizationPayload = personalizationMode !== "none" ? {
        personalizationMode,
        availableTags: personalizationMode === "csv" && csvData ? csvData.tags : (personalizationMode === "contact" ? ["First Name", "Email"] : []),
        blockOnMissingValues
      } : {}

      const response = await fetch("/api/email-drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt,
          selectedRecipients: finalRecipientsData,
          stateFilter: stateFilterPayload,
          idempotencyKey: newIdempotencyKey,
          requestName: isRequestMode ? requestName.trim() : undefined,
          deadlineDate: isRequestMode && deadlineDate ? deadlineDate : undefined,
          ...personalizationPayload
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to generate draft" }))
        throw new Error(errorData.error || "Failed to generate draft")
      }

      const data = await response.json()
      
      // Synchronous generation always returns completed immediately
      if (data.status === "completed" && data.draft) {
        // If CSV mode, persist personalization data immediately after draft creation
        if (personalizationMode === "csv" && csvData && data.id) {
          try {
            const personalizationResponse = await fetch(`/api/email-drafts/${data.id}/personalization-data`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                csvRows: csvData.rows,
                emailColumn: csvData.emailColumn,
                tagColumns: csvData.tagColumns // Use all CSV columns except email as tags
              })
            })

            if (!personalizationResponse.ok) {
              const errorData = await personalizationResponse.json().catch(() => ({ error: "Failed to store personalization data" }))
              console.error("Failed to store personalization data:", errorData.error)
            }
          } catch (error) {
            console.error("Error storing personalization data:", error)
          }
        }

        // Use tags from response (derived from slice data) or fallback to defaults
        const responseTags = data.draft.availableTags || (personalizationMode === "csv" && csvData ? csvData.tags : (personalizationMode === "contact" ? ["First Name", "Email"] : []))
        
        const draftData = {
          id: data.id,
          ...data.draft,
          campaignName: isRequestMode ? requestName.trim() : (data.draft.suggestedCampaignName || undefined),
          aiGenerationStatus: "complete",
          personalizationMode,
          availableTags: responseTags
        }
        setDraft(draftData)
        setFilterStats(data.recipientStats || null)
        
        // Update available tags state with derived tags from slice
        if (responseTags && responseTags.length > 0) {
          setAvailableTags(responseTags)
        }
        
        // Use templates if available, otherwise fall back to generated subject/body
        const subjectToUse = data.draft.subjectTemplate || data.draft.generatedSubject || ""
        const bodyToUse = data.draft.bodyTemplate || data.draft.generatedBody || ""
        
        // Initialize preview with generated content
        if (subjectToUse) {
          setPreviewSubject(subjectToUse)
          setAiSubject(subjectToUse)
        }
        if (bodyToUse) {
          setPreviewBody(bodyToUse)
          setAiBody(bodyToUse)
        }
        setLoading(false)
        setAiEnriching(false)
        return
      }

      // Synchronous generation should always return completed or failed
      // If we get here with status "processing", something is wrong - treat as failed
      if (data.status === "failed" || (data.status === "processing" && data.id)) {
        // Use template fallback if draft exists
        const fallbackSubject = data.draft?.generatedSubject || `Request: ${prompt.substring(0, 50)}`
        const fallbackBody = data.draft?.generatedBody || prompt
        setDraft({
          id: data.id,
          generatedSubject: fallbackSubject,
          generatedBody: fallbackBody,
          campaignName: isRequestMode ? requestName.trim() : undefined,
          aiGenerationStatus: "complete" // Even fallback is "complete" so UI works
        })
        setPreviewSubject(fallbackSubject)
        setPreviewBody(fallbackBody)
        if (fallbackSubject.includes("Request:")) {
          setError("Using default draft (AI unavailable). You can edit and send.")
        }
        setLoading(false)
        setAiEnriching(false)
        return
      }
      
      // Should never reach here - synchronous generation always completes immediately
      setError("Unexpected response. Please try again.")
      setLoading(false)
      setAiEnriching(false)
      return
    } catch (error: any) {
      if (abortController.signal.aborted) {
        // Request was aborted, don't show error
        return
      }
      
      console.error("Error generating draft:", error)
      setError(error.message || "Failed to generate draft")
      setLoading(false)
      setAiEnriching(false)
    } finally {
      // Ensure loading states are cleared
      if (!abortController.signal.aborted) {
        // States will be set in try/catch, but ensure cleanup
      }
    }
  }


  const checkWarning = async () => {
    if (!draft?.suggestedRecipients) return null

    // Note: Campaign warnings API was removed. This functionality can be re-implemented
    // if needed by checking entity domains directly
    return null
  }

  const handlePreviewSubmit = async () => {
    if (!draft || submitting) return

    // Validate Request Name in request mode
    if (isRequestMode) {
      const finalRequestName = requestName.trim() || (draft.campaignName || "").trim()
      if (!finalRequestName) {
        setRequestNameError("Request name is required")
        return
      }
      setRequestNameError(null)
    }

    setSubmitting(true)
    setSendError(null)

    try {
      // Update draft with preview edits (use templates if variables are defined)
      const updateData: any = {
        generatedSubject: previewSubject,
        generatedBody: previewBody
      }
      
      if (personalizationMode !== "none") {
        updateData.subjectTemplate = previewSubject
        updateData.bodyTemplate = previewBody
        updateData.htmlBodyTemplate = previewBody // Use body as HTML template for now
      }

      const updateResponse = await fetch(`/api/email-drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData)
      })

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({ error: "Failed to update draft" }))
        throw new Error(errorData.error || "Failed to update draft")
      }

      // Submit the request
      const response = await fetch(`/api/email-drafts/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: draft.suggestedRecipients,
          campaignName: isRequestMode ? (requestName.trim() || draft.campaignName || undefined) : (draft.campaignName || undefined),
          emailAccountId: selectedEmailAccountId,
          remindersConfig: remindersConfig.enabled ? {
            enabled: true,
            startDelayHours: remindersConfig.startDelayDays * 24,
            frequencyHours: remindersConfig.cadenceDays * 24,
            maxCount: remindersConfig.maxCount
          } : undefined
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to send email" }))
        throw new Error(errorData.error || `Failed to send email: ${response.statusText}`)
      }

      const result = await response.json()
      
      // In request mode, redirect to request detail page
      if (isRequestMode) {
        const finalRequestName = requestName.trim() || (draft.campaignName || "").trim()
        if (finalRequestName) {
          const grouping = getRequestGrouping({
            campaignName: finalRequestName,
            campaignType: null,
            id: '',
            latestOutboundSubject: previewSubject || null
          })
          const encodedKey = encodeURIComponent(grouping.groupKey)
          
          // Get recipient count from draft
          const entityCount = draft.suggestedRecipients?.entityIds?.length || 0
          const groupCount = draft.suggestedRecipients?.groupIds?.length || 0
          const estimatedRecipientCount = entityCount + (groupCount > 0 ? 1 : 0)
          
          const toastMessage = `Request created\n"${finalRequestName}" • 0/${estimatedRecipientCount || entityCount} complete`
          alert(toastMessage)
          
          window.location.href = `/dashboard/requests/${encodedKey}`
        } else {
          window.location.href = "/dashboard/requests"
        }
      } else {
        window.location.href = "/dashboard/inbox"
      }
    } catch (error: any) {
      console.error("Error submitting request:", error)
      // Only set error if not already handled (e.g., missing tags error)
      if (!sendError) {
        setSendError(error.message || "Failed to submit request. Please try again.")
      }
      setSubmitting(false)
    }
  }

  const handleSend = async () => {
    if (!draft || sending) return

    // Validate Request Name in request mode
    if (isRequestMode) {
      const finalRequestName = requestName.trim() || (draft.campaignName || "").trim()
      if (!finalRequestName) {
        setRequestNameError("Request name is required")
        return
      }
      setRequestNameError(null)
    }

    // Check for external recipients if not already confirmed
    if (!confirmed) {
      const warningData = await checkWarning()
      if (warningData) {
        setWarning(warningData)
        return
      }
    }

    setSending(true)
    setSendError(null)

    try {
      const response = await fetch(`/api/email-drafts/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: draft.suggestedRecipients,
          campaignName: isRequestMode ? (requestName.trim() || draft.campaignName || undefined) : (draft.campaignName || undefined),
          emailAccountId: selectedEmailAccountId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to send email" }))
        throw new Error(errorData.error || `Failed to send email: ${response.statusText}`)
      }

      const result = await response.json()
      
      // In request mode, redirect to request detail page
      if (isRequestMode) {
        const finalRequestName = requestName.trim() || (draft.campaignName || "").trim()
        if (finalRequestName) {
          const grouping = getRequestGrouping({
            campaignName: finalRequestName,
            campaignType: null,
            id: '',
            latestOutboundSubject: draft.generatedSubject || null
          })
          const encodedKey = encodeURIComponent(grouping.groupKey)
          
          // Get recipient count from draft
          const entityCount = draft.suggestedRecipients?.entityIds?.length || 0
          const groupCount = draft.suggestedRecipients?.groupIds?.length || 0
          // Note: We can't get exact count without fetching groups, so use entity count as estimate
          const estimatedRecipientCount = entityCount + (groupCount > 0 ? 1 : 0) // Rough estimate
          
          // Show toast notification (simple alert for now, can be enhanced)
          const toastMessage = `Request created\n"${finalRequestName}" • 0/${estimatedRecipientCount || entityCount} complete`
          alert(toastMessage)
          
          // Redirect to request detail page
          window.location.href = `/dashboard/requests/${encodedKey}`
        } else {
          // Fallback: redirect to requests list if no request name
          window.location.href = "/dashboard/requests"
        }
      } else {
        // Non-request mode: redirect to inbox
        window.location.href = "/dashboard/inbox"
      }
    } catch (error: any) {
      console.error("Error sending email:", error)
      setSendError(error.message || "Failed to send email. Please try again.")
      setSending(false)
    }
  }

  const handleProceed = () => {
    setConfirmed(true)
    setWarning(null)
    handleSend()
  }

  const handleCancel = () => {
    setWarning(null)
    setConfirmed(false)
  }

  // Fetch groups when draft is available
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        setAccountsLoading(true)
        const res = await fetch("/api/email-accounts")
        if (res.ok) {
          const data = await res.json()
          setEmailAccounts(data)
          if (data.length > 0) {
            setSelectedEmailAccountId(data[0].id)
          }
        }
      } catch (e) {
        console.error("Error loading email accounts", e)
      } finally {
        setAccountsLoading(false)
      }
    }
    loadAccounts()
  }, [])

  useEffect(() => {
    if (draft?.suggestedRecipients) {
      const fetchGroups = async () => {
        try {
          const response = await fetch("/api/groups")
          if (response.ok) {
            const groups = await response.json()
            // Filter to only groups that are in the draft recipients
            const recipientGroupIds = draft.suggestedRecipients.groupIds || []
            const filteredGroups = groups.filter((g: any) => recipientGroupIds.includes(g.id))
            setAvailableGroups(filteredGroups)
            
            // Auto-select if only one group
            if (filteredGroups.length === 1) {
              setSelectedGroupId(filteredGroups[0].id)
            }
          }
        } catch (error) {
          console.error("Error fetching groups:", error)
        }
      }
      fetchGroups()
    }
  }, [draft])

  const handleScheduleClick = () => {
    if (!draft) return
    
    // Set default schedule name
    const defaultName = draft.campaignName || draft.generatedSubject || "Scheduled Email"
    setScheduleName(defaultName)
    
    // Set default date/time to 1 hour from now
    const defaultDate = new Date()
    defaultDate.setHours(defaultDate.getHours() + 1)
    defaultDate.setMinutes(0)
    setScheduleDateTime(defaultDate.toISOString().slice(0, 16))
    
    setScheduleError(null)
    setScheduleDialogOpen(true)
  }

  const handleSchedule = async () => {
    if (!draft || !scheduleDateTime || !selectedGroupId || !scheduleName.trim()) {
      setScheduleError("Please fill in all required fields")
      return
    }

    const scheduleDate = new Date(scheduleDateTime)
    if (scheduleDate <= new Date()) {
      setScheduleError("Schedule date/time must be in the future")
      return
    }

    setScheduling(true)
    setScheduleError(null)

    try {
      const response = await fetch(`/api/email-drafts/${draft.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleDateTime: scheduleDate.toISOString(),
          groupId: selectedGroupId,
          scheduleName: scheduleName.trim()
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to schedule email" }))
        throw new Error(errorData.error || `Failed to schedule email: ${response.statusText}`)
      }

      // Success - close dialog and redirect
      setScheduleDialogOpen(false)
      if (isRequestMode) {
        window.location.href = "/dashboard/requests"
      } else {
        window.location.href = "/dashboard/inbox"
      }
    } catch (error: any) {
      console.error("Error scheduling email:", error)
      setScheduleError(error.message || "Failed to schedule email. Please try again.")
      setScheduling(false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col border-l border-r border-gray-200">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-2xl font-bold">{isRequestMode ? "Create Request" : "Compose Email"}</h2>
          <p className="text-sm text-gray-600">
            {isRequestMode ? "Send a request and track completion" : "Describe what you want to send in natural language"}
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-gray-50 border-t border-gray-200">
        <div className={`p-6 ${draft?.id && isRequestMode ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'space-y-6'}`}>
          <div className={draft?.id && isRequestMode ? 'space-y-6' : ''}>

      <Card>
        <CardHeader>
          <CardTitle>{isRequestMode ? "What are you collecting?" : "Natural Language Input"}</CardTitle>
          <CardDescription>
            {isRequestMode 
              ? "Describe what you need from recipients (e.g., W-9 forms, expense reports, timesheets)"
              : "Example: \"send email to my employees asking for expense reports\""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isRequestMode && (
            <div>
              <Label>
                Request name <span className="text-red-500 ml-1">*</span>
              </Label>
              <Input
                placeholder="e.g., W-9 Collection Q4 2024"
                value={requestName}
                onChange={(e) => {
                  setRequestName(e.target.value)
                  if (requestNameError) setRequestNameError(null)
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                This is how you'll recognize and track this request.
              </p>
              {requestNameError && (
                <p className="text-xs text-red-600 mt-1">{requestNameError}</p>
              )}
            </div>
          )}
          
          {/* Prompt input */}
          <div>
            <Label>{isRequestMode ? "What are you requesting?" : "Message"}</Label>
            <Textarea
              placeholder={isRequestMode ? "Please submit your W-9 form for tax year 2023..." : "Describe the email you want to send..."}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
            {isRequestMode && (
              <p className="text-xs text-gray-500 mt-1">
                Be specific about what you need and when it's due. {availableTags.length > 0 && `Available tags: ${availableTags.map(t => `{{${t}}}`).join(", ")}`}
              </p>
            )}
          </div>

          {/* Stakeholders Selector - contacts and/or types (mandatory) */}
          {isRequestMode && recipientSource === "contact" && (
            <div>
              <Label>
                Stakeholders <span className="text-red-500 ml-1">*</span>
              </Label>
              <RecipientSelector
                selectedRecipients={selectedRecipients}
                onRecipientsChange={(recipients) => {
                  setSelectedRecipients(recipients)
                  if (recipientsError) setRecipientsError(null)
                  setFilterStats(null)
                }}
                requireContacts={true}
                mode="stakeholders"
                placeholder="Search contacts or types..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Select individual contacts or contact types (e.g., Clients, Vendors).
              </p>
              {recipientsError && (
                <p className="text-xs text-red-600 mt-1">{recipientsError}</p>
              )}
            </div>
          )}

          {/* Groups Selector - optional filter */}
          {isRequestMode && recipientSource === "contact" && (
            <div>
              <Label>
                Groups <span className="text-gray-400 text-xs font-normal ml-1">(optional)</span>
              </Label>
              <RecipientSelector
                selectedRecipients={selectedGroups}
                onRecipientsChange={(groups) => {
                  setSelectedGroups(groups)
                  setFilterStats(null)
                }}
                mode="groups"
                placeholder="Filter by groups..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Optionally narrow recipients by group (e.g., NY Office, Marketing Team).
              </p>
              {(selectedDataFields.length > 0 || selectedGroups.length > 0) && filterStats && (
                <p className="text-xs text-gray-600 mt-2">
                  {filterStats.excluded} recipient{filterStats.excluded === 1 ? "" : "s"} excluded by filter; {filterStats.included} included.
                </p>
              )}
            </div>
          )}

          {/* Data Personalization - only shown in contact mode */}
          {isRequestMode && recipientSource === "contact" && (
            <div>
              <Label>
                Data personalization
              </Label>
              <p className="text-xs text-gray-500 mb-2">
                Add contact data fields to personalize each email.
              </p>
              
              {/* Selected data fields as pills */}
              {selectedDataFields.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedDataFields.map((field) => (
                    <span
                      key={field}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-sm"
                    >
                      {field}
                      <button
                        type="button"
                        onClick={() => setSelectedDataFields(prev => prev.filter(f => f !== field))}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              
              {/* Dropdown to add more fields */}
              <Select
                value=""
                onValueChange={(value) => {
                  if (value && !selectedDataFields.includes(value)) {
                    setSelectedDataFields(prev => [...prev, value])
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={
                    availableStateKeys.length === 0 
                      ? "No data fields available" 
                      : selectedDataFields.length === 0 
                        ? "Select data fields to personalize..." 
                        : "Add another field..."
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availableStateKeys.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No data fields found. Import contacts with custom fields first.
                    </SelectItem>
                  ) : (
                    availableStateKeys
                      .filter(field => !selectedDataFields.includes(field.stateKey))
                      .map((field) => (
                        <SelectItem key={field.stateKey} value={field.stateKey}>
                          {field.stateKey}
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
              
              {/* Filter toggle */}
              {selectedDataFields.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <input
                    id="requireSliceData"
                    type="checkbox"
                    checked={requireSliceData}
                    onChange={(e) => setRequireSliceData(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <Label htmlFor="requireSliceData" className="text-sm font-normal">
                    Only include recipients who have all selected data fields
                  </Label>
                </div>
              )}
            </div>
          )}

          {/* CSV Upload - only shown when CSV mode is selected */}
          {isRequestMode && recipientSource === "csv" && (
            <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-blue-50 border-blue-200">
              <div>
                <Label className="text-base font-semibold">Upload CSV File</Label>
                <p className="text-xs text-gray-600 mt-1">
                  <strong>How it works:</strong> Upload a CSV with an email column and data columns. Recipients are automatically extracted from the email column, and <strong>all non-email columns automatically become tags</strong> you can use in your message (e.g., Invoice Number, Due Date).
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  disabled={csvUploading}
                  className="flex-1"
                />
                {csvUploading && <span className="text-sm text-gray-500">Uploading...</span>}
              </div>

              {csvUploadError && (
                <p className="text-xs text-red-600 mt-1">{csvUploadError}</p>
              )}

              {/* CSV Upload Results */}
              {csvData && (
                <div className="space-y-3 mt-3 p-3 bg-white border border-gray-200 rounded-md">
                  <div className="text-sm">
                    <span className="font-medium">✓ Email column detected:</span> <code className="text-xs bg-gray-100 px-1 rounded">{csvData.emailColumnName}</code>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">✓ Recipients found:</span> <strong className="text-blue-600">{csvData.recipients.count}</strong> contact{csvData.recipients.count !== 1 ? 's' : ''} from CSV
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">✓ Auto-generated tags ({csvData.tags.length}):</span>
                    <p className="text-xs text-gray-500 mt-1 mb-1">
                      These tags are now available for use in your message above. Use them like: 
                      <code className="bg-gray-100 px-1 rounded ml-1">{`{{${csvData.tags[0] || 'Tag Name'}}}`}</code>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {csvData.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium"
                        >
                          {`{{${tag}}}`}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Missing Values Warning */}
                  {Object.keys(csvData.missingCountsByTag).length > 0 && (
                    <div className="text-xs text-yellow-700 mt-2">
                      <div className="font-medium">Missing values per tag:</div>
                      <ul className="list-disc list-inside mt-1">
                        {Object.entries(csvData.missingCountsByTag).map(([tag, count]) => (
                          <li key={tag}>
                            {tag}: {count} missing
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Blocking Errors */}
                  {csvData.blockingErrors && csvData.blockingErrors.length > 0 && (
                    <div className="text-xs text-red-700 mt-2">
                      <div className="font-medium">Errors (must be fixed):</div>
                      <ul className="list-disc list-inside mt-1">
                        {csvData.blockingErrors.map((error, idx) => (
                          <li key={idx}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Block on missing values toggle */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                    <input
                      type="checkbox"
                      id="blockOnMissingValues"
                      checked={blockOnMissingValues}
                      onChange={(e) => setBlockOnMissingValues(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="blockOnMissingValues" className="text-xs font-normal cursor-pointer">
                      Block send if required tags are missing values
                    </Label>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Deadline Section - only in request mode */}
          {isRequestMode && (
            <div>
              <Label>
                Request Deadline
              </Label>
              <Input
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]} // Prevent selecting past dates
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional: Set a request deadline. Used to calculate risk (read but no reply after the deadline = high risk).
              </p>
            </div>
          )}

          {/* Reminders Section - only in request mode */}
          {isRequestMode && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">Reminders</Label>
                  <p className="text-xs text-gray-500 mt-1">
                    Sends follow-ups only to recipients who haven't replied.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remindersConfig.enabled}
                    onChange={(e) => {
                      const enabled = e.target.checked
                      updateRemindersConfig({ enabled })
                    }}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Enable reminders</span>
                </label>
              </div>

              <div className={`grid grid-cols-3 gap-4 transition-opacity ${remindersConfig.enabled ? "opacity-100" : "opacity-50"}`}>
                <div>
                  <Label className="text-sm">Start delay (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={remindersConfig.startDelayDays}
                    onChange={(e) =>
                      updateRemindersConfig({
                        startDelayDays: Math.max(1, parseInt(e.target.value) || 1)
                      })
                    }
                    className="mt-1"
                    disabled={!remindersConfig.enabled}
                  />
                </div>
                <div>
                  <Label className="text-sm">Cadence (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={remindersConfig.cadenceDays}
                    onChange={(e) =>
                      updateRemindersConfig({
                        cadenceDays: Math.max(1, parseInt(e.target.value) || 1)
                      })
                    }
                    className="mt-1"
                    disabled={!remindersConfig.enabled}
                  />
                </div>
                <div>
                  <Label className="text-sm">Max reminders</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={remindersConfig.maxCount}
                    onChange={(e) =>
                      updateRemindersConfig({
                        maxCount: Math.max(1, Math.min(5, parseInt(e.target.value) || 1))
                      })
                    }
                    className="mt-1"
                    disabled={!remindersConfig.enabled}
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}
          {sendError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm font-medium text-red-800 whitespace-pre-line">{sendError}</p>
            </div>
          )}
               <Button
                 onClick={handleGenerate}
                 disabled={
                   loading ||
                   !prompt.trim() ||
                   (isRequestMode && !requestName.trim()) ||
                   (isRequestMode && recipientSource === "contact" && selectedRecipients.length === 0) ||
                   (isRequestMode && recipientSource === "csv" && (!csvData || (csvData.blockingErrors && csvData.blockingErrors.length > 0)))
                 }
               >
            {loading 
              ? (isRequestMode ? "Creating request..." : "Creating draft...")
              : isRequestMode 
                ? "Generate Request" 
                : "Generate Draft"}
          </Button>
        </CardContent>
      </Card>

      {/* Review section removed - preview panel handles all editing */}

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRequestMode ? "Schedule Request" : "Schedule Email"}</DialogTitle>
            <DialogDescription>
              Choose when to send this {isRequestMode ? "request" : "email"}. The {isRequestMode ? "request" : "email"} will be sent to all members of the selected group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="scheduleName">Schedule Name</Label>
              <Input
                id="scheduleName"
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                placeholder="e.g., Monthly Expense Report"
              />
            </div>
            <div>
              <Label htmlFor="scheduleGroup">Group</Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger id="scheduleGroup">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {availableGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableGroups.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  No groups found in recipients. Please select a group when composing.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="scheduleDateTime">Date & Time</Label>
              <Input
                id="scheduleDateTime"
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            {scheduleError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm font-medium text-red-800">{scheduleError}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)} disabled={scheduling}>
              Cancel
            </Button>
            <Button onClick={handleSchedule} disabled={scheduling || !scheduleDateTime || !selectedGroupId || !scheduleName.trim()}>
              {scheduling ? "Scheduling..." : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
          </div>
          {draft?.id && isRequestMode && (
            <div className="h-full flex flex-col">
              <PreviewPanel
                draftId={draft.id}
                recipients={selectedRecipients}
                subject={previewSubject}
                body={previewBody}
                aiSubject={aiSubject}
                aiBody={aiBody}
                aiStatus={draft.aiGenerationStatus as any || null}
                subjectUserEdited={subjectUserEdited}
                bodyUserEdited={bodyUserEdited}
                onSubjectChange={(value) => {
                  setPreviewSubject(value)
                  setSubjectUserEdited(true)
                }}
                onBodyChange={(value) => {
                  setPreviewBody(value)
                  setBodyUserEdited(true)
                }}
                onResetSubject={() => {
                  if (aiSubject) {
                    setPreviewSubject(aiSubject)
                    setSubjectUserEdited(false)
                  }
                }}
                onResetBody={() => {
                  if (aiBody) {
                    setPreviewBody(aiBody)
                    setBodyUserEdited(false)
                  }
                }}
                onSubmit={handlePreviewSubmit}
                submitting={submitting}
                availableTags={availableTags} // Use CSV-derived tags or contact field tags
                personalizationMode={personalizationMode}
                remindersConfig={remindersConfig}
                deadlineDate={deadlineDate ? new Date(deadlineDate) : null}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ComposePage() {
  return (
    <Suspense fallback={
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    }>
      <ComposePageContent />
    </Suspense>
  )
}

