"use client"

import { useState, useEffect, useCallback } from "react"
import { X, Paperclip, ChevronDown, ChevronUp } from "lucide-react"
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
  const [threadExpanded, setThreadExpanded] = useState(true)
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [overrideStatus, setOverrideStatus] = useState<string | null>(null)
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null)
  const [overrideRisk, setOverrideRisk] = useState<string | null>(null)
  const [riskOverrideMessage, setRiskOverrideMessage] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

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
        fetchMessages()
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
        fetchMessages()
        if (task.id) {
          fetch(`/api/tasks/${task.id}`, {
            credentials: 'include'
          })
            .then(r => r.json())
            .then(() => {
              window.location.reload()
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

      if (task) {
        task.status = newStatus
        task.updatedAt = new Date().toISOString()
      }

      setOverrideMessage("Status updated successfully")
      setTimeout(() => {
        setOverrideMessage(null)
        setOverrideStatus(null)
      }, 2000)

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

  const handleRiskOverride = async (riskLevel: "high" | "medium" | "low" | "unknown") => {
    if (!task?.id) return

    setOverrideRisk(riskLevel)
    setRiskOverrideMessage(null)

    try {
      const response = await fetch(`/api/tasks/${task.id}/risk`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ 
          riskLevel,
          overrideReason: `Manual override to ${riskLevel}` 
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to update risk" }))
        throw new Error(errorData.error || "Failed to update risk")
      }

      if (task) {
        task.riskLevel = riskLevel
        task.manualRiskOverride = riskLevel
        task.overrideReason = `Manual override to ${riskLevel}`
        task.updatedAt = new Date().toISOString()
      }

      setRiskOverrideMessage("Risk level updated successfully")
      setTimeout(() => {
        setRiskOverrideMessage(null)
        setOverrideRisk(null)
      }, 2000)

      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (error: any) {
      console.error("Error updating risk:", error)
      setRiskOverrideMessage(error.message || "Failed to update risk")
      setOverrideRisk(null)
      setTimeout(() => setRiskOverrideMessage(null), 3000)
    }
  }

  const latestInboundMessage = messages
    .filter(m => m.direction === "INBOUND")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  const latestClassification = latestInboundMessage?.aiClassification || task.latestInboundClassification || null

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
  
  const attachmentCount = messages.reduce((count, msg) => {
    if (msg.attachments && typeof msg.attachments === 'object' && 'keys' in msg.attachments) {
      return count + ((msg.attachments as any).keys?.length || 0)
    }
    return count
  }, 0)
  
  const verificationStatus = task.hasAttachments 
    ? (task.aiVerified === true ? "verified" : task.aiVerified === false ? "failed" : "pending")
    : null

  return (
    <div className="absolute right-0 top-0 h-full w-full max-w-[640px] md:w-[45vw] md:max-w-[720px] bg-white border-l border-gray-200 shadow-xl z-10 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Card className="bg-gray-50">
          <CardContent className="py-3 px-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">
                {task.entity?.firstName || task.entity?.email || "Unknown"}
              </span>
              {task.entity?.email && (
                <span className="text-xs text-gray-500">{task.entity.email}</span>
              )}
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stateColors.bg} ${stateColors.text}`}>
                {taskState}
              </span>
              <span className="text-xs text-gray-500">
                Last activity: {task.updatedAt ? formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true }) : "Unknown"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <button
              onClick={() => setThreadExpanded(!threadExpanded)}
              className="flex items-center justify-between w-full"
            >
              <CardTitle className="text-sm">Thread</CardTitle>
              {threadExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </CardHeader>
          {threadExpanded && (
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-gray-500">Loading thread...</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-gray-500">No messages yet</p>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className="border border-gray-200 rounded-md p-3">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span className="font-medium text-gray-700">{msg.direction === "INBOUND" ? "Received" : "Sent"}</span>
                        <span>{formatDate(msg.createdAt)}</span>
                      </div>
                      <div className="text-sm text-gray-900 whitespace-pre-wrap">
                        {msg.body || "(no content)"}
                      </div>
                      {msg.attachments && typeof msg.attachments === 'object' && 'keys' in msg.attachments && (msg.attachments as any).keys?.length > 0 && (
                        <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          {(msg.attachments as any).keys.length} attachment(s)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <div className="p-4 border border-gray-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">Reply in-app</h4>
          </div>
          <Textarea
            placeholder="Type your reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={4}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={sending || !replyText.trim()}
              onClick={handleReply}
            >
              {sending ? "Sending..." : "Send Reply"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={fetchMessages}
            >
              Refresh thread
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <button
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="flex items-center justify-between w-full"
            >
              <CardTitle className="text-sm">AI Summary & Risk</CardTitle>
              {summaryExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </CardHeader>
          {summaryExpanded && (
            <CardContent className="space-y-3 text-sm">
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
              {latestClassification && (
                <div className="pt-2 border-t border-gray-200">
                  <div className="text-xs text-gray-500 mb-1">Latest classification</div>
                  <div className="text-xs text-gray-900 capitalize">
                    {latestClassification.toLowerCase()}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex items-center justify-between w-full"
            >
              <CardTitle className="text-sm">Advanced</CardTitle>
              {advancedOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </CardHeader>
          {advancedOpen && (
            <CardContent className="space-y-4 text-sm">
              {verificationStatus && (
                <div>
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

              {attachmentCount > 0 && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Attachments</div>
                  <div className="text-xs text-gray-900">{attachmentCount}</div>
                </div>
              )}

              <div className="pt-2 border-t border-gray-200">
                <div className="text-xs text-gray-500 mb-2">Manual Overrides</div>
                {overrideMessage && (
                  <div className={`mb-2 text-xs p-2 rounded ${
                    overrideMessage.includes("success") 
                      ? "bg-green-50 text-green-700 border border-green-200" 
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}>
                    {overrideMessage}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mb-3">
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={overrideStatus !== null}
                    onClick={() => handleStatusOverride("REJECTED")}
                  >
                    {overrideStatus === "REJECTED" ? "Updating..." : "Reject"}
                  </Button>
                </div>

                {riskOverrideMessage && (
                  <div className={`mb-2 text-xs p-2 rounded ${
                    riskOverrideMessage.includes("success") 
                      ? "bg-green-50 text-green-700 border border-green-200" 
                      : "bg-red-50 text-red-700 border red-200"
                  }`}>
                    {riskOverrideMessage}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={overrideRisk !== null}
                    onClick={() => handleRiskOverride("high")}
                  >
                    {overrideRisk === "high" ? "Updating..." : "High Risk"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={overrideRisk !== null}
                    onClick={() => handleRiskOverride("medium")}
                  >
                    {overrideRisk === "medium" ? "Updating..." : "Medium Risk"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={overrideRisk !== null}
                    onClick={() => handleRiskOverride("low")}
                  >
                    {overrideRisk === "low" ? "Updating..." : "Low Risk"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={overrideRisk !== null}
                    onClick={() => handleRiskOverride("unknown")}
                  >
                    {overrideRisk === "unknown" ? "Updating..." : "Unknown"}
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markingRead}
                  onClick={handleMarkAsRead}
                  className="text-xs"
                >
                  {markingRead ? "Marking..." : "Mark as read"}
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
