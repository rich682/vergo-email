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
  onTaskUpdated?: () => void
}

export function EmailChainSidebar({ task, isOpen, onTaskUpdated }: EmailChainSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [threadExpanded, setThreadExpanded] = useState(true)
  const [markingDone, setMarkingDone] = useState(false)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [draftReady, setDraftReady] = useState(false)

  useEffect(() => {
    setReplyText("")
    setDraftReady(false)
  }, [task?.id])

  const fetchMessages = useCallback(async () => {
    if (!task) return

    setLoading(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/messages`)
      if (response.ok) {
        const data = await response.json()
        const sorted = Array.isArray(data)
          ? [...data].sort(
              (a: Message, b: Message) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
          : []
        setMessages(sorted)
        // reset expanded to collapsed by default
        setExpandedIds(new Set())
        setDraftReady(false)
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
        setDraftReady(false)
        fetchMessages()
      }
    } catch (error) {
      console.error("Error sending reply:", error)
    } finally {
      setSending(false)
    }
  }

  const handleGenerateDraft = async () => {
    if (!task || generatingDraft) return
    setGeneratingDraft(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}/reply-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: replyText })
      })
      if (response.ok) {
        const data = await response.json()
        const draft = data.draft || ""
        const signature = "\n\nBest regards,\n[Your Name]\n[Your Company]"
        const withSignature = draft.includes("Best regards") ? draft : `${draft}${signature}`
        setReplyText(withSignature)
        setDraftReady(true)
      }
    } catch (error) {
      console.error("Error generating draft reply:", error)
    } finally {
      setGeneratingDraft(false)
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
  const isDone = effectiveStatus === "FULFILLED"
  const completionLabel = isDone ? "Done" : "In progress"
  const completionColors = isDone
    ? "bg-green-100 text-green-800"
    : "bg-blue-100 text-blue-800"

  const riskLabelRaw = (task.riskLevel || latestClassification || "unknown").toString().toLowerCase()
  const riskLabelDisplay = riskLabelRaw.charAt(0).toUpperCase() + riskLabelRaw.slice(1)
  const riskColors: Record<string, string> = {
    high: "bg-red-100 text-red-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-green-100 text-green-800",
    unknown: "bg-gray-100 text-gray-800",
  }

  const handleMarkDone = async () => {
    if (!task || markingDone) return
    const nextStatus = isDone ? "AWAITING_RESPONSE" : "FULFILLED"
    setMarkingDone(true)
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      })
      if (response.ok) {
        fetchMessages()
        onTaskUpdated?.()
      }
    } catch (error) {
      console.error("Error updating task status:", error)
    } finally {
      setMarkingDone(false)
    }
  }

  return (
    <div className="absolute right-0 top-0 h-full w-full max-w-[900px] md:w-[55vw] md:max-w-[900px] bg-white border-l border-gray-200 shadow-xl z-10 flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {task.entity?.firstName || task.entity?.email || "Unknown"}
              </h3>
              {task.entity?.email && (
                <span className="text-xs text-gray-500 truncate">{task.entity.email}</span>
              )}
              {task.entity && "phone" in task.entity && (task.entity as any).phone && (
                <span className="text-xs text-gray-500 truncate">{(task.entity as any).phone}</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${completionColors}`}>
                {completionLabel}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stateColors.bg} ${stateColors.text}`}>
                {taskState}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${riskColors[riskLabelRaw] || riskColors.unknown}`}>
                {`Risk: ${riskLabelDisplay}`}
              </span>
              <span className="text-xs text-gray-500">
                Last activity: {task.updatedAt ? formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true }) : "Unknown"}
              </span>
              {typeof task.messageCount === "number" && (
                <span className="text-xs text-gray-500">Messages: {task.messageCount}</span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant={isDone ? "outline" : "default"}
            disabled={markingDone}
            onClick={handleMarkDone}
            className="whitespace-nowrap"
          >
            {markingDone ? "Updating..." : isDone ? "Mark Undone" : "Mark Done"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {task.aiSummary && (
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">AI Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-gray-900">{task.aiSummary}</p>
            </CardContent>
          </Card>
        )}

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
                    const trimmedBody = (() => {
                      const body = msg.body || ""
                      if (!body.trim()) return "(no content)"
                      const lines = body.split("\n")
                      const filtered = []
                      for (const line of lines) {
                        const trimmed = line.trim()
                        if (trimmed.startsWith(">")) break
                        if (/^On .*wrote:$/i.test(trimmed)) break
                        filtered.push(line)
                      }
                      const result = filtered.join("\n").trim()
                      return result || body
                    })()
                    const isExpanded = expandedIds.has(msg.id)
                    return (
                      <div key={msg.id} className={`border rounded-md p-3 ${bubble}`}>
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">
                              {isInbound ? "Received" : "Sent"}
                            </span>
                            <span className="text-gray-600 truncate max-w-[160px]">
                              {isInbound ? msg.fromAddress : msg.toAddress}
                            </span>
                          </div>
                          <button
                            className="text-xs text-blue-600 hover:underline"
                            onClick={() => {
                              const next = new Set(expandedIds)
                              if (next.has(msg.id)) {
                                next.delete(msg.id)
                              } else {
                                next.add(msg.id)
                              }
                              setExpandedIds(next)
                            }}
                          >
                            {isExpanded ? "Collapse" : "Expand"}
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>{msg.subject || "(no subject)"}</span>
                          <span>{formatDate(msg.createdAt)}</span>
                        </div>
                        {isExpanded && (
                          <>
                            <div className="text-sm text-gray-900 whitespace-pre-wrap mt-2">
                              {trimmedBody}
                            </div>
                            {msg.attachments && typeof msg.attachments === 'object' && 'keys' in msg.attachments && (msg.attachments as any).keys?.length > 0 && (
                              <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                <Paperclip className="w-3 h-3" />
                                {(msg.attachments as any).keys.length} attachment(s)
                              </div>
                            )}
                          </>
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
            placeholder="Type your prompt or edit the draft..."
            value={replyText}
            onChange={(e) => {
              setReplyText(e.target.value)
              setDraftReady(false)
            }}
            className="min-h-[220px]"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={generatingDraft || !task}
              onClick={handleGenerateDraft}
            >
              {generatingDraft ? "Generating..." : "Generate draft"}
            </Button>
            {draftReady && replyText.trim() && (
              <Button
                size="sm"
                disabled={sending}
                onClick={handleReply}
              >
                {sending ? "Sending..." : "Send Reply"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
