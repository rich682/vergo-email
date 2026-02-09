"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { format, isToday, isYesterday } from "date-fns"
import { Paperclip } from "lucide-react"

export interface InboxItem {
  messageId: string
  subject: string | null
  fromAddress: string
  receivedAt: string
  snippet: string
  classification: string | null
  classificationReasoning: string | null
  attachmentCount: number
  requestId: string
  campaignName: string | null
  requestType: string | null
  requestStatus: string
  completionPercentage: number
  aiSummary: string | null
  aiSummaryConfidence: string | null
  riskLevel: string | null
  riskReason: string | null
  readStatus: string | null
  completionAnalysis: string
  sender: {
    id?: string
    name: string
    email: string
    company?: string | null
  }
  task: {
    id: string
    name: string
    boardName?: string | null
  } | null
}

interface InboxMessageCardProps {
  item: InboxItem
  onAcceptSuggestion: (requestId: string, actionType: string) => void
  isAccepting?: boolean
}

/**
 * Strip email signatures, quoted replies, and excessive whitespace from a snippet.
 */
function cleanSnippet(raw: string): string {
  let text = raw
  const cutMarkers = [
    /\n--\s*\n.*/s,
    /On .{10,80} wrote:.*/s,
    /_{3,}.*/s,
    /\*{3,}.*/s,
    /From:\s.*/s,
    /Sent from my .*/s,
    /Get Outlook for .*/s,
    /\*[A-Z][a-z]+ [A-Z].*\|.*\|.*/s,
    /\(\s*https?:\/\/\S+\s*\).*/s,
    /CEO\s*&.*$/s,
  ]
  for (const marker of cutMarkers) {
    text = text.replace(marker, "")
  }
  text = text
    .replace(/^>+\s?/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
  if (text.length < 5) return ""
  return text.slice(0, 200)
}

/** Format date compactly: "10:32 AM" for today, "Yesterday" for yesterday, "Feb 6" otherwise */
function compactDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isToday(d)) return format(d, "h:mm a")
  if (isYesterday(d)) return "Yesterday"
  return format(d, "MMM d")
}

export const InboxMessageCard = React.memo(function InboxMessageCard({
  item,
}: InboxMessageCardProps) {
  const router = useRouter()

  const isUnread = !item.readStatus || item.readStatus === "unread"
  const preview = item.aiSummary || (item.snippet ? cleanSnippet(item.snippet) : "")
  const dateLabel = compactDate(item.receivedAt)

  const handleRowClick = () => {
    router.push(`/dashboard/review/${item.messageId}`)
  }

  return (
    <div
      onClick={handleRowClick}
      className={`flex items-center gap-0 px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-50 ${
        isUnread ? "bg-white" : "bg-gray-50/30"
      }`}
    >
      {/* Unread dot */}
      <div className="w-6 flex-shrink-0 flex items-center justify-center">
        {isUnread && (
          <span className="w-2 h-2 rounded-full bg-blue-500" />
        )}
      </div>

      {/* Sender name */}
      <div className="w-[160px] flex-shrink-0 pr-3 truncate">
        <span
          className={`text-sm ${
            isUnread ? "font-semibold text-gray-900" : "text-gray-600"
          }`}
        >
          {item.sender.name}
        </span>
      </div>

      {/* Board name */}
      <div className="w-[140px] flex-shrink-0 pr-3 truncate">
        <span className="text-sm text-gray-500">
          {item.task?.boardName || "\u2014"}
        </span>
      </div>

      {/* Task name */}
      <div className="w-[160px] flex-shrink-0 pr-3 truncate">
        <span className={`text-sm ${isUnread ? "font-medium text-gray-700" : "text-gray-500"}`}>
          {item.task?.name || "\u2014"}
        </span>
      </div>

      {/* Preview / snippet -- fills remaining space */}
      <div className="flex-1 min-w-0 pr-3 flex items-center gap-2">
        <span className="text-sm text-gray-400 truncate">
          {preview || "\u00A0"}
        </span>
        {item.attachmentCount > 0 && (
          <Paperclip className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
        )}
      </div>

      {/* Timestamp */}
      <div className="w-[72px] flex-shrink-0 text-right">
        <span className={`text-xs ${isUnread ? "font-medium text-gray-700" : "text-gray-400"}`}>
          {dateLabel}
        </span>
      </div>
    </div>
  )
})
