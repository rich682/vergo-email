"use client"

/**
 * Form Submissions Grouped by Status
 *
 * Displays all form submissions across the organization grouped into
 * collapsible status sections (Pending, Submitted, Expired), matching
 * the board configurable-table pattern.
 *
 * Within the Submitted group, submissions are further sub-grouped
 * by their custom tracking status.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Trash2,
  ClipboardList,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { format } from "date-fns"
import { usePermissions } from "@/components/permissions-context"

// --- Types ---

interface FormRequestRow {
  id: string
  status: string
  customStatus: string | null
  submittedAt: string | null
  createdAt: string
  taskInstanceId: string
  formDefinition: {
    id: string
    name: string
    settings: { customStatuses?: string[] } | string | null
  }
  recipientEntity: {
    id: string
    firstName: string
    lastName: string | null
    email: string | null
    companyName: string | null
  } | null
  recipientUser: {
    id: string
    name: string | null
    email: string
  } | null
  taskInstance: {
    id: string
    name: string
    ownerId: string
    boardId: string | null
    board: { id: string; name: string } | null
    owner: { id: string; name: string | null; email: string } | null
  } | null
}

interface StatusGroup {
  status: string
  label: string
  color: string
  bgColor: string
  borderColor: string
}

const SYSTEM_STATUS_GROUPS: StatusGroup[] = [
  { status: "PENDING", label: "Pending", color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-l-amber-400" },
  { status: "SUBMITTED", label: "Submitted", color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-l-green-500" },
  { status: "EXPIRED", label: "Expired", color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-l-red-400" },
]

// --- Helpers ---

function getRecipientName(row: FormRequestRow): string {
  if (row.recipientUser?.name) return row.recipientUser.name
  if (row.recipientEntity) {
    return `${row.recipientEntity.firstName}${row.recipientEntity.lastName ? ` ${row.recipientEntity.lastName}` : ""}`
  }
  return "Unknown"
}

function getRecipientEmail(row: FormRequestRow): string | null {
  return row.recipientUser?.email || row.recipientEntity?.email || null
}

function parseSettings(settings: unknown): { customStatuses?: string[] } {
  if (!settings) return {}
  if (typeof settings === "string") {
    try { return JSON.parse(settings) } catch { return {} }
  }
  return settings as { customStatuses?: string[] }
}

function getDisplayStatus(row: FormRequestRow): string {
  if (row.customStatus) return row.customStatus
  if (row.status === "SUBMITTED") return "Submitted"
  if (row.status === "PENDING") return "Pending"
  return row.status
}

// --- Component ---

interface FormSubmissionsGroupedProps {
  showMine: boolean
}

export function FormSubmissionsGrouped({ showMine }: FormSubmissionsGroupedProps) {
  const router = useRouter()
  const { can, isAdmin } = usePermissions()
  const canEditStatus = can("forms:manage")

  const [loading, setLoading] = useState(true)
  const [formRequests, setFormRequests] = useState<FormRequestRow[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const fetchFormRequests = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (showMine) params.set("myItems", "true")
      const res = await fetch(`/api/form-requests/list?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setFormRequests(data.formRequests || [])
      }
    } catch (err) {
      console.error("Failed to load form submissions:", err)
    } finally {
      setLoading(false)
    }
  }, [showMine])

  useEffect(() => {
    fetchFormRequests()
  }, [fetchFormRequests])

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Group by system status
  const bySystemStatus = useMemo(() => {
    return SYSTEM_STATUS_GROUPS.reduce((acc, group) => {
      acc[group.status] = formRequests.filter(r => r.status === group.status)
      return acc
    }, {} as Record<string, FormRequestRow[]>)
  }, [formRequests])

  // For submitted items, collect all unique custom statuses across all form definitions
  const submittedSubGroups = useMemo(() => {
    const submitted = bySystemStatus["SUBMITTED"] || []
    if (submitted.length === 0) return []

    // Collect all custom statuses from form definition settings
    const allCustomStatuses = new Set<string>()
    for (const row of submitted) {
      const settings = parseSettings(row.formDefinition.settings)
      const statuses = settings.customStatuses || ["Submitted"]
      statuses.forEach(s => allCustomStatuses.add(s))
    }

    // Group submitted rows by their display status
    const groups: { label: string; rows: FormRequestRow[] }[] = []
    for (const status of allCustomStatuses) {
      const rows = submitted.filter(r => getDisplayStatus(r) === status)
      if (rows.length > 0) {
        groups.push({ label: status, rows })
      }
    }

    // Add any rows with a custom status not in the known set
    const accounted = new Set(groups.flatMap(g => g.rows.map(r => r.id)))
    const uncategorized = submitted.filter(r => !accounted.has(r.id))
    if (uncategorized.length > 0) {
      groups.push({ label: "Other", rows: uncategorized })
    }

    return groups
  }, [bySystemStatus])

  // Get all custom statuses for a given form request (for the dropdown)
  const getCustomStatuses = (row: FormRequestRow): string[] => {
    const settings = parseSettings(row.formDefinition.settings)
    return settings.customStatuses || ["In Progress", "Submitted"]
  }

  const handleCustomStatusChange = async (formRequestId: string, customStatus: string) => {
    try {
      const res = await fetch(`/api/form-requests/${formRequestId}/custom-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customStatus }),
      })
      if (res.ok) {
        await fetchFormRequests()
      } else {
        const data = await res.json()
        console.error("Failed to update custom status:", data.error)
      }
    } catch (err) {
      console.error("Error updating custom status:", err)
    }
  }

  const handleDelete = async (formRequestId: string) => {
    try {
      const res = await fetch(`/api/form-requests/${formRequestId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (res.ok) {
        await fetchFormRequests()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to delete submission")
      }
    } catch (err) {
      console.error("Error deleting form request:", err)
      alert("Failed to delete submission")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (formRequests.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
        <ClipboardList className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">No form submissions yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Send form requests from task pages to start collecting data
        </p>
      </div>
    )
  }

  const renderRow = (row: FormRequestRow, showStatusDropdown: boolean) => {
    const name = getRecipientName(row)
    const email = getRecipientEmail(row)

    return (
      <tr
        key={row.id}
        className="hover:bg-gray-50 cursor-pointer group"
        onClick={() => router.push(`/dashboard/jobs/${row.taskInstanceId}`)}
      >
        <td className="px-4 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
            {email && <p className="text-xs text-gray-500 truncate">{email}</p>}
          </div>
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-700 truncate max-w-[200px]" title={row.formDefinition.name}>
          {row.formDefinition.name}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-700 truncate max-w-[200px]" title={row.taskInstance?.name || ""}>
          {row.taskInstance?.name || "—"}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600">
          {row.taskInstance?.owner?.name || "—"}
        </td>
        {showStatusDropdown ? (
          <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
            {canEditStatus ? (
              <Select
                value={getDisplayStatus(row)}
                onValueChange={(value) => handleCustomStatusChange(row.id, value)}
              >
                <SelectTrigger className="h-7 text-xs w-[140px] border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getCustomStatuses(row).map(s => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-gray-500">{getDisplayStatus(row)}</span>
            )}
          </td>
        ) : (
          <td className="px-4 py-2.5 text-sm text-gray-500">—</td>
        )}
        <td className="px-4 py-2.5 text-sm text-gray-500">
          {row.submittedAt ? format(new Date(row.submittedAt), "MMM d, yyyy") : "—"}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600">
          {row.taskInstance?.board?.name || "—"}
        </td>
        {isAdmin && (
          <td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(`Delete submission from ${name}? This cannot be undone.`)) {
                  handleDelete(row.id)
                }
              }}
              className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete submission"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </td>
        )}
      </tr>
    )
  }

  const renderTableHeader = (showTracking: boolean) => (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase" style={{ width: 180 }}>Recipient</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase" style={{ width: 160 }}>Form</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase" style={{ width: 180 }}>Project</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase" style={{ width: 120 }}>PM</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase" style={{ width: 150 }}>
          {showTracking ? "Tracking" : "Status"}
        </th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase" style={{ width: 110 }}>Submitted</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase" style={{ width: 120 }}>Board</th>
        {isAdmin && <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase" style={{ width: 50 }}></th>}
      </tr>
    </thead>
  )

  return (
    <div className="space-y-4">
      {SYSTEM_STATUS_GROUPS.map(group => {
        const groupRows = bySystemStatus[group.status] || []
        if (groupRows.length === 0) return null

        const isExpanded = expandedGroups.has(group.status)
        const isSubmitted = group.status === "SUBMITTED"

        return (
          <div key={group.status} className={`rounded-lg overflow-hidden border-l-4 ${group.borderColor}`}>
            {/* System status header */}
            <button
              onClick={() => toggleGroup(group.status)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 ${group.bgColor} hover:opacity-90 transition-opacity`}
            >
              {isExpanded ? (
                <ChevronDown className={`w-4 h-4 ${group.color}`} />
              ) : (
                <ChevronRight className={`w-4 h-4 ${group.color}`} />
              )}
              <span className={`font-medium ${group.color}`}>{group.label}</span>
              <span className="text-sm text-gray-500">({groupRows.length})</span>
            </button>

            {isExpanded && (
              <div className="border border-t-0 border-gray-200 bg-white">
                {isSubmitted && submittedSubGroups.length > 1 ? (
                  // Sub-groups by custom tracking status
                  <div className="space-y-0 divide-y divide-gray-100">
                    {submittedSubGroups.map(sub => {
                      const subKey = `SUBMITTED::${sub.label}`
                      const isSubExpanded = expandedGroups.has(subKey)

                      return (
                        <div key={sub.label}>
                          <button
                            onClick={() => toggleGroup(subKey)}
                            className="w-full flex items-center gap-2 px-6 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                          >
                            {isSubExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                            )}
                            <span className="text-sm font-medium text-gray-700">{sub.label}</span>
                            <span className="text-xs text-gray-400">({sub.rows.length})</span>
                          </button>
                          {isSubExpanded && (
                            <table className="w-full">
                              {renderTableHeader(true)}
                              <tbody className="divide-y divide-gray-100">
                                {sub.rows.map(row => renderRow(row, true))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  // Single table (no sub-groups needed for Pending/Expired, or single custom status)
                  <table className="w-full">
                    {renderTableHeader(isSubmitted)}
                    <tbody className="divide-y divide-gray-100">
                      {groupRows.map(row => renderRow(row, isSubmitted))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
