"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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
  Send, 
  Edit2, 
  Trash2, 
  User, 
  Mail, 
  Calendar,
  Clock,
  AlertCircle,
  Check,
  X,
  FileText
} from "lucide-react"

interface DraftRequest {
  id: string
  entityId: string | null
  entity: {
    id: string
    firstName: string
    lastName: string | null
    email: string
    companyName: string | null
  } | null
  campaignName: string | null
  campaignType: string | null
  scheduleConfig: any
  scheduledSendAt: string | null
  remindersEnabled: boolean
  remindersFrequencyHours: number | null
  remindersMaxCount: number | null
  createdAt: string
  subject: string | null
  body: string | null
  htmlBody: string | null
  sourceInfo: {
    requestId: string
    taskName: string | null
    boardName: string | null
    periodStart: string | null
    periodEnd: string | null
    createdAt: string
  } | null
  hasEdits: boolean
}

interface Contact {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  companyName: string | null
}

interface DraftRequestReviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskInstanceId: string
  draft: DraftRequest | null
  availableContacts: Contact[]
  onSuccess: () => void
}

export function DraftRequestReviewModal({
  open,
  onOpenChange,
  taskInstanceId,
  draft,
  availableContacts,
  onSuccess
}: DraftRequestReviewModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit form state
  const [editSubject, setEditSubject] = useState("")
  const [editBody, setEditBody] = useState("")
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [remindersApproved, setRemindersApproved] = useState(false)

  // Reset form when draft changes
  useEffect(() => {
    if (draft) {
      setEditSubject(draft.subject || "")
      setEditBody(draft.body || "")
      setSelectedEntityId(draft.entityId)
      setRemindersApproved(false)
      setError(null)
      setIsEditing(false)
    }
  }, [draft])

  const handleSaveEdits = async () => {
    if (!draft) return
    setIsSaving(true)
    setError(null)

    try {
      // Use consolidated /requests endpoint with action: "update"
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            requestId: draft.id,
            action: "update",
            subject: editSubject,
            body: editBody,
            entityId: selectedEntityId
          })
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save changes")
      }

      setIsEditing(false)
      onSuccess() // Refresh the parent
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSend = async () => {
    if (!draft) return
    setIsSending(true)
    setError(null)

    try {
      // Use consolidated /requests endpoint with action: "send"
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            requestId: draft.id,
            action: "send",
            remindersApproved
          })
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to send request")
      }

      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSending(false)
    }
  }

  const handleDelete = async () => {
    if (!draft) return
    if (!confirm("Are you sure you want to delete this draft request?")) return

    setIsDeleting(true)
    setError(null)

    try {
      // Use consolidated /requests endpoint with requestId in body
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/requests`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ requestId: draft.id })
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete draft")
      }

      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsDeleting(false)
    }
  }

  if (!draft) return null

  const selectedContact = availableContacts.find(c => c.id === selectedEntityId) || draft.entity

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-600" />
            Review Draft Request
          </DialogTitle>
        </DialogHeader>

        {/* Source Info Banner */}
        {draft.sourceInfo && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
            <p className="text-amber-800">
              <span className="font-medium">Copied from:</span>{" "}
              {draft.sourceInfo.taskName || "Unknown task"} in{" "}
              {draft.sourceInfo.boardName || "Unknown board"}
              {draft.sourceInfo.periodStart && draft.sourceInfo.periodEnd && (
                <span className="text-amber-600">
                  {" "}({(() => {
                    const startPart = draft.sourceInfo.periodStart.split("T")[0]
                    const [sy, sm, sd] = startPart.split("-").map(Number)
                    return new Date(sy, sm - 1, sd).toLocaleDateString()
                  })()} - {(() => {
                    const endPart = draft.sourceInfo.periodEnd.split("T")[0]
                    const [ey, em, ed] = endPart.split("-").map(Number)
                    return new Date(ey, em - 1, ed).toLocaleDateString()
                  })()})
                </span>
              )}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-4 mt-4">
          {/* Recipient Section */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                Recipient
              </Label>
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="text-xs"
                >
                  <Edit2 className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>

            {isEditing ? (
              <Select
                value={selectedEntityId || ""}
                onValueChange={setSelectedEntityId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select recipient..." />
                </SelectTrigger>
                <SelectContent>
                  {availableContacts.map(contact => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.firstName} {contact.lastName || ""}{" "}
                      {contact.email && <span className="text-gray-500">({contact.email})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-medium">
                  {selectedContact ? selectedContact.firstName[0] : "?"}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {selectedContact
                      ? `${selectedContact.firstName} ${selectedContact.lastName || ""}`.trim()
                      : "No recipient selected"}
                  </p>
                  {selectedContact?.email && (
                    <p className="text-sm text-gray-500">{selectedContact.email}</p>
                  )}
                  {selectedContact?.companyName && (
                    <p className="text-xs text-gray-400">{selectedContact.companyName}</p>
                  )}
                </div>
              </div>
            )}

            {!selectedContact?.email && (
              <div className="mt-2 flex items-center gap-2 text-amber-600 text-xs">
                <AlertCircle className="w-3 h-3" />
                Recipient must have a valid email address
              </div>
            )}
          </div>

          {/* Subject Section */}
          <div className="border border-gray-200 rounded-lg p-4">
            <Label className="text-sm font-medium flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-gray-500" />
              Subject
            </Label>
            {isEditing ? (
              <Input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Enter subject..."
              />
            ) : (
              <p className="text-gray-900">{draft.subject || "No subject"}</p>
            )}
          </div>

          {/* Body Section */}
          <div className="border border-gray-200 rounded-lg p-4">
            <Label className="text-sm font-medium mb-2 block">Email Body</Label>
            {isEditing ? (
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Enter email body..."
                className="min-h-[200px]"
              />
            ) : (
              <div className="bg-gray-50 rounded p-3 max-h-[200px] overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                  {draft.body || "No content"}
                </pre>
              </div>
            )}
          </div>

          {/* Reminder Config */}
          {draft.remindersEnabled && (
            <div className="border border-gray-200 rounded-lg p-4">
              <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-gray-500" />
                Reminders
              </Label>
              <p className="text-sm text-gray-600 mb-3">
                Reminders are configured for this request:{" "}
                {draft.remindersMaxCount} reminders, every {draft.remindersFrequencyHours} hours.
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remindersApproved}
                  onChange={(e) => setRemindersApproved(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm">Enable reminders for this request</span>
              </label>
            </div>
          )}

          {/* Schedule Info */}
          {draft.scheduleConfig?.mode === "period_aware" && (
            <div className="border border-gray-200 rounded-lg p-4">
              <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                Scheduling
              </Label>
              <p className="text-sm text-gray-600">
                Period-aware scheduling: {draft.scheduleConfig.offsetDays || 0} business days{" "}
                {(draft.scheduleConfig.offsetDays || 0) < 0 ? "before" : "after"}{" "}
                {draft.scheduleConfig.anchor || "period_end"}
              </p>
              {draft.scheduledSendAt && (
                <p className="text-sm text-gray-500 mt-1">
                  Scheduled for: {new Date(draft.scheduledSendAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 mt-4">
          <Button
            variant="ghost"
            onClick={handleDelete}
            disabled={isDeleting || isSending || isSaving}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            {isDeleting ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
                Deleting...
              </span>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Draft
              </>
            )}
          </Button>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false)
                    setEditSubject(draft.subject || "")
                    setEditBody(draft.body || "")
                    setSelectedEntityId(draft.entityId)
                  }}
                  disabled={isSaving}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEdits}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Saving...
                    </span>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSending}
                >
                  Close
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={isSending || !selectedContact?.email}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {isSending ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Sending...
                    </span>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Review & Send
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
