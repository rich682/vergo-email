"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Send,
  Loader2,
  AlertCircle,
  CheckCircle,
  Mail,
  Users,
  Clock,
  Bell,
  AlertTriangle,
  ChevronLeft,
  Eye,
} from "lucide-react"
import type { DatasetColumn, DatasetRow, DatasetValidation } from "@/lib/utils/dataset-parser"

interface PreviewSendStepProps {
  jobId: string
  draftId: string
  subject: string
  body: string
  columns: DatasetColumn[]
  rows: DatasetRow[]
  validation: DatasetValidation
  onBack: () => void
  onSuccess: () => void
}

interface RecipientPreview {
  email: string
  values: Record<string, string>
  renderStatus: string | null
  preview?: Record<string, string>
}

interface PreviewResult {
  renderedSubject: string
  renderedBody: string
  missingFields: string[]
  missingPlaceholders: string[]
  renderStatus: string
}

type SendState = "idle" | "sending" | "success" | "error"

export function PreviewSendStep({
  jobId,
  draftId,
  subject,
  body,
  columns,
  rows,
  validation,
  onBack,
  onSuccess,
}: PreviewSendStepProps) {
  const [sendState, setSendState] = useState<SendState>("idle")
  const [error, setError] = useState<string | null>(null)
  
  // Recipients
  const [recipients, setRecipients] = useState<RecipientPreview[]>([])
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  
  // Reminder settings
  const [remindersEnabled, setRemindersEnabled] = useState(false)
  const [reminderDays, setReminderDays] = useState(7)
  const [reminderMaxCount, setReminderMaxCount] = useState(3)
  
  // Confirmation modal
  const [showConfirmation, setShowConfirmation] = useState(false)
  
  // Send results
  const [sendResults, setSendResults] = useState<{
    sent: number
    failed: number
    skipped: number
  } | null>(null)

  // Fetch recipients on mount
  useEffect(() => {
    const fetchRecipients = async () => {
      try {
        const response = await fetch(
          `/api/jobs/${jobId}/request/dataset?draftId=${draftId}`,
          { credentials: "include" }
        )
        
        if (response.ok) {
          const data = await response.json()
          setRecipients(data.recipients || [])
          
          // Auto-select first recipient
          if (data.recipients?.length > 0) {
            setSelectedEmail(data.recipients[0].email)
          }
        }
      } catch (err) {
        console.error("Error fetching recipients:", err)
      }
    }
    
    fetchRecipients()
  }, [jobId, draftId])

  // Fetch preview for selected recipient
  useEffect(() => {
    if (!selectedEmail) {
      setPreview(null)
      return
    }

    const fetchPreview = async () => {
      setLoadingPreview(true)
      
      try {
        const response = await fetch(`/api/jobs/${jobId}/request/dataset/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ draftId, email: selectedEmail }),
        })

        if (response.ok) {
          const data = await response.json()
          setPreview({
            renderedSubject: data.renderedSubject,
            renderedBody: data.renderedBody,
            missingFields: data.missingFields || [],
            missingPlaceholders: data.missingPlaceholders || [],
            renderStatus: data.renderStatus,
          })
        }
      } catch (err) {
        console.error("Error fetching preview:", err)
      } finally {
        setLoadingPreview(false)
      }
    }

    fetchPreview()
  }, [jobId, draftId, selectedEmail])

  // Handle send
  const handleSend = async () => {
    setSendState("sending")
    setError(null)
    setShowConfirmation(false)

    try {
      const response = await fetch(`/api/jobs/${jobId}/request/dataset/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          draftId,
          reminderConfig: remindersEnabled
            ? {
                enabled: true,
                frequencyDays: reminderDays,
                maxCount: reminderMaxCount,
              }
            : { enabled: false },
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to send emails")
      }

      const data = await response.json()
      
      setSendResults({
        sent: data.summary.sent,
        failed: data.summary.failed,
        skipped: data.summary.skipped,
      })
      setSendState("success")
      
      // Auto-close after success
      setTimeout(() => {
        onSuccess()
      }, 2000)
    } catch (err: any) {
      console.error("Send error:", err)
      setError(err.message || "Failed to send emails")
      setSendState("error")
    }
  }

  // Get recipient display name
  const getRecipientName = (recipient: RecipientPreview) => {
    const values = recipient.values
    return values.first_name || values.name || values.full_name || recipient.email
  }

  // Count recipients with missing fields
  const recipientsWithIssues = recipients.filter(
    r => r.renderStatus === "missing" || r.renderStatus === "failed"
  ).length

  return (
    <div className="space-y-6">
      {/* Success State */}
      {sendState === "success" && sendResults && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Emails Sent!</h3>
          <p className="text-gray-600 text-center">
            Successfully sent {sendResults.sent} email{sendResults.sent !== 1 ? "s" : ""}.
            {sendResults.failed > 0 && (
              <span className="text-red-600 block">
                {sendResults.failed} failed to send.
              </span>
            )}
            {sendResults.skipped > 0 && (
              <span className="text-amber-600 block">
                {sendResults.skipped} skipped (invalid email).
              </span>
            )}
          </p>
        </div>
      )}

      {/* Sending State */}
      {sendState === "sending" && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
          <p className="text-gray-600">Sending emails...</p>
          <p className="text-sm text-gray-400 mt-1">This may take a moment</p>
        </div>
      )}

      {/* Main Content */}
      {(sendState === "idle" || sendState === "error") && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Recipient List */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b">
              <div className="flex items-center justify-between">
                <Label className="font-medium flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  Recipients ({validation.validEmails})
                </Label>
                {recipientsWithIssues > 0 && (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {recipientsWithIssues} with issues
                  </span>
                )}
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {recipients.map((recipient) => (
                <button
                  key={recipient.email}
                  onClick={() => setSelectedEmail(recipient.email)}
                  className={`
                    w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors
                    ${selectedEmail === recipient.email 
                      ? "bg-orange-50 border-l-2 border-l-orange-500" 
                      : "hover:bg-gray-50"
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {getRecipientName(recipient)}
                      </p>
                      <p className="text-sm text-gray-500 truncate">{recipient.email}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {recipient.renderStatus === "ok" && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                      {recipient.renderStatus === "missing" && (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                      {recipient.renderStatus === "failed" && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                      <Eye className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Preview */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b">
              <Label className="font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-500" />
                Email Preview
              </Label>
            </div>
            <div className="p-4">
              {loadingPreview ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : preview ? (
                <div className="space-y-4">
                  {/* Missing Fields Warning */}
                  {(preview.missingFields.length > 0 || preview.missingPlaceholders.length > 0) && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">Missing Fields</p>
                          <p className="text-xs text-amber-600">
                            {[...preview.missingFields, ...preview.missingPlaceholders].join(", ")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Subject */}
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Subject</Label>
                    <p className="mt-1 font-medium text-gray-900">{preview.renderedSubject}</p>
                  </div>
                  
                  {/* Body */}
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Body</Label>
                    <div 
                      className="mt-2 p-4 bg-white border rounded-lg text-sm text-gray-700 max-h-[250px] overflow-y-auto whitespace-pre-wrap"
                      style={{ fontFamily: "Arial, sans-serif" }}
                      dangerouslySetInnerHTML={{ 
                        __html: preview.renderedBody
                          .replace(/\n/g, '<br>')
                          .replace(
                            /\[MISSING: ([^\]]+)\]/g, 
                            '<span style="background-color: #fef3c7; padding: 2px 4px; border-radius: 2px;">[$1]</span>'
                          )
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Select a recipient to preview</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reminder Settings */}
      {(sendState === "idle" || sendState === "error") && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-gray-500" />
              <div>
                <Label className="font-medium">Automatic Reminders</Label>
                <p className="text-sm text-gray-500">
                  Send follow-up reminders to recipients who haven't responded
                </p>
              </div>
            </div>
            <button
              type="button"
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
          
          {remindersEnabled && (
            <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-2 block">Frequency</Label>
                <Select value={reminderDays.toString()} onValueChange={(v) => setReminderDays(parseInt(v))}>
                  <SelectTrigger>
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
                <Label className="text-sm mb-2 block">Max Reminders</Label>
                <Select value={reminderMaxCount.toString()} onValueChange={(v) => setReminderMaxCount(parseInt(v))}>
                  <SelectTrigger>
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
      )}

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
      {(sendState === "idle" || sendState === "error") && (
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Draft
          </Button>
          <Button onClick={() => setShowConfirmation(true)}>
            <Send className="w-4 h-4 mr-2" />
            Send to {validation.validEmails} Recipients
          </Button>
        </div>
      )}

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
            {recipientsWithIssues > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    {recipientsWithIssues} recipient{recipientsWithIssues !== 1 ? "s have" : " has"} missing field values. 
                    These will show as blank in the email.
                  </p>
                </div>
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
