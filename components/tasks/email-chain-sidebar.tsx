"use client"

import { useState, useEffect, useCallback } from "react"
import { X, Paperclip, Send, Check, ChevronDown, ChevronUp, AlertCircle, Clock, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatDistanceToNow } from "date-fns"
import { getTaskCompletionState, getStateBadgeColors, TaskCompletionState } from "@/lib/taskState"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Message {
  id: string
  direction: "INBOUND" | "OUTBOUND"
  subject: string | null
  body: string | null
  htmlBody: string | null
  fromAddress: string
  toAddress: string
  createdAt: string
  attachments: any
  openedAt?: string | null
  openedCount?: number
  lastOpenedAt?: string | null
  aiClassification?: string | null
  aiReasoning?: string | null
}

interface Task {
  id: string
  entity: {
    firstName: string | null
    email: string | null
  }
  campaignName: string | null
  status: string
  hasAttachments?: boolean
  aiVerified?: boolean | null
  updatedAt?: string
  createdAt?: string
  hasReplies?: boolean
  messageCount?: number
  replyCount?: number
  aiReasoning?: any
  latestInboundClassification?: string | null
  aiSummary?: string | null
  aiSummaryConfidence?: string | null
}

interface EmailChainSidebarProps {
  task: Task | null
  isOpen: boolean
  onClose: () => void
}

