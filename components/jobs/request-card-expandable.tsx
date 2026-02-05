"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  ChevronDown, ChevronRight, Users, Clock, Bell, 
  MessageSquare, CheckCircle, AlertCircle, Pause, 
  PlayCircle, Mail, Paperclip, Eye, AlertTriangle,
  Shield, ShieldAlert, ShieldCheck, ShieldQuestion, X
} from "lucide-react"
import { format } from "date-fns"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"

// Types
interface RequestRecipient {
  id: string
  entityId?: string
  name: string
  email: string
  status: string
  riskLevel?: string | null
  manualRiskOverride?: string | null
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

interface RequestCardExpandableProps {
  request: JobRequest
  onRefresh: () => void
}

// Reminder info from API
interface ReminderInfo {
  enabled: boolean
  config: { startDelayHours: number | null; frequencyHours: number | null; maxCount: number | null }
  state: {
    sentCount: number
    nextSendAt: string | null
    lastSentAt: string | null
    stoppedReason: string | null
    remainingReminders: number
  } | null
}

// Status options for recipient dropdown - No reply, Replied, Complete
const RECIPIENT_STATUS_OPTIONS = [
  { value: "NO_REPLY", label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  { value: "REPLIED", label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  { value: "COMPLETE", label: "Complete", icon: CheckCircle, bgColor: "bg-green-100", textColor: "text-green-700" },
]

// All status display config - map legacy statuses to simplified display
const ALL_STATUS_DISPLAY: Record<string, { label: string; icon: any; bgColor: string; textColor: string }> = {
  // New statuses
  NO_REPLY: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  REPLIED: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  COMPLETE: { label: "Complete", icon: CheckCircle, bgColor: "bg-green-100", textColor: "text-green-700" },
  // Legacy statuses (mapped to new display)
  AWAITING_RESPONSE: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  IN_PROGRESS: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  HAS_ATTACHMENTS: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  VERIFYING: { label: "Replied", icon: MessageSquare, bgColor: "bg-blue-100", textColor: "text-blue-700" },
  FULFILLED: { label: "Complete", icon: CheckCircle, bgColor: "bg-green-100", textColor: "text-green-700" },
  REJECTED: { label: "Complete", icon: CheckCircle, bgColor: "bg-green-100", textColor: "text-green-700" },
  FLAGGED: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  MANUAL_REVIEW: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  ON_HOLD: { label: "No reply", icon: Clock, bgColor: "bg-amber-100", textColor: "text-amber-700" },
}

// Risk level options for dropdown
const RISK_OPTIONS = [
  { value: "high", label: "High Risk", icon: ShieldAlert, bgColor: "bg-red-100", textColor: "text-red-700" },
  { value: "medium", label: "Medium Risk", icon: Shield, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  { value: "low", label: "Low Risk", icon: ShieldCheck, bgColor: "bg-green-100", textColor: "text-green-700" },
  { value: "unknown", label: "Unknown", icon: ShieldQuestion, bgColor: "bg-gray-100", textColor: "text-gray-700" },
]

// Risk display config
const RISK_DISPLAY: Record<string, { label: string; icon: any; bgColor: string; textColor: string }> = {
  high: { label: "High", icon: ShieldAlert, bgColor: "bg-red-100", textColor: "text-red-700" },
  medium: { label: "Medium", icon: Shield, bgColor: "bg-amber-100", textColor: "text-amber-700" },
  low: { label: "Low", icon: ShieldCheck, bgColor: "bg-green-100", textColor: "text-green-700" },
  unknown: { label: "Unknown", icon: ShieldQuestion, bgColor: "bg-gray-100", textColor: "text-gray-500" },
}

// Mini status badge for the grid
function RecipientStatusBadge({ status }: { status: string }) {
  const config = ALL_STATUS_DISPLAY[status] || { 
    label: status, 
    icon: Clock, 
    bgColor: "bg-gray-100", 
    textColor: "text-gray-700" 
  }
  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

// Status dropdown for changing recipient status
function RecipientStatusDropdown({ 
  recipientId, 
  currentStatus, 
  onStatusChange 
}: { 
  recipientId: string
  currentStatus: string
  onStatusChange: () => void 
}) {
  const [updating, setUpdating] = useState(false)

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return
    
    setUpdating(true)
    try {
      const response = await fetch(`/api/requests/detail/${recipientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus })
      })
      
      if (!response.ok) {
        throw new Error("Failed to update status")
      }
      
      onStatusChange()
    } catch (err) {
      console.error("Error updating status:", err)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Select 
      value={currentStatus} 
      onValueChange={handleStatusChange}
      disabled={updating}
    >
      <SelectTrigger className="w-[130px] h-7 text-xs border-0 bg-transparent p-0 hover:bg-gray-100 rounded-full">
        <SelectValue>
          <RecipientStatusBadge status={currentStatus} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {RECIPIENT_STATUS_OPTIONS.map(option => {
          const Icon = option.icon
          return (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center gap-2">
                <Icon className="w-3 h-3" />
                {option.label}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

// Risk badge for display
function RiskBadge({ riskLevel }: { riskLevel: string | null | undefined }) {
  const level = riskLevel || "unknown"
  const config = RISK_DISPLAY[level] || RISK_DISPLAY.unknown
  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

// Risk dropdown for changing risk level (manual override)
function RiskDropdown({ 
  recipientId, 
  currentRisk, 
  onRiskChange 
}: { 
  recipientId: string
  currentRisk: string | null | undefined
  onRiskChange: () => void 
}) {
  const [updating, setUpdating] = useState(false)

  const handleRiskChange = async (newRisk: string) => {
    if (newRisk === currentRisk) return
    
    setUpdating(true)
    try {
      const response = await fetch(`/api/requests/detail/${recipientId}/risk`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ riskLevel: newRisk, overrideReason: "Manual override" })
      })
      
      if (!response.ok) {
        throw new Error("Failed to update risk")
      }
      
      onRiskChange()
    } catch (err) {
      console.error("Error updating risk:", err)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Select 
      value={currentRisk || "unknown"} 
      onValueChange={handleRiskChange}
      disabled={updating}
    >
      <SelectTrigger className="w-[110px] h-7 text-xs border-0 bg-transparent p-0 hover:bg-gray-100 rounded-full">
        <SelectValue>
          <RiskBadge riskLevel={currentRisk} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {RISK_OPTIONS.map(option => {
          const Icon = option.icon
          return (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center gap-2">
                <Icon className="w-3 h-3" />
                {option.label}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

// Check if recipient has replied (status indicates reply)
function hasReplied(status: string): boolean {
  return ["REPLIED", "HAS_ATTACHMENTS", "FULFILLED", "VERIFYING"].includes(status)
}

// Reminder draft preview interface
interface ReminderDraftPreview {
  subject: string
  body: string
  htmlBody: string
  reminderNumber: number
  daysSinceSent: number
}

export function RequestCardExpandable({ request, onRefresh }: RequestCardExpandableProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [replyMessageIds, setReplyMessageIds] = useState<Record<string, string>>({})
  const [reminderInfo, setReminderInfo] = useState<Record<string, ReminderInfo>>({})
  const [cancellingReminder, setCancellingReminder] = useState<string | null>(null)
  const [previewingReminder, setPreviewingReminder] = useState<string | null>(null)
  const [reminderDraftPreview, setReminderDraftPreview] = useState<ReminderDraftPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Mark requests as read when expanded
  useEffect(() => {
    const markRequestsAsRead = async () => {
      const recipients = (request.recipients || []).filter(r => r != null)
      for (const recipient of recipients) {
        try {
          await fetch(`/api/requests/detail/${recipient.id}/mark-read`, {
            method: "POST",
            credentials: "include"
          })
        } catch (err) {
          // Silent fail - mark-read is not critical
          console.debug("Mark-read failed for:", recipient.id)
        }
      }
    }

    if (expanded) {
      markRequestsAsRead()
    }
  }, [expanded, request.recipients])

  // Fetch latest inbound message IDs for recipients who have replied
  useEffect(() => {
    const fetchReplyMessageIds = async () => {
      const recipients = (request.recipients || []).filter(r => r != null)
      const repliedRecipients = recipients.filter(r => hasReplied(r.status))
      if (repliedRecipients.length === 0) return

      // Fetch messages for each replied recipient's task
      const messageIds: Record<string, string> = {}
      for (const recipient of repliedRecipients) {
        try {
          const response = await fetch(`/api/requests/detail/${recipient.id}/messages`, {
            credentials: "include"
          })
          if (response.ok) {
            const messages = await response.json()
            // Find the latest inbound message
            const inboundMessage = messages
              .filter((m: any) => m.direction === "INBOUND")
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
            if (inboundMessage) {
              messageIds[recipient.id] = inboundMessage.id
            }
          }
        } catch (err) {
          console.error("Error fetching messages for recipient:", err)
        }
      }
      setReplyMessageIds(messageIds)
    }

    if (expanded) {
      fetchReplyMessageIds()
    }
  }, [expanded, request.recipients])

  // Fetch reminder info for recipients when expanded
  useEffect(() => {
    const fetchReminderInfoForRecipients = async () => {
      if (!request.reminderConfig?.enabled) return
      
      const recipients = (request.recipients || []).filter(r => r != null)
      for (const recipient of recipients) {
        try {
          const response = await fetch(`/api/requests/detail/${recipient.id}/reminders`, {
            credentials: "include"
          })
          if (response.ok) {
            const data = await response.json()
            setReminderInfo(prev => ({ ...prev, [recipient.id]: data }))
          }
        } catch (err) {
          console.error("Error fetching reminder info:", err)
        }
      }
    }
    
    if (expanded) {
      fetchReminderInfoForRecipients()
    }
  }, [expanded, request.recipients, request.reminderConfig?.enabled])

  // Cancel reminders for a recipient
  const handleCancelReminders = async (recipientId: string) => {
    setCancellingReminder(recipientId)
    try {
      const response = await fetch(`/api/requests/detail/${recipientId}/reminders`, {
        method: "DELETE",
        credentials: "include"
      })
      if (response.ok) {
        // Refresh reminder info
        const refreshResponse = await fetch(`/api/requests/detail/${recipientId}/reminders`, {
          credentials: "include"
        })
        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          setReminderInfo(prev => ({ ...prev, [recipientId]: data }))
        }
      }
    } catch (err) {
      console.error("Error cancelling reminders:", err)
    } finally {
      setCancellingReminder(null)
    }
  }

  // Preview next reminder for a recipient
  const handlePreviewReminder = async (recipientId: string) => {
    setPreviewingReminder(recipientId)
    setLoadingPreview(true)
    try {
      const sentCount = reminderInfo[recipientId]?.state?.sentCount || 0
      const nextReminderNumber = sentCount + 1
      
      const response = await fetch(`/api/requests/detail/${recipientId}/reminder-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reminderNumber: nextReminderNumber })
      })
      
      if (response.ok) {
        const data = await response.json()
        setReminderDraftPreview(data.draft)
      }
    } catch (err) {
      console.error("Error fetching reminder preview:", err)
    } finally {
      setLoadingPreview(false)
    }
  }

  // Close reminder preview
  const closeReminderPreview = () => {
    setPreviewingReminder(null)
    setReminderDraftPreview(null)
  }

  const handleReview = (recipientId: string) => {
    const messageId = replyMessageIds[recipientId]
    if (messageId) {
      router.push(`/dashboard/review/${messageId}`)
    }
  }

  // Handle viewing a recipient - go to review page if replied, otherwise fetch and navigate
  const handleViewRecipient = async (recipient: RequestRecipient) => {
    // If we have a cached message ID, go directly to review
    if (replyMessageIds[recipient.id]) {
      router.push(`/dashboard/review/${replyMessageIds[recipient.id]}`)
      return
    }

    // Try to fetch the latest message for this recipient's task
    try {
      const response = await fetch(`/api/requests/detail/${recipient.id}/messages`, {
        credentials: "include"
      })
      if (response.ok) {
        const messages = await response.json()
        // Get the latest inbound message (reply) or outbound message
        const inboundMsg = messages
          .filter((m: any) => m.direction === "INBOUND")
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        
        if (inboundMsg) {
          router.push(`/dashboard/review/${inboundMsg.id}`)
          return
        }

        // If no inbound, get the latest outbound
        const outboundMsg = messages
          .filter((m: any) => m.direction === "OUTBOUND")
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        
        if (outboundMsg) {
          router.push(`/dashboard/review/${outboundMsg.id}`)
          return
        }
      }
    } catch (error) {
      console.error("Error fetching messages:", error)
    }

    // No messages found - this shouldn't happen for sent requests
    console.warn("No messages found for recipient:", recipient.id)
  }

  const requestTitle = request.subjectTemplate || request.generatedSubject || request.suggestedCampaignName || "Request"
  const sentDate = request.sentAt 
    ? format(new Date(request.sentAt), "MMM d, yyyy 'at' h:mm a")
    : format(new Date(request.createdAt), "MMM d, yyyy 'at' h:mm a")

  // Count recipients by reply status
  const safeRecipients = (request.recipients || []).filter(r => r != null)
  const repliedCount = safeRecipients.filter(r => hasReplied(r.status)).length
  const awaitingCount = safeRecipients.length - repliedCount

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header - clickable to expand */}
      <div 
        className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button className="p-0.5 hover:bg-gray-200 rounded">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-gray-900 truncate">
              {requestTitle}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {request.taskCount} recipient{request.taskCount !== 1 ? "s" : ""}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {sentDate}
              </span>
              {request.reminderConfig?.enabled && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-blue-600">
                    <Bell className="w-3 h-3" />
                    {request.reminderConfig.frequencyHours && request.reminderConfig.frequencyHours >= 24
                      ? `Every ${Math.round(request.reminderConfig.frequencyHours / 24)}d`
                      : `Every ${request.reminderConfig.frequencyHours}h`
                    }
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Summary badges */}
        <div className="flex items-center gap-2">
          {repliedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
              <MessageSquare className="w-3 h-3" />
              {repliedCount} replied
            </span>
          )}
          {awaitingCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              <Clock className="w-3 h-3" />
              {awaitingCount} awaiting
            </span>
          )}
          <StatusBadge status={request.status} size="sm" />
        </div>
      </div>

      {/* Reminder Preview Modal */}
      {previewingReminder && reminderDraftPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeReminderPreview}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Reminder #{reminderDraftPreview.reminderNumber} Preview
              </h3>
              <button onClick={closeReminderPreview} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Subject</div>
                <div className="text-sm font-medium text-gray-900">{reminderDraftPreview.subject}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Body</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                  {reminderDraftPreview.body}
                </div>
              </div>
              <div className="text-xs text-gray-400">
                {reminderDraftPreview.daysSinceSent} days since original email was sent
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button 
                onClick={closeReminderPreview}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded content - Recipients grid */}
      {expanded && (
        <div className="border-t border-gray-200">
          {safeRecipients.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              No recipients found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
                    {request.reminderConfig?.enabled && (
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reminders</th>
                    )}
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {safeRecipients.map((recipient) => (
                    <tr key={recipient.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium">
                            {(recipient.name || 'U').split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2) || 'U'}
                          </div>
                          <span className="font-medium text-gray-900">{recipient.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {recipient.email || 'Unknown'}
                      </td>
                      <td className="px-4 py-2">
                        <RecipientStatusDropdown
                          recipientId={recipient.id}
                          currentStatus={recipient.status || 'NO_REPLY'}
                          onStatusChange={onRefresh}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <RiskDropdown
                          recipientId={recipient.id}
                          currentRisk={recipient.riskLevel}
                          onRiskChange={onRefresh}
                        />
                      </td>
                      {request.reminderConfig?.enabled && (
                        <td className="px-4 py-2">
                          {reminderInfo[recipient.id] ? (
                            <div className="flex items-center gap-2">
                              {reminderInfo[recipient.id].state?.stoppedReason === "cancelled" ? (
                                <span className="text-xs text-gray-400">Cancelled</span>
                              ) : reminderInfo[recipient.id].state?.stoppedReason ? (
                                <span className="text-xs text-gray-400">
                                  Stopped: {reminderInfo[recipient.id].state?.stoppedReason}
                                </span>
                              ) : reminderInfo[recipient.id].state?.nextSendAt ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-600">
                                    Next: {format(new Date(reminderInfo[recipient.id].state!.nextSendAt!), "MMM d, h:mm a")}
                                  </span>
                                  <button
                                    onClick={() => handlePreviewReminder(recipient.id)}
                                    disabled={loadingPreview && previewingReminder === recipient.id}
                                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50"
                                  >
                                    {loadingPreview && previewingReminder === recipient.id ? "..." : "Preview"}
                                  </button>
                                  <button
                                    onClick={() => handleCancelReminders(recipient.id)}
                                    disabled={cancellingReminder === recipient.id}
                                    className="text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                                  >
                                    {cancellingReminder === recipient.id ? "..." : "Cancel"}
                                  </button>
                                </div>
                              ) : reminderInfo[recipient.id].state?.sentCount ? (
                                <span className="text-xs text-gray-400">
                                  {reminderInfo[recipient.id].state?.sentCount} sent
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">Pending</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewRecipient(recipient)
                          }}
                          className="p-1.5 hover:bg-orange-100 rounded-lg transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4 text-orange-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
