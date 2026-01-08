"use client"

import { useState, useEffect, useCallback } from "react"
import { X, Paperclip, Send, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatDistanceToNow } from "date-fns"

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
}

interface Task {
  id: string
  entity: {
    firstName: string | null
    email: string | null
  }
  campaignName: string | null
  status: string
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

  if (!isOpen) return null

  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-white border-l border-gray-200 shadow-xl z-10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {task?.campaignName || "Email Thread"}
          </h3>
          {task?.entity && (
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
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