export function EmailChainSidebar({ task, isOpen, onClose }: EmailChainSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [markingRead, setMarkingRead] = useState(false)
  const [threadExpanded, setThreadExpanded] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState(true)
  const [overrideStatus, setOverrideStatus] = useState<string | null>(null)
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null)

  const fetchMessages = useCallback(async () => {
    if (!task) return

    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/messages`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data)
      }
    } catch (error) {
      console.error("Error fetching messages:", error)
    } finally {
      setLoading(false)
    }
  }, [task?.id])

  useEffect(() => {
    if (task && isOpen) {
      fetchMessages()
    } else {
      setMessages([])
      setReplyText("")
    }
  }, [task?.id, isOpen, fetchMessages])

  const handleReply = async () => {
    if (!task || !replyText.trim() || sending) return

    setSending(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText })
      })

      if (response.ok) {
        setReplyText("")
        fetchMessages() // Refresh messages
      }
    } catch (error) {
      console.error("Error sending reply:", error)
    } finally {
      setSending(false)
    }
  }

  const handleMarkAsRead = async () => {
    if (!task?.id || markingRead) return

    setMarkingRead(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/mark-read`, {
        method: "POST",
        credentials: 'include',
        headers: { "Content-Type": "application/json" }
      })

      if (response.ok) {
        fetchMessages() // Refresh messages
        // Also refresh the task to update the read status
        if (task.id) {
          fetch(`/api/tasks/${task.id}`, {
            credentials: 'include'
          })
            .then(r => r.json())
            .then(data => {
              // Update parent component if needed
              window.location.reload() // Simple refresh to update tab counts
            })
            .catch(console.error)
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to mark as read" }))
        alert(errorData.error || "Failed to mark as read")
      }
    } catch (error) {
      console.error("Error marking as read:", error)
      alert("Failed to mark as read")
    } finally {
      setMarkingRead(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    })
  }

  if (!isOpen || !task) return null

  // Handle manual status override
  const handleStatusOverride = async (newStatus: "FULFILLED" | "FLAGGED" | "MANUAL_REVIEW" | "REJECTED") => {
    if (!task?.id) return

    setOverrideStatus(newStatus)
    setOverrideMessage(null)

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to update status" }))
        throw new Error(errorData.error || "Failed to update status")
      }

      const data = await response.json()
      
      // Update local task state optimistically
      if (task) {
        task.status = newStatus
        task.updatedAt = new Date().toISOString()
      }

      // Show success message
      setOverrideMessage("Status updated successfully")
      setTimeout(() => {
        setOverrideMessage(null)
        setOverrideStatus(null)
      }, 2000)

      // Refresh the page to update the list view
      // In a more sophisticated implementation, we'd update the parent state
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (error: any) {
      console.error("Error updating task status:", error)
      setOverrideMessage(error.message || "Failed to update status")
      setOverrideStatus(null)
      setTimeout(() => setOverrideMessage(null), 3000)
    }
  }

  // Get latest inbound message classification from messages
  const latestInboundMessage = messages
    .filter(m => m.direction === "INBOUND")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  const latestClassification = latestInboundMessage?.aiClassification || task.latestInboundClassification || null

  // Compute task state (use override status if set)
  const effectiveStatus = overrideStatus || task.status
  const taskState = getTaskCompletionState({
    status: effectiveStatus,
    hasAttachments: task.hasAttachments ?? false,
    aiVerified: task.aiVerified ?? null,
    updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
    hasReplies: task.hasReplies ?? false,
    latestInboundClassification: latestClassification
  })
  const stateColors = getStateBadgeColors(taskState)
  
  // Get attachment count
  const attachmentCount = messages.reduce((count, msg) => {
    if (msg.attachments && typeof msg.attachments === 'object' && 'keys' in msg.attachments) {
      return count + ((msg.attachments as any).keys?.length || 0)
    }
    return count
  }, 0)
  
  // Get verification status
  const verificationStatus = task.hasAttachments 
    ? (task.aiVerified === true ? "verified" : task.aiVerified === false ? "failed" : "pending")
    : null

  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-white border-l border-gray-200 shadow-xl z-10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {task.campaignName || "Task Details"}
          </h3>
          {task.entity && (
            <p className="text-xs text-gray-500 truncate">
              {task.entity.firstName || task.entity.email}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-4 p-1 hover:bg-gray-100 rounded"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Summary Card */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-gray-50 overflow-y-auto">
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Status</CardTitle>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stateColors.bg} ${stateColors.text}`}>
                {taskState}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* Contact & Request */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Contact</div>
              <div className="font-medium text-gray-900">
                {task.entity?.firstName || task.entity?.email || "Unknown"}
              </div>
              {task.entity?.email && (
                <div className="text-xs text-gray-500 mt-0.5">{task.entity.email}</div>
              )}
            </div>
            
            <div>
              <div className="text-xs text-gray-500 mb-1">Request</div>
              <div className="text-gray-900">{task.campaignName || "No campaign name"}</div>
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-200">
              <div>
                <div className="text-xs text-gray-500 mb-1">Last Activity</div>
                <div className="text-xs text-gray-900">
                  {task.updatedAt 
                    ? formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })
                    : "Unknown"}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Messages</div>
                <div className="text-xs text-gray-900">{task.messageCount || messages.length || 0}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Attachments</div>
                <div className="text-xs text-gray-900">{attachmentCount || 0}</div>
              </div>
            </div>

            {/* Reason (Classification) */}
            {latestClassification && (
              <div className="pt-2 border-t border-gray-200">
                <div className="text-xs text-gray-500 mb-1">Reason</div>
                <div className="text-xs text-gray-900 capitalize">
                  {latestClassification.toLowerCase()}
                </div>
              </div>
            )}

            {/* Verification Status */}
            {verificationStatus && (
              <div className="pt-2 border-t border-gray-200">
                <div className="text-xs text-gray-500 mb-1">Verification</div>
                <div className={`text-xs font-medium ${
                  verificationStatus === "verified" ? "text-green-600" :
                  verificationStatus === "failed" ? "text-red-600" :
                  "text-yellow-600"
                }`}>
                  {verificationStatus === "verified" ? "✓ Verified" :
                   verificationStatus === "failed" ? "✗ Verification failed" :
                   "⏳ Verifying..."}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Summary */}
        <Card>
          <CardHeader className="pb-3">
            <button
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="flex items-center justify-between w-full"
            >
              <CardTitle className="text-sm">Summary</CardTitle>
              {summaryExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </CardHeader>
          {summaryExpanded && (
            <CardContent>
              {task.aiSummary ? (
                <div className="text-sm text-gray-700">
                  {task.aiSummary}
                  {task.aiSummaryConfidence && (
                    <div className="text-xs text-gray-500 mt-2">
                      Confidence: {task.aiSummaryConfidence}
                    </div>
                  )}
                </div>
              ) : task.aiReasoning ? (
                <div className="text-sm text-gray-700">
                  {typeof task.aiReasoning === 'string' 
                    ? task.aiReasoning 
                    : task.aiReasoning.reasoning || task.aiReasoning.summary || "Summary available"}
                </div>
              ) : taskState !== "Pending" ? (
                <div className="text-sm text-gray-500 italic">
                  Summary pending...
                </div>
              ) : (
                <div className="text-sm text-gray-500 italic">
                  Summary not available yet
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Manual Override */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-2">Manual Override</div>
          {overrideMessage && (
            <div className={`mb-2 text-xs p-2 rounded ${
              overrideMessage.includes("success") 
                ? "bg-green-50 text-green-700 border border-green-200" 
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {overrideMessage}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={overrideStatus !== null}
              onClick={() => handleStatusOverride("FULFILLED")}
            >
              {overrideStatus === "FULFILLED" ? "Updating..." : "Mark Complete"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={overrideStatus !== null}
              onClick={() => handleStatusOverride("MANUAL_REVIEW")}
            >
              {overrideStatus === "MANUAL_REVIEW" ? "Updating..." : "Needs Review"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={overrideStatus !== null}
              onClick={() => handleStatusOverride("FLAGGED")}
            >
              {overrideStatus === "FLAGGED" ? "Updating..." : "Flag"}
            </Button>
          </div>
        </div>
      </div>

      {/* Thread Section - Collapsed by Default */}
      <div className="flex-1 overflow-y-auto border-t border-gray-200">
        <button
          onClick={() => setThreadExpanded(!threadExpanded)}
          className="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 border-b border-gray-200 flex items-center justify-between"
        >
          <span>View email thread ({messages.length} messages)</span>
          {threadExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {threadExpanded && (
          <div className="p-4 space-y-4">
            {loading ? (
              <div className="text-center text-gray-500 py-8">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No messages yet</div>
            ) : (
              messages.map((message) => (
              <div
                key={message.id}
                className={`
                  rounded-lg p-3 border
                  ${message.direction === "INBOUND" 
                    ? "bg-blue-50 border-blue-200" 
                    : "bg-gray-50 border-gray-200"
                  }
                `}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900">
                      {message.direction === "INBOUND" ? "From" : "To"}: {message.fromAddress}
                    </div>
                    {message.subject && (
                      <div className="text-xs text-gray-600 mt-1">
                        {message.subject}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end ml-2 flex-shrink-0">
                    <div className="text-xs text-gray-500">
                      {formatDate(message.createdAt)}
                    </div>
                    {message.direction === "OUTBOUND" && message.openedAt && (
                      <div className="flex items-center gap-1 text-xs text-green-600 mt-1" title={message.openedCount && message.openedCount > 1 ? `Opened ${message.openedCount} times` : "Opened"}>
                        <Check className="w-3 h-3" />
                        {message.lastOpenedAt && (
                          <span>
                            {formatDistanceToNow(new Date(message.lastOpenedAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {message.attachments && typeof message.attachments === 'object' && 'keys' in message.attachments && Array.isArray((message.attachments as any).keys) && (message.attachments as any).keys.length > 0 && (
                  <div className="flex items-center gap-1 mb-2 text-xs text-gray-600">
                    <Paperclip className="w-3 h-3" />
                    <span>{(message.attachments as any).keys.length} attachment(s)</span>
                  </div>
                )}

                {message.htmlBody ? (
                  <div 
                    className="text-sm text-gray-700 break-words prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: message.htmlBody }}
                  />
                ) : message.body ? (
                  <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                    {message.body}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 italic">No content</div>
                )}
              </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Reply Box */}
      {task && (
        <div className="border-t border-gray-200 p-4 space-y-2">
          {/* Mark as Read button for testing (only show if not already read) */}
          {messages.some(m => m.direction === "OUTBOUND" && !m.openedAt) && (
            <Button
              onClick={handleMarkAsRead}
              disabled={markingRead}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {markingRead ? "Marking..." : "Mark as Read (Test)"}
            </Button>
          )}
          <Textarea
            placeholder="Type your reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={4}
            className="mb-2"
          />
          <Button
            onClick={handleReply}
            disabled={!replyText.trim() || sending}
            className="w-full"
            size="sm"
          >
            <Send className="w-4 h-4 mr-2" />
            {sending ? "Sending..." : "Send Reply"}
          </Button>
        </div>
      )}
    </div>
  )
}

