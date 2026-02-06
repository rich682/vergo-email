"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { InboxMessageCard, type InboxItem } from "@/components/inbox/inbox-message-card"
import {
  Inbox,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react"

interface InboxData {
  items: InboxItem[]
  total: number
  page: number
  totalPages: number
}

interface InboxCounts {
  unread: number
  needsAttention: number
}

export default function InboxPage() {
  const router = useRouter()
  const [data, setData] = useState<InboxData | null>(null)
  const [counts, setCounts] = useState<InboxCounts>({ unread: 0, needsAttention: 0 })
  const [loading, setLoading] = useState(true)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  // Filters
  const [readStatusFilter, setReadStatusFilter] = useState<string>("all")
  const [riskFilter, setRiskFilter] = useState<string>("")

  const fetchInbox = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set("page", page.toString())
      params.set("limit", "50")
      if (readStatusFilter !== "all") params.set("readStatus", readStatusFilter)
      if (riskFilter) params.set("riskLevel", riskFilter)

      const res = await fetch(`/api/inbox?${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error("Failed to fetch inbox:", err)
    } finally {
      setLoading(false)
    }
  }, [page, readStatusFilter, riskFilter])

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/count")
      if (res.ok) {
        const json = await res.json()
        setCounts(json)
      }
    } catch (err) {
      console.error("Failed to fetch inbox counts:", err)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchInbox()
  }, [fetchInbox])

  useEffect(() => {
    fetchCounts()
  }, [fetchCounts])

  const handleAcceptSuggestion = async (requestId: string, actionType: string) => {
    setAcceptingId(requestId)
    try {
      const res = await fetch(`/api/requests/${requestId}/accept-suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType }),
      })
      if (res.ok) {
        // Refresh data
        await fetchInbox()
        await fetchCounts()
      }
    } catch (err) {
      console.error("Failed to accept suggestion:", err)
    } finally {
      setAcceptingId(null)
    }
  }

  const handleBulkAccept = async () => {
    if (!data) return
    // Find all items where completion >= 90% and not already complete
    const eligible = data.items.filter(
      (item) =>
        item.completionPercentage >= 90 &&
        item.requestStatus !== "COMPLETE" &&
        item.requestStatus !== "FULFILLED"
    )
    if (eligible.length === 0) return

    setAcceptingId("bulk")
    try {
      await Promise.all(
        eligible.map((item) =>
          fetch(`/api/requests/${item.requestId}/accept-suggestion`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actionType: "mark_complete" }),
          })
        )
      )
      await fetchInbox()
      await fetchCounts()
    } catch (err) {
      console.error("Bulk accept failed:", err)
    } finally {
      setAcceptingId(null)
    }
  }

  // Count eligible for bulk accept
  const bulkEligibleCount = data
    ? data.items.filter(
        (item) =>
          item.completionPercentage >= 90 &&
          item.requestStatus !== "COMPLETE" &&
          item.requestStatus !== "FULFILLED"
      ).length
    : 0

  return (
    <div className="max-w-4xl mx-auto">
      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
            <Inbox className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-gray-900">{counts.unread}</p>
            <p className="text-xs text-gray-500">Unread replies</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-gray-900">
              {counts.needsAttention}
            </p>
            <p className="text-xs text-gray-500">Needs attention</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-gray-900">
              {bulkEligibleCount}
            </p>
            <p className="text-xs text-gray-500">AI suggestions</p>
          </div>
        </div>
      </div>

      {/* Filters + Bulk Action */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={readStatusFilter}
            onChange={(e) => {
              setReadStatusFilter(e.target.value)
              setPage(1)
            }}
            className="text-sm border rounded-md px-2 py-1 text-gray-600 bg-white"
          >
            <option value="all">All replies</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
          <select
            value={riskFilter}
            onChange={(e) => {
              setRiskFilter(e.target.value)
              setPage(1)
            }}
            className="text-sm border rounded-md px-2 py-1 text-gray-600 bg-white"
          >
            <option value="">All risk levels</option>
            <option value="high">High risk</option>
            <option value="medium">Medium risk</option>
            <option value="low">Low risk</option>
          </select>
        </div>

        {bulkEligibleCount > 0 && (
          <button
            onClick={handleBulkAccept}
            disabled={acceptingId === "bulk"}
            className="flex items-center gap-1.5 text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-md transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            Accept all AI suggestions ({bulkEligibleCount})
          </button>
        )}
      </div>

      {/* Message List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="text-center py-20 border rounded-lg bg-gray-50">
          <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-700 mb-1">
            No replies yet
          </h3>
          <p className="text-sm text-gray-500">
            When recipients reply to your requests, they will appear here with
            AI analysis.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => (
            <InboxMessageCard
              key={item.messageId}
              item={item}
              onAcceptSuggestion={handleAcceptSuggestion}
              isAccepting={acceptingId === item.requestId || acceptingId === "bulk"}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
