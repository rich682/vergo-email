"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  ChevronDown, ChevronRight, Users, Clock, Bell, 
  MessageSquare, CheckCircle, AlertCircle, Pause, 
  PlayCircle, Mail, Paperclip, Eye
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
      const response = await fetch(`/api/tasks/${recipientId}`, {
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

// Check if recipient has replied (status indicates reply)
function hasReplied(status: string): boolean {
  return ["REPLIED", "HAS_ATTACHMENTS", "FULFILLED", "VERIFYING"].includes(status)
}

export function RequestCardExpandable({ request, onRefresh }: RequestCardExpandableProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [replyMessageIds, setReplyMessageIds] = useState<Record<string, string>>({})

  // Fetch latest inbound message IDs for recipients who have replied
  useEffect(() => {
    const fetchReplyMessageIds = async () => {
      const repliedRecipients = request.recipients.filter(r => hasReplied(r.status))
      if (repliedRecipients.length === 0) return

      // Fetch messages for each replied recipient's task
      const messageIds: Record<string, string> = {}
      for (const recipient of repliedRecipients) {
        try {
          const response = await fetch(`/api/tasks/${recipient.id}/messages`, {
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
      const response = await fetch(`/api/tasks/${recipient.id}/messages`, {
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
  const repliedCount = request.recipients.filter(r => hasReplied(r.status)).length
  const awaitingCount = request.recipients.length - repliedCount

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

      {/* Expanded content - Recipients grid */}
      {expanded && (
        <div className="border-t border-gray-200">
          {request.recipients.length === 0 ? (
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
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {request.recipients.map((recipient) => (
                    <tr key={recipient.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium">
                            {recipient.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <span className="font-medium text-gray-900">{recipient.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {recipient.email}
                      </td>
                      <td className="px-4 py-2">
                        <RecipientStatusDropdown
                          recipientId={recipient.id}
                          currentStatus={recipient.status}
                          onStatusChange={onRefresh}
                        />
                      </td>
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
