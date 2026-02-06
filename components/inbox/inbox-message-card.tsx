"use client"

import { useRouter } from "next/navigation"
import { CompletionRing } from "@/components/ui/completion-ring"
import {
  getSuggestedAction,
  getClassificationLabel,
  getRiskBgColor,
} from "@/lib/utils/ai-suggested-action"
import {
  CheckCircle2,
  Send,
  Eye,
  Paperclip,
  Sparkles,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"

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
  // Remove everything after common signature/quote markers
  const cutMarkers = [
    /\n--\s*\n.*/s,                          // "-- " signature separator
    /On .{10,80} wrote:.*/s,                  // "On ... wrote:" quoted reply
    /_{3,}.*/s,                               // ___ divider lines
    /\*{3,}.*/s,                              // *** divider lines
    /From:\s.*/s,                             // "From: ..." forwarded header
    /Sent from my .*/s,                       // "Sent from my iPhone" etc
    /Get Outlook for .*/s,                    // Outlook signature
  ]
  for (const marker of cutMarkers) {
    text = text.replace(marker, "")
  }
  // Collapse whitespace and "> " quote prefixes
  text = text
    .replace(/^>+\s?/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
  return text.slice(0, 200)
}

export function InboxMessageCard({
  item,
  onAcceptSuggestion,
  isAccepting,
}: InboxMessageCardProps) {
  const router = useRouter()

  const suggestedAction = getSuggestedAction({
    completionPercentage: item.completionPercentage,
    riskLevel: item.riskLevel,
    riskReason: item.riskReason,
    status: item.requestStatus,
    hasAttachments: item.attachmentCount > 0,
    readStatus: item.readStatus,
  })

  const isUnread = !item.readStatus || item.readStatus === "unread"
  const classificationLabel = getClassificationLabel(item.classification)
  const timeAgo = formatDistanceToNow(new Date(item.receivedAt), { addSuffix: true })
  const cleanedSnippet = item.snippet ? cleanSnippet(item.snippet) : ""

  // Avatar initials
  const initials = item.sender.name
    ? item.sender.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : item.sender.email[0].toUpperCase()

  const handleCardClick = () => {
    // Navigate to review page for this message
    router.push(`/dashboard/review/${item.messageId}`)
  }

  return (
    <div
      onClick={handleCardClick}
      className={`border rounded-lg p-4 transition-all hover:shadow-md cursor-pointer ${
        isUnread ? "bg-white border-gray-200" : "bg-gray-50/50 border-gray-100"
      }`}
    >
      <div className="flex gap-3">
        {/* Left: Avatar */}
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
            {initials}
          </div>
        </div>

        {/* Center: Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm ${
                    isUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"
                  }`}
                >
                  {item.sender.name}
                </span>
                {item.sender.company && (
                  <span className="text-xs text-gray-400">
                    {item.sender.company}
                  </span>
                )}
                {isUnread && (
                  <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                )}
              </div>
              <p className="text-xs text-gray-500 truncate">{item.sender.email}</p>
            </div>

            {/* Right: Metadata */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <CompletionRing
                percentage={item.completionPercentage}
                size={32}
                strokeWidth={2.5}
              />

              {/* Risk dot */}
              {item.riskLevel && item.riskLevel !== "unknown" && (
                <div className="relative group">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${getRiskBgColor(item.riskLevel)}`}
                  />
                  {item.riskReason && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 text-white text-xs rounded p-2 hidden group-hover:block z-10 shadow-lg">
                      {item.riskReason}
                    </div>
                  )}
                </div>
              )}

              {/* Classification badge */}
              {classificationLabel && (
                <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  {classificationLabel}
                </span>
              )}

              {/* Attachment icon */}
              {item.attachmentCount > 0 && (
                <div className="flex items-center gap-0.5 text-gray-400">
                  <Paperclip className="w-3 h-3" />
                  <span className="text-[10px]">{item.attachmentCount}</span>
                </div>
              )}

              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                {timeAgo}
              </span>
            </div>
          </div>

          {/* AI Summary */}
          {item.aiSummary && (
            <p className="text-sm text-gray-700 mt-1.5 line-clamp-2">
              {item.aiSummary}
            </p>
          )}

          {/* Reply snippet (cleaned) */}
          {cleanedSnippet && !item.aiSummary && (
            <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">
              {cleanedSnippet}
            </p>
          )}

          {/* Task + Board link */}
          {item.task && (
            <div className="flex items-center gap-1.5 mt-2">
              <Link
                href={`/dashboard/jobs/${item.task.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-blue-600 hover:underline truncate"
              >
                {item.task.name}
              </Link>
              {item.task.boardName && (
                <span className="text-xs text-gray-400">
                  in {item.task.boardName}
                </span>
              )}
            </div>
          )}

          {/* AI Suggested Action Strip */}
          {suggestedAction.type !== "no_action" && (
            <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-100">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-gray-500 flex-1">
                {suggestedAction.description || suggestedAction.label}
                {suggestedAction.confidence >= 80 && (
                  <span className="text-gray-400 ml-1">
                    ({suggestedAction.confidence}% confident)
                  </span>
                )}
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onAcceptSuggestion(item.requestId, suggestedAction.type)
                }}
                disabled={isAccepting}
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors ${
                  suggestedAction.type === "mark_complete"
                    ? "bg-green-50 text-green-700 hover:bg-green-100"
                    : suggestedAction.type === "send_followup"
                    ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                {suggestedAction.type === "mark_complete" && (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                {suggestedAction.type === "send_followup" && (
                  <Send className="w-3 h-3" />
                )}
                {(suggestedAction.type === "review_attachment" ||
                  suggestedAction.type === "review_reply") && (
                  <Eye className="w-3 h-3" />
                )}
                {suggestedAction.label}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
