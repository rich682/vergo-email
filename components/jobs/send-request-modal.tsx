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

import { useState, useEffect, useCallback } from "react"
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
} from "lucide-react"

// Types
interface StakeholderContact {
  id: string
  email: string | null
  firstName: string
  lastName: string | null
  contactType?: string
}

interface Job {
  id: string
  name: string
  description: string | null
  dueDate: string | null
  labels: any
}

interface SendRequestModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: Job
  stakeholderContacts: StakeholderContact[]
  onSuccess: () => void
}

type ModalState = 
  | "idle"
  | "drafting"
  | "ready"
  | "refining"
  | "sending"
  | "success"
  | "error"

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
  stakeholderContacts,
  onSuccess,
}: SendRequestModalProps) {
  // State
  const [state, setState] = useState<ModalState>("idle")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [refinementInstruction, setRefinementInstruction] = useState("")
  const [remindersEnabled, setRemindersEnabled] = useState(false)
  const [usedFallback, setUsedFallback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Recipients with exclusion toggles
  const [recipients, setRecipients] = useState<Array<StakeholderContact & { included: boolean }>>([])

  // Fetch draft when modal opens
  const fetchDraft = useCallback(async () => {
    setState("drafting")
    setError(null)
    
    try {
      const response = await fetch(`/api/jobs/${job.id}/request/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to generate draft")
      }

      const data: DraftResponse = await response.json()
      
      setSubject(data.draft.subject)
      setBody(data.draft.body)
      setUsedFallback(data.usedFallback)
      
      // Initialize recipients from response (all included by default)
      setRecipients(
        data.recipients.map(r => ({
          ...r,
          included: true,
        }))
      )
      
      setState("ready")
    } catch (err: any) {
      console.error("Draft fetch error:", err)
      setError(err.message || "Failed to generate draft")
      // Still allow editing with fallback
      setSubject(`Request: ${job.name}`)
      setBody(`Hi {{First Name}},\n\nI'm reaching out regarding ${job.name}.\n\nPlease let me know if you have any questions.\n\nBest regards`)
      setUsedFallback(true)
      setRecipients(
        stakeholderContacts
          .filter(c => c.email)
          .map(r => ({ ...r, included: true }))
      )
      setState("ready")
    }
  }, [job.id, job.name, stakeholderContacts])

  // Fetch draft when modal opens
  useEffect(() => {
    if (open && state === "idle") {
      fetchDraft()
    }
  }, [open, state, fetchDraft])

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setState("idle")
      setSubject("")
      setBody("")
      setRefinementInstruction("")
      setRemindersEnabled(false)
      setUsedFallback(false)
      setError(null)
      setRecipients([])
    }
  }, [open])

  // Handle refinement
  const handleRefine = async () => {
    if (!refinementInstruction.trim()) return
    
    setState("refining")
    setError(null)
    
    try {
      const response = await fetch(`/api/jobs/${job.id}/request/refine`, {
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

  // Handle send
  const handleSend = async () => {
    const includedRecipients = recipients.filter(r => r.included)
    
    if (includedRecipients.length === 0) {
      setError("Please select at least one recipient")
      return
    }
    
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required")
      return
    }

    setState("sending")
    setError(null)

    try {
      // Build interpretation matching existing Quest structure
      // Extract unique contact types and entity IDs from included recipients
      const contactTypes = [...new Set(includedRecipients.map(r => r.contactType).filter(Boolean))] as string[]
      const entityIds = includedRecipients.map(r => r.id)

      const interpretation = {
        recipientSelection: {
          contactTypes: contactTypes.length > 0 ? contactTypes : undefined,
          entityIds: entityIds,
        },
        scheduleIntent: {
          sendTiming: "immediate" as const,
          deadline: job.dueDate || undefined,
        },
        reminderIntent: {
          enabled: remindersEnabled,
          frequency: remindersEnabled ? ("weekly" as const) : undefined,
          stopCondition: "reply_or_deadline" as const,
        },
        requestType: "one-off" as const,
        confidence: "high" as const,
        interpretationSummary: {
          audienceDescription: `${includedRecipients.length} stakeholder${includedRecipients.length !== 1 ? "s" : ""}`,
          scheduleDescription: "Send immediately",
          assumptions: ["Auto-drafted from Item context"],
        },
        warnings: [],
        resolvedCounts: {
          matchingRecipients: includedRecipients.length,
          excludedCount: recipients.length - includedRecipients.length,
        },
      }

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
                frequency: "weekly",
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
        }),
      })

      if (!executeResponse.ok) {
        const data = await executeResponse.json()
        const errorMessage = getErrorMessage(data.errorCode, data.error || "Failed to send request")
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

  // Computed values
  const includedCount = recipients.filter(r => r.included).length
  const totalCount = recipients.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-500" />
            Send Request
          </DialogTitle>
          <DialogDescription>
            Send an email request to stakeholders for: <strong>{job.name}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Drafting State */}
        {state === "drafting" && (
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
        {state === "success" && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="mt-4 font-medium text-gray-900">Request Sent!</h3>
            <p className="text-sm text-gray-500 mt-1">
              Sent to {includedCount} recipient{includedCount !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Ready/Refining/Error States - Show Form */}
        {(state === "ready" || state === "refining" || state === "error") && (
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

            {/* Recipients */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-500" />
                Recipients ({includedCount} of {totalCount})
              </Label>
              <div className="border border-gray-200 rounded-lg max-h-32 overflow-y-auto">
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
                        {recipient.contactType && (
                          <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">
                            {recipient.contactType}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
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

            {/* Body */}
            <div>
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Email body..."
                rows={8}
                className="mt-1 resize-none font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use {"{{First Name}}"} to personalize for each recipient
              </p>
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

            {/* Reminders Toggle */}
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <div>
                  <Label htmlFor="reminders" className="cursor-pointer">
                    Send reminders
                  </Label>
                  <p className="text-xs text-gray-500">
                    Weekly reminders until reply or deadline
                  </p>
                </div>
              </div>
              <button
                id="reminders"
                type="button"
                role="switch"
                aria-checked={remindersEnabled}
                onClick={() => setRemindersEnabled(!remindersEnabled)}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${remindersEnabled ? "bg-orange-500" : "bg-gray-200"}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${remindersEnabled ? "translate-x-6" : "translate-x-1"}
                  `}
                />
              </button>
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
                onClick={handleSend}
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
                    Sending...
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
        {state === "sending" && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
            </div>
            <h3 className="mt-4 font-medium text-gray-900">Sending request...</h3>
            <p className="text-sm text-gray-500 mt-1">
              Sending to {includedCount} recipient{includedCount !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
