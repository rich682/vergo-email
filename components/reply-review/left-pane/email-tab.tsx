"use client"

import { useState, useRef, useEffect } from "react"
import { format } from "date-fns"
import { ChevronDown, ChevronRight, Reply } from "lucide-react"
import { sanitizeHtml } from "@/lib/utils/sanitize-html"

interface ThreadMessage {
  id: string
  direction: string
  subject: string | null
  body: string | null
  htmlBody: string | null
  fromAddress: string
  toAddress: string
  createdAt: string
}

interface EmailTabProps {
  thread: ThreadMessage[]
  currentMessageId: string
}

export function EmailTab({ thread, currentMessageId }: EmailTabProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set([currentMessageId]))
  const activeRef = useRef<HTMLDivElement>(null)

  // Scroll to active message on mount
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [currentMessageId])

  const toggleExpand = (id: string) => {
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

  // Collapse quoted text from email body
  const getCleanBody = (body: string | null): { main: string; quoted: string | null } => {
    if (!body) return { main: "(no content)", quoted: null }
    
    const lines = body.split("\n")
    const mainLines: string[] = []
    const quotedLines: string[] = []
    let inQuote = false

    for (const line of lines) {
      const trimmed = line.trim()
      
      // Detect start of quoted section
      if (!inQuote && (
        trimmed.startsWith(">") ||
        /^On .* wrote:$/i.test(trimmed) ||
        trimmed.includes("-----Original Message-----") ||
        trimmed.includes("________________________________")
      )) {
        inQuote = true
      }

      if (inQuote) {
        quotedLines.push(line)
      } else {
        mainLines.push(line)
      }
    }

    const main = mainLines.join("\n").trim() || "(no content)"
    const quoted = quotedLines.length > 0 ? quotedLines.join("\n").trim() : null

    return { main, quoted }
  }

  // Sort thread oldest first for natural reading order
  const sortedThread = [...thread].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Thread Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedThread.map((message) => {
          const isInbound = message.direction === "INBOUND"
          const isCurrentMessage = message.id === currentMessageId
          const isExpanded = expandedIds.has(message.id)
          const { main: cleanBody, quoted } = getCleanBody(message.body)

          return (
            <div
              key={message.id}
              ref={isCurrentMessage ? activeRef : undefined}
              className={`border rounded-lg overflow-hidden transition-shadow ${
                isCurrentMessage
                  ? "border-orange-300 ring-2 ring-orange-100"
                  : "border-gray-200"
              }`}
            >
              {/* Message Header - Always visible */}
              <button
                onClick={() => toggleExpand(message.id)}
                className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-colors ${
                  isInbound ? "bg-blue-50 hover:bg-blue-100" : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                {/* Expand/Collapse Icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </div>

                {/* Sender Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isInbound ? (
                      <Reply className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    ) : null}
                    <span className="font-medium text-gray-900 text-sm">
                      {isInbound ? message.fromAddress : `To: ${message.toAddress}`}
                    </span>
                    {isCurrentMessage && (
                      <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                        Current reply
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {format(new Date(message.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                  {!isExpanded && (
                    <p className="text-sm text-gray-600 mt-1 truncate">
                      {message.subject || "(no subject)"}
                    </p>
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-4 pb-4 bg-white border-t border-gray-100">
                  {/* Subject */}
                  <div className="py-3 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Subject
                    </span>
                    <p className="text-sm text-gray-900 mt-0.5 font-medium">
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
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                        {cleanBody}
                      </pre>
                    )}
                  </div>

                  {/* Collapsed quoted history */}
                  {quoted && (
                    <QuotedHistory content={quoted} />
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

// Collapsible quoted history component
function QuotedHistory({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {expanded ? "Hide quoted text" : "Show quoted text"}
      </button>
      {expanded && (
        <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap font-sans border-l-2 border-gray-200 pl-3">
          {content}
        </pre>
      )}
    </div>
  )
}
