"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { sanitizeHtml } from "@/lib/utils/sanitize-html"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle,
  Plus,
  Eye,
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  Mail,
  Bell,
  Send,
  AlertTriangle,
  Calendar,
  CalendarClock,
} from "lucide-react"
import type { DatasetColumn, DatasetRow, DatasetValidation } from "@/lib/utils/dataset-parser"

// Database mode specific props
interface DatabaseModeProps {
  databaseId: string
  databaseName: string
  emailColumnKey: string
  firstNameColumnKey: string
  boardPeriod?: string
}

interface ComposeSendStepProps {
  jobId: string
  draftId: string
  columns: DatasetColumn[]
  rows: DatasetRow[]
  validation: DatasetValidation
  onColumnsChange: (columns: DatasetColumn[]) => void
  onBack: () => void
  onSuccess: () => void
  // Optional: when provided, uses database send mode instead of CSV dataset mode
  databaseMode?: DatabaseModeProps
}

type StepState = "generating" | "ready" | "refining" | "sending" | "success" | "error"

interface RecipientPreview {
  email: string
  values: Record<string, string>
  renderStatus: string | null
}

export function ComposeSendStep({
  jobId,
  draftId,
  columns,
  rows,
  validation,
  onColumnsChange,
  onBack,
  onSuccess,
  databaseMode,
}: ComposeSendStepProps) {
  // In database mode, start ready since we don't use AI draft generation
  const [state, setState] = useState<StepState>(databaseMode ? "ready" : "generating")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  
  // Column analysis
  const [usedColumns, setUsedColumns] = useState<string[]>([])
  
  // Refinement
  const [refinementInstruction, setRefinementInstruction] = useState("")
  
  // Add column modal
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState("")
  const [newColumnType, setNewColumnType] = useState<DatasetColumn["type"]>("text")
  const [newColumnDefault, setNewColumnDefault] = useState("")
  const [addingColumn, setAddingColumn] = useState(false)
  
  // Refs for cursor position
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [activeField, setActiveField] = useState<"subject" | "body">("body")
  
  // Preview state
  const [previewIndex, setPreviewIndex] = useState(0)
  
  // Reminder settings
  const [remindersEnabled, setRemindersEnabled] = useState(false)
  const [reminderDays, setReminderDays] = useState(7)
  const [reminderMaxCount, setReminderMaxCount] = useState(3)
  
  // Scheduling
  const [sendTiming, setSendTiming] = useState<"immediate" | "scheduled">("immediate")
  const [scheduleOffsetDays, setScheduleOffsetDays] = useState(5)
  
  // Confirmation modal
  const [showConfirmation, setShowConfirmation] = useState(false)
  
  // Send results
  const [sendResults, setSendResults] = useState<{
    sent: number
    failed: number
    skipped: number
    failedRecipients?: Array<{ email: string; error?: string }>
  } | null>(null)
  
  // Filter out name columns and internal/system columns from insertable fields
  const INTERNAL_KEYS = new Set([
    'as_of_date', 'remote_id', 'is_overdue', 'days_overdue', 'currency',
    'paid_on_date', 'paid_amount', 'line_id', 'invoice_remote_id',
    'contact_email', 'email', 'email_address',
  ])
  const insertableColumns = columns.filter(col =>
    !col.key.includes('first_name') &&
    !col.key.includes('firstname') &&
    !col.key.includes('last_name') &&
    !col.key.includes('lastname') &&
    !(col.key === 'name') &&
    !(col.key === 'first') &&
    !(col.key === 'last') &&
    !INTERNAL_KEYS.has(col.key)
  )
  
  // Get valid rows for preview
  const validRows = rows.filter(r => r.valid)
  const currentPreviewRow = validRows[previewIndex]
  
  // Render preview with merge fields replaced
  const getPreviewBody = () => {
    if (!currentPreviewRow) return body
    let rendered = body
    for (const col of columns) {
      const regex = new RegExp(`\\{\\{\\s*${col.key}\\s*\\}\\}`, 'gi')
      const value = currentPreviewRow.values[col.key] || `[MISSING: ${col.label}]`
      rendered = rendered.replace(regex, value)
    }
    return rendered
  }
  
  const getPreviewSubject = () => {
    if (!currentPreviewRow) return subject
    let rendered = subject
    for (const col of columns) {
      const regex = new RegExp(`\\{\\{\\s*${col.key}\\s*\\}\\}`, 'gi')
      const value = currentPreviewRow.values[col.key] || `[MISSING: ${col.label}]`
      rendered = rendered.replace(regex, value)
    }
    return rendered
  }
  
  // Get recipient display name
  const getRecipientName = (row: DatasetRow) => {
    const values = row.values
    return values.first_name || values.firstname || values.name || values.full_name || row.email
  }

  // Generate draft
  const generateDraft = useCallback(async (goal?: string) => {
    setState("generating")
    setError(null)

    try {
      let response: Response
      
      if (databaseMode) {
        // Database mode: use database draft endpoint
        response = await fetch(`/api/task-instances/${jobId}/request/database/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            databaseId: databaseMode.databaseId,
            databaseName: databaseMode.databaseName,
            columns: columns.map(col => ({
              key: col.key,
              label: col.label,
              dataType: col.type,
            })),
            sampleRows: rows.slice(0, 5).map(r => r.values),
            userGoal: goal?.trim() || undefined,
          }),
        })
      } else {
        // CSV mode: use dataset draft endpoint
        response = await fetch(`/api/task-instances/${jobId}/request/dataset/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            draftId,
            userGoal: goal?.trim() || undefined,
          }),
        })
      }

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to generate draft")
      }

      const data = await response.json()
      
      setSubject(data.subject)
      setBody(data.body)
      setUsedColumns(data.usedColumns || [])
      setRefinementInstruction("")
      setState("ready")
    } catch (err: any) {
      console.error("Draft generation error:", err)
      setError(err.message || "Failed to generate draft")
      setState("error")
    }
  }, [jobId, draftId, databaseMode, columns, rows])
  
  // Auto-generate draft on mount
  useEffect(() => {
    generateDraft()
  }, [])

  // Refine draft
  const refineDraft = useCallback(async () => {
    if (!refinementInstruction.trim()) return
    
    setState("refining")
    setError(null)

    try {
      let response: Response
      
      if (databaseMode) {
        // Database mode: use database draft endpoint
        response = await fetch(`/api/task-instances/${jobId}/request/database/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            databaseId: databaseMode.databaseId,
            databaseName: databaseMode.databaseName,
            columns: columns.map(col => ({
              key: col.key,
              label: col.label,
              dataType: col.type,
            })),
            userGoal: refinementInstruction.trim(),
            currentDraft: { subject, body },
          }),
        })
      } else {
        // CSV mode: use dataset draft endpoint
        response = await fetch(`/api/task-instances/${jobId}/request/dataset/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            draftId,
            userGoal: refinementInstruction.trim(),
            currentDraft: { subject, body },
          }),
        })
      }

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to refine draft")
      }

      const data = await response.json()
      
      setSubject(data.subject)
      setBody(data.body)
      setUsedColumns(data.usedColumns || [])
      setRefinementInstruction("")
      setState("ready")
    } catch (err: any) {
      console.error("Refine error:", err)
      setError(err.message || "Failed to refine draft")
      setState("ready")
    }
  }, [jobId, draftId, refinementInstruction, subject, body])

  // Insert field at cursor
  const insertField = (columnKey: string) => {
    const fieldToken = `{{${columnKey}}}`
    
    if (activeField === "subject" && subjectRef.current) {
      const input = subjectRef.current
      const start = input.selectionStart || 0
      const end = input.selectionEnd || 0
      const newValue = subject.slice(0, start) + fieldToken + subject.slice(end)
      setSubject(newValue)
      
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + fieldToken.length, start + fieldToken.length)
      }, 0)
    } else if (activeField === "body" && bodyRef.current) {
      const textarea = bodyRef.current
      const start = textarea.selectionStart || 0
      const end = textarea.selectionEnd || 0
      const newValue = body.slice(0, start) + fieldToken + body.slice(end)
      setBody(newValue)
      
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + fieldToken.length, start + fieldToken.length)
      }, 0)
    }
  }

  // Add new column
  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return
    
    const columnKey = newColumnName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")

    if (columns.some(c => c.key === columnKey)) {
      setError("A column with this name already exists")
      return
    }

    setAddingColumn(true)
    setError(null)

    try {
      const response = await fetch(`/api/task-instances/${jobId}/request/dataset`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          draftId,
          action: "add_column",
          payload: {
            columnKey,
            columnLabel: newColumnName.trim(),
            columnType: newColumnType,
            defaultValue: newColumnDefault.trim() || undefined,
          },
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add column")
      }

      const newColumn: DatasetColumn = {
        key: columnKey,
        label: newColumnName.trim(),
        type: newColumnType,
      }
      onColumnsChange([...columns, newColumn])

      setShowAddColumn(false)
      setNewColumnName("")
      setNewColumnType("text")
      setNewColumnDefault("")
    } catch (err: any) {
      console.error("Add column error:", err)
      setError(err.message || "Failed to add column")
    } finally {
      setAddingColumn(false)
    }
  }

  // Save draft before send
  const saveDraft = async () => {
    try {
      const response = await fetch(`/api/task-instances/${jobId}/request/dataset`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          draftId,
          action: "update_draft",
          payload: {
            subject: subject.trim(),
            body: body.trim(),
          },
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save draft")
      }
      return true
    } catch (err: any) {
      console.error("Save draft error:", err)
      setError(err.message || "Failed to save draft")
      return false
    }
  }

  // Handle send
  const handleSend = async () => {
    setState("sending")
    setError(null)
    setShowConfirmation(false)

    // For CSV mode, save draft first
    if (!databaseMode) {
      const saved = await saveDraft()
      if (!saved) {
        setState("ready")
        return
      }
    }

    try {
      let response: Response
      
      if (databaseMode) {
        // Database mode: send using database endpoint
        response = await fetch(`/api/task-instances/${jobId}/request/database/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            databaseId: databaseMode.databaseId,
            boardPeriod: databaseMode.boardPeriod,
            subjectTemplate: subject.trim(),
            bodyTemplate: body.trim(),
            sendTiming,
            scheduleOffsetDays: sendTiming === "scheduled" ? scheduleOffsetDays : undefined,
            reminderConfig: sendTiming === "immediate" && remindersEnabled
              ? {
                  enabled: true,
                  frequencyDays: reminderDays,
                  maxCount: reminderMaxCount,
                }
              : { enabled: false },
          }),
        })
      } else {
        // CSV mode: send using dataset endpoint
        response = await fetch(`/api/task-instances/${jobId}/request/dataset/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            draftId,
            sendTiming,
            scheduleOffsetDays: sendTiming === "scheduled" ? scheduleOffsetDays : undefined,
            reminderConfig: sendTiming === "immediate" && remindersEnabled
              ? {
                  enabled: true,
                  frequencyDays: reminderDays,
                  maxCount: reminderMaxCount,
                }
              : { enabled: false },
          }),
        })
      }

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to send emails")
      }

      const data = await response.json()
      
      // Extract failed recipient details from results
      const failedRecipients = (data.results || [])
        .filter((r: any) => !r.success)
        .map((r: any) => ({ email: r.email, error: r.error }))
      
      setSendResults({
        sent: data.summary.sent,
        failed: data.summary.failed,
        skipped: data.summary.skipped,
        failedRecipients: failedRecipients.length > 0 ? failedRecipients : undefined,
      })
      setState("success")
      
      setTimeout(() => {
        onSuccess()
      }, 2000)
    } catch (err: any) {
      console.error("Send error:", err)
      setError(err.message || "Failed to send emails")
      setState("error")
    }
  }

  return (
    <div className="space-y-4">
      {/* Generating State */}
      {state === "generating" && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-orange-500 animate-pulse" />
          </div>
          <p className="text-gray-600">Generating personalized draft...</p>
          <p className="text-sm text-gray-400 mt-1">This may take a few seconds</p>
        </div>
      )}

      {/* Sending State */}
      {state === "sending" && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
          <p className="text-gray-600">Sending emails...</p>
          <p className="text-sm text-gray-400 mt-1">This may take a moment</p>
        </div>
      )}

      {/* Success State */}
      {state === "success" && sendResults && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${sendResults.failed > 0 ? "bg-amber-100" : "bg-green-100"}`}>
            <CheckCircle className={`w-8 h-8 ${sendResults.failed > 0 ? "text-amber-600" : "text-green-600"}`} />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {sendResults.failed > 0 ? "Emails Partially Sent" : "Emails Sent!"}
          </h3>
          <p className="text-gray-600 text-center">
            Successfully sent {sendResults.sent} email{sendResults.sent !== 1 ? "s" : ""}.
            {sendResults.failed > 0 && (
              <span className="text-red-600 block mt-1">
                {sendResults.failed} failed to send.
              </span>
            )}
            {sendResults.skipped > 0 && (
              <span className="text-amber-600 block mt-1">
                {sendResults.skipped} skipped (invalid email).
              </span>
            )}
          </p>
          {/* Show failed recipient details */}
          {sendResults.failedRecipients && sendResults.failedRecipients.length > 0 && (
            <div className="mt-4 w-full max-w-md">
              <p className="text-sm font-medium text-red-700 mb-2">Failed recipients:</p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                {sendResults.failedRecipients.map((r, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium text-red-800">{r.email}</span>
                    {r.error && (
                      <p className="text-red-600 text-xs mt-0.5">{r.error}</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Failed sends are tracked in Requests with a &quot;Failed&quot; status. You can retry by sending a new request to these recipients.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main Editor + Preview */}
      {(state === "ready" || state === "refining" || state === "error") && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Draft Editor */}
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Subject</Label>
                <Input
                  ref={subjectRef}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onFocus={() => setActiveField("subject")}
                  placeholder="Email subject..."
                  className="font-medium"
                />
              </div>
              
              <div>
                <Label className="mb-2 block">Body</Label>
                <Textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onFocus={() => setActiveField("body")}
                  placeholder="Email body..."
                  className="min-h-[300px] text-sm"
                  style={{ fontFamily: "Arial, sans-serif" }}
                />
              </div>

              {/* Insert Fields */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-gray-500 py-1">Insert:</span>
                {insertableColumns.slice(0, 5).map((col) => (
                  <button
                    key={col.key}
                    onClick={() => insertField(col.key)}
                    className={`
                      px-2 py-1 rounded text-xs transition-colors
                      ${usedColumns.includes(col.key) 
                        ? "bg-green-100 text-green-700 hover:bg-green-200" 
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }
                    `}
                  >
                    {`{{${col.key}}}`}
                  </button>
                ))}
                {insertableColumns.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-auto py-1 px-2"
                    onClick={() => setShowAddColumn(true)}
                  >
                    +{insertableColumns.length - 5} more
                  </Button>
                )}
              </div>

              {/* Refinement */}
              <div className="flex gap-2">
                <Input
                  value={refinementInstruction}
                  onChange={(e) => setRefinementInstruction(e.target.value)}
                  placeholder="Refine: e.g., make more polite, add urgency..."
                  disabled={state === "refining"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && refinementInstruction.trim()) {
                      e.preventDefault()
                      refineDraft()
                    }
                  }}
                  className="text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refineDraft}
                  disabled={!refinementInstruction.trim() || state === "refining"}
                >
                  {state === "refining" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Right: Recipients & Preview */}
            <div className="border rounded-lg overflow-hidden">
              {/* Header with recipient selector */}
              <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">
                    Preview ({validation.validEmails} recipients)
                  </span>
                </div>
                {validRows.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(prev => (prev - 1 + validRows.length) % validRows.length)}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <ChevronLeft className="w-4 h-4 text-gray-600" />
                    </button>
                    <span className="text-xs text-gray-500 min-w-[60px] text-center">
                      {previewIndex + 1} of {validRows.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(prev => (prev + 1) % validRows.length)}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                )}
              </div>
              
              {/* Recipient Info */}
              {currentPreviewRow && (
                <div className="px-4 py-2 bg-orange-50 border-b flex items-center gap-2">
                  <User className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium text-orange-800">
                    {getRecipientName(currentPreviewRow)}
                  </span>
                  <span className="text-xs text-orange-600">
                    ({currentPreviewRow.email})
                  </span>
                </div>
              )}
              
              {/* Preview Content */}
              <div className="p-4 max-h-[350px] overflow-y-auto">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Subject</div>
                <p className="font-medium text-gray-900 mb-4">{getPreviewSubject()}</p>
                
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Body</div>
                <div 
                  className="text-sm text-gray-700 whitespace-pre-wrap"
                  style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6" }}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(
                      getPreviewBody()
                        .replace(/\n/g, '<br>')
                        .replace(
                          /\[MISSING: ([^\]]+)\]/g,
                          '<span style="background-color: #fef3c7; padding: 2px 4px; border-radius: 2px; color: #92400e;">[$1]</span>'
                        )
                    )
                  }}
                />
              </div>
            </div>
          </div>

          {/* When to Send */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-gray-500" />
              <Label className="font-medium text-sm">When to send</Label>
            </div>
            
            <div className="space-y-2">
              {/* Send Now */}
              <label 
                className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-colors ${
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
                    <span className="font-medium text-sm text-gray-900">Send now</span>
                  </div>
                  <p className="text-xs text-gray-500">Emails go out immediately</p>
                </div>
              </label>

              {/* Schedule */}
              <label 
                className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-colors ${
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
                    <span className="font-medium text-sm text-gray-900">Schedule for later</span>
                  </div>
                  <p className="text-xs text-gray-500">Send at a specific time relative to the period</p>
                </div>
              </label>
            </div>

            {/* Schedule Options */}
            {sendTiming === "scheduled" && (
              <div className="mt-3 pt-3 border-t">
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  When should this be sent?
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={scheduleOffsetDays}
                    onChange={(e) => setScheduleOffsetDays(Number(e.target.value))}
                    className="block w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
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
              </div>
            )}
          </div>

          {/* Reminder Settings */}
          <div className={`border rounded-lg p-3 ${sendTiming === "scheduled" ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-gray-500" />
                <div>
                  <Label className="font-medium text-sm">Automatic Reminders</Label>
                  <p className="text-xs text-gray-500">
                    {sendTiming === "scheduled" 
                      ? "Coming soon for scheduled requests"
                      : "Follow-up with non-responders"
                    }
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => sendTiming !== "scheduled" && setRemindersEnabled(!remindersEnabled)}
                disabled={sendTiming === "scheduled"}
                className={`
                  relative inline-flex h-5 w-9 items-center rounded-full transition-colors
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
                    inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
                    ${remindersEnabled && sendTiming !== "scheduled" ? "translate-x-5" : "translate-x-1"}
                  `}
                />
              </button>
            </div>
            
            {remindersEnabled && sendTiming !== "scheduled" && (
              <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Frequency</Label>
                  <Select value={reminderDays.toString()} onValueChange={(v) => setReminderDays(parseInt(v))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Every day</SelectItem>
                      <SelectItem value="2">Every 2 days</SelectItem>
                      <SelectItem value="3">Every 3 days</SelectItem>
                      <SelectItem value="5">Every 5 days</SelectItem>
                      <SelectItem value="7">Every week</SelectItem>
                      <SelectItem value="14">Every 2 weeks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Max Reminders</Label>
                  <Select value={reminderMaxCount.toString()} onValueChange={(v) => setReminderMaxCount(parseInt(v))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 reminder</SelectItem>
                      <SelectItem value="2">2 reminders</SelectItem>
                      <SelectItem value="3">3 reminders</SelectItem>
                      <SelectItem value="5">5 reminders</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-2 border-t">
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Button 
              onClick={() => setShowConfirmation(true)}
              disabled={!subject.trim() || !body.trim()}
            >
              <Send className="w-4 h-4 mr-2" />
              Send to {validation.validEmails} Recipients
            </Button>
          </div>
        </>
      )}

      {/* Add Column Modal */}
      <Dialog open={showAddColumn} onOpenChange={setShowAddColumn}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="mb-2 block">Column Name</Label>
              <Input
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="e.g., Invoice Number"
              />
            </div>
            <div>
              <Label className="mb-2 block">Type</Label>
              <Select value={newColumnType} onValueChange={(v) => setNewColumnType(v as DatasetColumn["type"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="currency">Currency</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Default Value (optional)</Label>
              <Input
                value={newColumnDefault}
                onChange={(e) => setNewColumnDefault(e.target.value)}
                placeholder="Value for all rows"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddColumn(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddColumn} disabled={!newColumnName.trim() || addingColumn}>
              {addingColumn ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Column"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Send</DialogTitle>
            <DialogDescription>
              You are about to send personalized emails to {validation.validEmails} recipients.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Recipients</span>
              <span className="font-medium">{validation.validEmails}</span>
            </div>
            {validation.invalidEmails.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Skipped (invalid)</span>
                <span className="font-medium text-amber-600">{validation.invalidEmails.length}</span>
              </div>
            )}
            {remindersEnabled && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Reminders</span>
                <span className="font-medium">
                  Every {reminderDays} day{reminderDays !== 1 ? "s" : ""}, up to {reminderMaxCount}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmation(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend}>
              <Send className="w-4 h-4 mr-2" />
              Send Emails
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
