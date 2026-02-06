"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

interface ErrorItem {
  id: string
  organizationId: string | null
  userId: string | null
  errorMessage: string
  errorStack: string | null
  componentName: string | null
  pageUrl: string | null
  userAgent: string | null
  severity: string
  resolved: boolean
  createdAt: string
}

interface ErrorTableProps {
  errors: ErrorItem[]
  organizations: Array<{ id: string; name: string }>
  totalPages: number
  currentPage: number
  currentFilters: {
    severity: string
    org: string
    status: string
  }
}

export function ErrorTable({ errors, organizations, totalPages, currentPage, currentFilters }: ErrorTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const orgMap = new Map(organizations.map((o) => [o.id, o.name]))

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    params.delete("page") // Reset to page 1 on filter change
    router.push(`/errors?${params.toString()}`)
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", String(page))
    router.push(`/errors?${params.toString()}`)
  }

  async function toggleResolved(id: string, resolved: boolean) {
    setTogglingId(id)
    try {
      await fetch(`/api/errors/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !resolved }),
      })
      router.refresh()
    } catch (err) {
      console.error("Failed to toggle:", err)
    }
    setTogglingId(null)
  }

  function timeAgo(dateStr: string): string {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Filters */}
      <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap gap-3 items-center">
        <label className="text-xs text-gray-500">Severity:</label>
        <select
          value={currentFilters.severity}
          onChange={(e) => updateFilter("severity", e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:ring-orange-500 focus:border-orange-500"
        >
          <option value="all">All</option>
          <option value="fatal">Fatal</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>

        <label className="text-xs text-gray-500 ml-4">Company:</label>
        <select
          value={currentFilters.org}
          onChange={(e) => updateFilter("org", e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:ring-orange-500 focus:border-orange-500"
        >
          <option value="all">All</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>

        <label className="text-xs text-gray-500 ml-4">Status:</label>
        <select
          value={currentFilters.status}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:ring-orange-500 focus:border-orange-500"
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Table */}
      <table className="w-full">
        <thead>
          <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
            <th className="text-left px-5 py-3 w-8"></th>
            <th className="text-left px-5 py-3">Error</th>
            <th className="text-left px-5 py-3">Company</th>
            <th className="text-left px-5 py-3">Severity</th>
            <th className="text-left px-5 py-3">Component</th>
            <th className="text-left px-5 py-3">When</th>
            <th className="text-left px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {errors.map((err) => (
            <>
              <tr
                key={err.id}
                className="hover:bg-gray-800/50 transition-colors cursor-pointer"
                onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
              >
                <td className="px-5 py-3 text-gray-500">
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${expandedId === err.id ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </td>
                <td className="px-5 py-3 text-sm text-gray-300 max-w-[400px] truncate">{err.errorMessage}</td>
                <td className="px-5 py-3 text-sm text-gray-400">
                  {err.organizationId ? orgMap.get(err.organizationId) || "Unknown" : "-"}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      err.severity === "fatal"
                        ? "bg-red-900/30 text-red-400"
                        : err.severity === "warning"
                        ? "bg-yellow-900/30 text-yellow-400"
                        : "bg-red-900/20 text-red-300"
                    }`}
                  >
                    {err.severity}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-gray-500">{err.componentName || "-"}</td>
                <td className="px-5 py-3 text-sm text-gray-400">{timeAgo(err.createdAt)}</td>
                <td className="px-5 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleResolved(err.id, err.resolved)
                    }}
                    disabled={togglingId === err.id}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      err.resolved
                        ? "bg-green-900/20 text-green-400 hover:bg-green-900/40"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                    } disabled:opacity-50`}
                  >
                    {err.resolved ? "Resolved" : "Resolve"}
                  </button>
                </td>
              </tr>
              {expandedId === err.id && (
                <tr key={`${err.id}-detail`} className="bg-gray-800/30">
                  <td colSpan={7} className="px-5 py-4">
                    <div className="space-y-3">
                      <div>
                        <span className="text-xs text-gray-500 font-medium">Error Message:</span>
                        <p className="text-sm text-gray-200 mt-0.5">{err.errorMessage}</p>
                      </div>
                      {err.pageUrl && (
                        <div>
                          <span className="text-xs text-gray-500 font-medium">Page:</span>
                          <p className="text-sm text-gray-400 mt-0.5">{err.pageUrl}</p>
                        </div>
                      )}
                      {err.errorStack && (
                        <div>
                          <span className="text-xs text-gray-500 font-medium">Stack Trace:</span>
                          <pre className="text-xs text-gray-400 mt-1 p-3 bg-gray-900 rounded-lg overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                            {err.errorStack}
                          </pre>
                        </div>
                      )}
                      {err.userAgent && (
                        <div>
                          <span className="text-xs text-gray-500 font-medium">User Agent:</span>
                          <p className="text-xs text-gray-500 mt-0.5 break-all">{err.userAgent}</p>
                        </div>
                      )}
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>ID: {err.id}</span>
                        {err.userId && <span>User: {err.userId}</span>}
                        <span>
                          {new Date(err.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
          {errors.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-500">
                No errors found matching the current filters
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              className="px-3 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className="px-3 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
