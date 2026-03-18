"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Check, Mail, ClipboardCheck, Bot, Loader2, ChevronDown, ArrowLeftRight, BarChart3, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDistanceToNow } from "date-fns"

type IconType = "reply" | "form" | "reconciliation" | "report" | "analysis"

interface ReviewItem {
  id: string
  type: "agent_output" | "email_reply" | "form_submission" | "status_change"
  iconType: IconType
  isAgent: boolean
  title: string
  subtitle: string
  sourceUrl: string
  createdAt: string
  boardName?: string
  taskName?: string
  taskType?: string
  metadata: Record<string, any>
}

type TabType = "all" | IconType

const TAB_CONFIG: { key: TabType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "reply", label: "Replies" },
  { key: "form", label: "Forms" },
  { key: "reconciliation", label: "Recon" },
  { key: "report", label: "Reports" },
  { key: "analysis", label: "Analysis" },
]

export default function ReviewHubPage() {
  const router = useRouter()
  const [items, setItems] = useState<ReviewItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>("all")
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string>("")
  const [agentFilter, setAgentFilter] = useState<"" | "agent" | "manual">("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (activeTab !== "all") params.set("category", activeTab)
      if (selectedBoardId) params.set("boardId", selectedBoardId)
      if (agentFilter) params.set("source", agentFilter)

      const res = await fetch(`/api/review-hub?${params}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setCounts(data.counts || {})
      }
    } catch (error) {
      console.error("[ReviewHub] Fetch error:", error)
    } finally {
      setLoading(false)
    }
  }, [activeTab, selectedBoardId, agentFilter])

  // Fetch boards for filter dropdown
  useEffect(() => {
    const fetchBoards = async () => {
      try {
        const res = await fetch("/api/boards?limit=50")
        if (res.ok) {
          const data = await res.json()
          setBoards((data.boards || []).map((b: any) => ({ id: b.id, name: b.name })))
        }
      } catch {}
    }
    fetchBoards()
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const totalCount = Object.values(counts).reduce((sum, c) => sum + c, 0)

  const performAction = async (item: ReviewItem) => {
    setActionLoading(item.id)
    try {
      const res = await fetch("/api/review-hub/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: item.type, id: item.id, action: "mark_reviewed" }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setCounts(prev => {
          const next = { ...prev }
          if (next[item.iconType] != null) next[item.iconType] = Math.max(0, next[item.iconType] - 1)
          return next
        })
      }
    } catch (error) {
      console.error("[ReviewHub] Action error:", error)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100 pb-px">
        {TAB_CONFIG.map(tab => {
          const count = tab.key === "all" ? totalCount : (counts[tab.key] || 0)
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors
                ${isActive
                  ? "text-gray-900 border-b-2 border-gray-900 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
                }
              `}
            >
              {tab.label}
              {count > 0 && (
                <span className={`
                  text-[10px] font-medium px-1.5 py-0.5 rounded-full
                  ${isActive ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}
                `}>
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedBoardId}
              onChange={e => setSelectedBoardId(e.target.value)}
              className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <option value="">All Periods</option>
              {boards.map(board => (
                <option key={board.id} value={board.id}>{board.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value as "" | "agent" | "manual")}
              className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <option value="">All Sources</option>
              <option value="agent">Agent</option>
              <option value="manual">Manual</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
        {!loading && totalCount > 0 && (
          <span className="text-sm text-gray-500">
            {totalCount} item{totalCount !== 1 ? "s" : ""} pending
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-[35%]">Review Details</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-[12%]">Timestamp</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-[20%]">Task Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-[12%]">Task Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-[13%]">Board Month</th>
                <th className="px-4 py-2.5 w-[8%]" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <ReviewItemTableRow
                  key={item.id}
                  item={item}
                  isLast={idx === items.length - 1}
                  isLoading={actionLoading === item.id}
                  onNavigate={() => router.push(item.sourceUrl)}
                  onMarkReviewed={() => performAction(item)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Review Item Table Row ────────────────────────────────────────────────────

const ICON_STYLES: Record<IconType, string> = {
  reply: "bg-blue-50 text-blue-500 border-blue-200",
  form: "bg-green-50 text-green-500 border-green-200",
  reconciliation: "bg-orange-50 text-orange-500 border-orange-200",
  report: "bg-indigo-50 text-indigo-500 border-indigo-200",
  analysis: "bg-violet-50 text-violet-500 border-violet-200",
}

const ICON_MAP: Record<IconType, React.ReactNode> = {
  reply: <Mail className="w-3.5 h-3.5" />,
  form: <ClipboardCheck className="w-3.5 h-3.5" />,
  reconciliation: <ArrowLeftRight className="w-3.5 h-3.5" />,
  report: <BarChart3 className="w-3.5 h-3.5" />,
  analysis: <TrendingUp className="w-3.5 h-3.5" />,
}

const TASK_TYPE_LABELS: Record<string, string> = {
  request: "Request",
  form: "Form",
  reconciliation: "Reconciliation",
  report: "Report",
  analysis: "Analysis",
}

function getActionDescription(item: ReviewItem): { primary: string; secondary: string } {
  switch (item.type) {
    case "form_submission": {
      const parts = [item.metadata.formName, item.metadata.contactName].filter(Boolean)
      return {
        primary: "New form submission",
        secondary: parts.join(" · "),
      }
    }
    case "status_change": {
      const { oldStatus, newStatus, formName, contactName } = item.metadata
      const primary = oldStatus && newStatus
        ? `Status changed from "${oldStatus}" to "${newStatus}"`
        : newStatus
          ? `Status updated to "${newStatus}"`
          : "Form status updated"
      const secondary = [formName, contactName].filter(Boolean).join(" · ")
      return { primary, secondary }
    }
    case "email_reply":
      return {
        primary: "New email reply received",
        secondary: item.metadata.contactName || "",
      }
    case "agent_output": {
      const taskType = item.metadata.taskType || item.taskType || ""
      const n = item.metadata.stepCount ?? 0
      const primaryMap: Record<string, string> = {
        request: `${n} request${n !== 1 ? "s" : ""} sent`,
        form: `${n} form${n !== 1 ? "s" : ""} sent`,
        reconciliation: "Reconciliation run completed",
        report: "Report generated",
        analysis: "Analysis completed",
      }
      return {
        primary: primaryMap[taskType] || "Agent work completed",
        secondary: item.metadata.automationName || "",
      }
    }
    default:
      return { primary: item.title, secondary: "" }
  }
}

function ReviewItemTableRow({
  item,
  isLast,
  isLoading,
  onNavigate,
  onMarkReviewed,
}: {
  item: ReviewItem
  isLast: boolean
  isLoading: boolean
  onNavigate: () => void
  onMarkReviewed: () => void
}) {
  const { primary, secondary } = getActionDescription(item)

  return (
    <tr
      className={`hover:bg-gray-50/60 transition-colors cursor-pointer ${!isLast ? "border-b border-gray-100" : ""}`}
      onClick={onNavigate}
    >
      {/* Review Details */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`flex items-center justify-center w-6 h-6 rounded-md border flex-shrink-0 ${ICON_STYLES[item.iconType]}`}>
            {ICON_MAP[item.iconType]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-gray-900 truncate">{primary}</span>
              {item.isAgent && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-200 flex-shrink-0">
                  <Bot className="w-3 h-3" />
                  Agent
                </span>
              )}
            </div>
            {secondary && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{secondary}</p>
            )}
          </div>
        </div>
      </td>

      {/* Timestamp */}
      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
      </td>

      {/* Task Name */}
      <td className="px-4 py-3">
        {item.taskName ? (
          <span className="text-gray-700 truncate block max-w-[200px]">{item.taskName}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>

      {/* Task Type */}
      <td className="px-4 py-3">
        {item.taskType ? (
          <span className="text-gray-600">{TASK_TYPE_LABELS[item.taskType] ?? item.taskType}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>

      {/* Board Month */}
      <td className="px-4 py-3">
        {item.boardName ? (
          <span className="text-gray-600 truncate block max-w-[130px]">{item.boardName}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>

      {/* Action */}
      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400 ml-auto" />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onMarkReviewed}
          >
            <Check className="w-3 h-3 mr-1" />
            Reviewed
          </Button>
        )}
      </td>
    </tr>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: TabType }) {
  const messages: Record<TabType, { title: string; description: string }> = {
    all: {
      title: "All caught up",
      description: "No items need your review right now. Check back when agents complete work or new responses come in.",
    },
    reply: {
      title: "No replies to review",
      description: "When contacts reply to your requests, their responses will appear here.",
    },
    form: {
      title: "No forms to review",
      description: "When forms are sent or submitted, they will appear here.",
    },
    reconciliation: {
      title: "No reconciliations to review",
      description: "When reconciliations are completed, results will appear here.",
    },
    report: {
      title: "No reports to review",
      description: "When reports are generated, they will appear here for your review.",
    },
    analysis: {
      title: "No analyses to review",
      description: "When analyses are completed, results will appear here.",
    },
  }

  const msg = messages[tab]

  return (
    <div className="text-center py-20">
      <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Check className="w-5 h-5 text-gray-400" />
      </div>
      <h3 className="text-sm font-medium text-gray-900 mb-1">{msg.title}</h3>
      <p className="text-sm text-gray-500 max-w-sm mx-auto">{msg.description}</p>
    </div>
  )
}
