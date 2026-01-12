"use client"

import { useState, useEffect, useCallback } from "react"
import { Paperclip, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatDistanceToNow } from "date-fns"
import { getTaskCompletionState, getStateBadgeColors } from "@/lib/taskState"
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
  riskLevel?: string | null
}

interface EmailChainSidebarProps {
  task: Task | null
  isOpen: boolean
  onClose: () => void // kept for signature compatibility
}

export function EmailChainSidebar({ task, isOpen }: EmailChainSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [threadExpanded, setThreadExpanded] = useState(true)

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

  const latestInboundMessage = messages
    .filter((m) => m.direction === "INBOUND")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  const latestClassification = latestInboundMessage?.aiClassification || task.latestInboundClassification || null

  const effectiveStatus = task.status
  const taskState = getTaskCompletionState({
    status: effectiveStatus,
    hasAttachments: task.hasAttachments ?? false,
    aiVerified: task.aiVerified ?? null,
    updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
    hasReplies: task.hasReplies ?? false,
    latestInboundClassification: latestClassification
  })
  const stateColors = getStateBadgeColors(taskState)

  const riskLabelRaw = (task.riskLevel || latestClassification || "unknown").toString().toLowerCase()
  const riskColors: Record<string, string> = {
    high: "bg-red-100 text-red-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-green-100 text-green-800",
    unknown: "bg-gray-100 text-gray-800",
  }

  return (
    <div className="absolute right-0 top-0 h-full w-full max-w-[1100px] md:w-[65vw] md:max-w-[1200px] bg-white border-l border-gray-200 shadow-xl z-10 flex flex-col">
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
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${riskColors[riskLabelRaw] || riskColors.unknown}`}>
          {riskLabelRaw}
        </span>
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
              {typeof task.messageCount === "number" && (
                <span className="text-xs text-gray-500">Messages: {task.messageCount}</span>
              )}
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
                  {messages.map((msg) => {
                    const isInbound = msg.direction === "INBOUND"
                    const bubble = isInbound
                      ? "bg-blue-50 border-blue-200"
                      : "bg-gray-50 border-gray-200"
                    return (
                      <div key={msg.id} className={`border rounded-md p-3 ${bubble}`}>
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span className="font-medium text-gray-700">
                            {isInbound ? "Received" : "Sent"}
                          </span>
                          <span>{formatDate(msg.createdAt)}</span>
                        </div>
                        <div className="text-xs text-gray-600 mb-1">
                          {isInbound ? `From: ${msg.fromAddress}` : `To: ${msg.toAddress}`}
                        </div>
                        {msg.subject && (
                          <div className="text-xs text-gray-700 font-medium mb-1 truncate">
                            {msg.subject}
                          </div>
                        )}
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
                    )
                  })}
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
      </div>
    </div>
  )
}
