"use client"

import { useState, useRef, useEffect } from "react"
import { format } from "date-fns"
import { sanitizeHtml } from "@/lib/utils/sanitize-html"
import {
  Mail,
  Reply,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Eye,
  Bot,
  AlertTriangle
} from "lucide-react"

interface ThreadMessage {
  id: string
  direction: string
  subject: string | null
  body: string | null
  htmlBody: string | null
  fromAddress: string
  toAddress: string
  createdAt: string
  attachments: any
  aiClassification: string | null
  aiReasoning: string | null
  isAutoReply: boolean
  openedAt: string | null
  openedCount: number
}

interface EmailThreadViewerProps {
  thread: ThreadMessage[]
  currentMessageId: string
}

export function EmailThreadViewer({ thread, currentMessageId }: EmailThreadViewerProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Start with current message expanded
    return new Set([currentMessageId])
  })
  const currentMessageRef = useRef<HTMLDivElement>(null)

  // Scroll to current message on mount
  useEffect(() => {
    if (currentMessageRef.current) {
      currentMessageRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [])

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const getAttachmentCount = (attachments: any): number => {
    if (!attachments) return 0
    if (Array.isArray(attachments)) return attachments.length
    if (typeof attachments === 'object' && attachments.keys) return attachments.keys.length
    return 0
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900">Email Thread</h3>
          <span className="text-xs text-gray-500">
            ({thread.length} message{thread.length !== 1 ? 's' : ''})
          </span>
        </div>
      </div>

      {/* Thread Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {thread.map((message, index) => {
          const isInbound = message.direction === "INBOUND"
          const isCurrentMessage = message.id === currentMessageId
          const isExpanded = expandedIds.has(message.id)
          const attachmentCount = getAttachmentCount(message.attachments)

          return (
            <div
              key={message.id}
              ref={isCurrentMessage ? currentMessageRef : undefined}
              className={`border rounded-lg overflow-hidden transition-all ${
                isCurrentMessage 
                  ? 'ring-2 ring-orange-500 border-orange-300' 
                  : isInbound 
                  ? 'border-blue-200 bg-blue-50/50' 
                  : 'border-gray-200 bg-white'
              }`}
            >
              {/* Message Header */}
              <button
                onClick={() => toggleExpanded(message.id)}
                className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors text-left"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Direction Badge */}
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      isInbound 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {isInbound ? (
                        <Reply className="w-3 h-3" />
                      ) : (
                        <Mail className="w-3 h-3" />
                      )}
                      {isInbound ? 'Reply' : 'Sent'}
                    </span>

                    {/* Auto-reply indicator */}
                    {message.isAutoReply && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                        <Bot className="w-3 h-3" />
                        Auto-reply
                      </span>
                    )}

                    {/* AI Classification */}
                    {message.aiClassification && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        message.aiClassification === 'BOUNCE' 
                          ? 'bg-red-100 text-red-700'
                          : message.aiClassification === 'DATA'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {message.aiClassification}
                      </span>
                    )}

                    {/* Attachments */}
                    {attachmentCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <Paperclip className="w-3 h-3" />
                        {attachmentCount}
                      </span>
                    )}

                    {/* Read receipt */}
                    {!isInbound && message.openedAt && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <Eye className="w-3 h-3" />
                        Opened {message.openedCount}x
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-sm">
                    <span className="font-medium text-gray-900 truncate">
                      {isInbound ? message.fromAddress : `To: ${message.toAddress}`}
                    </span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500 text-xs">
                      {format(new Date(message.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>

                  {!isExpanded && (
                    <p className="mt-1 text-sm text-gray-500 truncate">
                      {message.subject || "(no subject)"}
                    </p>
                  )}
                </div>
              </button>

              {/* Message Body (Expanded) */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {/* Subject */}
                  <div className="py-2 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</span>
                    <p className="text-sm text-gray-900 mt-0.5">
                      {message.subject || "(no subject)"}
                    </p>
                  </div>

                  {/* Body */}
                  <div className="py-3">
                    {message.htmlBody ? (
                      <div 
                        className="prose prose-sm max-w-none text-gray-700"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.htmlBody) }}
                      />
                    ) : (
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                        {message.body || "(no content)"}
                      </pre>
                    )}
                  </div>

                  {/* AI Reasoning (if present) */}
                  {message.aiReasoning && (
                    <div className="mt-2 p-2 bg-gray-50 rounded-md text-xs text-gray-600">
                      <span className="font-medium">AI Analysis:</span> {message.aiReasoning}
                    </div>
                  )}

                  {/* Attachments (metadata only) */}
                  {attachmentCount > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <Paperclip className="w-3 h-3" />
                        Attachments ({attachmentCount})
                      </span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(() => {
                          const attachments = message.attachments
                          if (Array.isArray(attachments)) {
                            return attachments.map((att: any, idx: number) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 rounded-md text-gray-700"
                              >
                                <Paperclip className="w-3 h-3" />
                                {att.filename || att.name || `Attachment ${idx + 1}`}
                              </span>
                            ))
                          }
                          if (attachments?.keys) {
                            return attachments.keys.map((key: string, idx: number) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 rounded-md text-gray-700"
                              >
                                <Paperclip className="w-3 h-3" />
                                {key.split('/').pop() || `Attachment ${idx + 1}`}
                              </span>
                            ))
                          }
                          return null
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
