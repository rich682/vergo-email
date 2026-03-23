"use client"

/**
 * Form Submissions Table
 *
 * Spreadsheet-style view of form submissions grouped by status
 * (Pending → Submitted → Expired) with collapsible sections,
 * bulk selection, and multi-delete support.
 */

import { useState, useMemo } from "react"
import {
  Bell,
  Loader2,
  Paperclip,
  Download,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
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
import * as XLSX from "xlsx"
import { formatResponseValue } from "@/lib/utils/form-formatting"
import type { FormField } from "@/lib/types/form"

interface FormAttachment {
  id: string
  filename: string
  url: string
  fieldKey: string
}

interface FormRequestItem {
  id: string
  status: string
  customStatus: string | null
  submittedAt: string | null
  responseData: Record<string, unknown> | null
  remindersSent: number
  remindersMaxCount: number
  recipientUser: {
    id: string
    name: string | null
    email: string
  } | null
  recipientEntity: {
    id: string
    firstName: string
    lastName: string | null
    email: string | null
  } | null
  attachments?: FormAttachment[]
}

interface StatusGroup {
  status: string
  label: string
  color: string
  bgColor: string
  borderColor: string
}

const STATUS_GROUPS: StatusGroup[] = [
  { status: "PENDING", label: "Pending", color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-l-amber-400" },
  { status: "SUBMITTED", label: "Submitted", color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-l-green-500" },
  { status: "EXPIRED", label: "Expired", color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-l-red-400" },
]

interface FormSubmissionsTableProps {
  formName: string
  fields: FormField[]
  formRequests: FormRequestItem[]
  customStatuses: string[]
  canSendForms: boolean
  canEditStatus?: boolean
  canDelete?: boolean
  onSendReminder: (requestId: string) => void
  onCustomStatusChange?: (requestId: string, status: string) => void
  onDelete?: (requestId: string) => void
  onBulkDelete?: (requestIds: string[]) => void
  sendingReminder: string | null
  userMap?: Record<string, string>
  userEmailMap?: Record<string, string>
}

function getRecipientName(req: FormRequestItem, fields?: FormField[], userMap?: Record<string, string>): string {
  if (req.recipientUser?.name) return req.recipientUser.name
  if (req.recipientEntity) {
    return `${req.recipientEntity.firstName}${req.recipientEntity.lastName ? ` ${req.recipientEntity.lastName}` : ""}`
  }
  // Universal link submissions: try to extract submitter name from responseData
  if (!req.recipientUser && !req.recipientEntity && req.responseData && fields) {
    for (const field of fields) {
      if (field.type === "users" && req.responseData[field.key]) {
        const userId = req.responseData[field.key]
        if (typeof userId === "string" && userMap?.[userId]) {
          return userMap[userId]
        }
      }
    }
    for (const field of fields) {
      if (field.type === "text" || (field.type as string) === "short_text") {
        const key = field.key.toLowerCase()
        if (key.includes("name") || key.includes("submitter") || key.includes("subcontractor")) {
          const val = req.responseData[field.key]
          if (typeof val === "string" && val.trim()) return val.trim()
        }
      }
    }
    return "Via Link"
  }
  if (!req.recipientUser && !req.recipientEntity) return "Via Link"
  return "Unknown"
}

function getRecipientEmail(req: FormRequestItem, fields?: FormField[], userEmailMap?: Record<string, string>): string | null {
  if (req.recipientUser?.email) return req.recipientUser.email
  if (req.recipientEntity?.email) return req.recipientEntity.email
  // Universal link submissions: resolve email from "users" field in responseData
  if (!req.recipientUser && !req.recipientEntity && req.responseData && fields && userEmailMap) {
    for (const field of fields) {
      if (field.type === "users" && req.responseData[field.key]) {
        const userId = req.responseData[field.key]
        if (typeof userId === "string" && userEmailMap[userId]) {
          return userEmailMap[userId]
        }
      }
    }
  }
  return null
}

export function FormSubmissionsTable({
  formName,
  fields,
  formRequests,
  customStatuses,
  canSendForms,
  canEditStatus = true,
  canDelete = false,
  onSendReminder,
  onCustomStatusChange,
  onDelete,
  onBulkDelete,
  sendingReminder,
  userMap,
  userEmailMap,
}: FormSubmissionsTableProps) {
  const sortedFields = [...fields].sort((a, b) => (a.order || 0) - (b.order || 0))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(STATUS_GROUPS.map(g => g.status))
  )

  const submitted = formRequests.filter(r => r.status === "SUBMITTED").length
  const total = formRequests.length

  const getDisplayStatus = (req: FormRequestItem): string => {
    if (req.customStatus) return req.customStatus
    if (req.status === "SUBMITTED") return "Submitted"
    if (req.status === "PENDING") return "In Progress"
    return req.status
  }

  // Group by system status
  const byStatus = useMemo(() => {
    return STATUS_GROUPS.reduce((acc, group) => {
      acc[group.status] = formRequests.filter(r => r.status === group.status)
      return acc
    }, {} as Record<string, FormRequestItem[]>)
  }, [formRequests])

  // Sub-group submitted items by custom status (in form builder order)
  const submittedSubGroups = useMemo(() => {
    const submittedRows = byStatus["SUBMITTED"] || []
    if (submittedRows.length === 0 || customStatuses.length === 0) return []

    const groups: { label: string; rows: FormRequestItem[] }[] = []
    for (const status of customStatuses) {
      const rows = submittedRows.filter(r => getDisplayStatus(r) === status)
      groups.push({ label: status, rows })
    }
    // Catch any with a status not in the known list
    const knownSet = new Set(customStatuses)
    const uncategorized = submittedRows.filter(r => !knownSet.has(getDisplayStatus(r)))
    if (uncategorized.length > 0) {
      groups.push({ label: "Other", rows: uncategorized })
    }
    return groups
  }, [byStatus, customStatuses])

  const toggleGroup = (status: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroupSelection = (rows: FormRequestItem[]) => {
    const groupIds = rows.map(r => r.id)
    const allSelected = groupIds.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        groupIds.forEach(id => next.delete(id))
      } else {
        groupIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const handleBulkDelete = () => {
    const count = selectedIds.size
    if (confirm(`Delete ${count} submission${count !== 1 ? "s" : ""}? This cannot be undone.`)) {
      onBulkDelete?.([...selectedIds])
      setSelectedIds(new Set())
    }
  }

  const handleExportExcel = () => {
    const allRequests = STATUS_GROUPS.flatMap(g => byStatus[g.status] || [])
    const headers = ["Recipient", "Email", "Status", ...sortedFields.map(f => f.label), "Submitted"]
    const data: (string | number | boolean | null)[][] = [headers]

    for (const req of allRequests) {
      const row = [
        getRecipientName(req, sortedFields, userMap),
        getRecipientEmail(req, sortedFields, userEmailMap) || "",
        getDisplayStatus(req),
        ...sortedFields.map(f =>
          req.status === "SUBMITTED" && req.responseData
            ? formatResponseValue(req.responseData[f.key], f.type, userMap)
            : ""
        ),
        req.submittedAt ? format(new Date(req.submittedAt), "MMM d, yyyy") : "",
      ]
      data.push(row)
    }

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws["!cols"] = headers.map((header, i) => {
      let maxLen = header.length
      for (const row of data.slice(1)) {
        const val = row[i]
        if (val != null) maxLen = Math.max(maxLen, String(val).length)
      }
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) }
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Submissions")

    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" })
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const safeName = formName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)
    link.href = url
    link.download = `${safeName}_submissions.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  const hasActions = canSendForms || canDelete

  const renderRow = (req: FormRequestItem) => {
    const name = getRecipientName(req, sortedFields, userMap)
    const email = getRecipientEmail(req, sortedFields, userEmailMap)
    const isSubmitted = req.status === "SUBMITTED"

    return (
      <tr key={req.id} className={`hover:bg-gray-50 group ${selectedIds.has(req.id) ? "bg-orange-50" : ""}`}>
        {/* Checkbox */}
        {canDelete && (
          <td className="w-10 px-3 py-2.5 text-center sticky left-0 z-10 bg-white">
            <input
              type="checkbox"
              checked={selectedIds.has(req.id)}
              onChange={() => toggleSelect(req.id)}
              className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
            />
          </td>
        )}
        {/* Recipient */}
        <td className={`px-4 py-2.5 ${canDelete ? "" : "sticky left-0 z-10"} bg-white whitespace-nowrap`}>
          <p className="text-sm font-medium text-gray-900 truncate" title={name}>{name}</p>
          {email && <p className="text-xs text-gray-500 truncate" title={email}>{email}</p>}
        </td>
        {/* Custom status */}
        <td className="px-4 py-2.5 border-l border-gray-100">
          {isSubmitted && customStatuses.length > 0 && canEditStatus ? (
            <Select
              value={getDisplayStatus(req)}
              onValueChange={(value) => onCustomStatusChange?.(req.id, value)}
            >
              <SelectTrigger className="h-7 text-xs w-full border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {customStatuses.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-gray-500">{getDisplayStatus(req)}</span>
          )}
        </td>
        {/* Field values */}
        {sortedFields.map(field => (
          <td
            key={field.key}
            className="px-4 py-2.5 border-l border-gray-100 text-sm text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis"
            title={
              isSubmitted && req.responseData
                ? formatResponseValue(req.responseData[field.key], field.type, userMap)
                : undefined
            }
          >
            {isSubmitted && req.responseData ? (
              field.type === "file" ? (
                <div className="flex flex-wrap gap-1">
                  {(req.attachments || [])
                    .filter(a => a.fieldKey === field.key)
                    .map(a => (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Paperclip className="w-3 h-3" />
                        <span className="max-w-[100px] truncate">{a.filename}</span>
                      </a>
                    ))}
                  {(req.attachments || []).filter(a => a.fieldKey === field.key).length === 0 && (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              ) : (
                formatResponseValue(req.responseData[field.key], field.type, userMap)
              )
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
        ))}
        {/* Submitted date */}
        <td className="px-4 py-2.5 border-l border-gray-100 text-sm text-gray-500">
          {req.submittedAt ? format(new Date(req.submittedAt), "MMM d, yyyy") : "—"}
        </td>
        {/* Actions */}
        {hasActions && (
          <td className="px-4 py-2.5 border-l border-gray-100 text-center">
            <div className="flex items-center justify-center gap-1">
              {canSendForms && req.status === "PENDING" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSendReminder(req.id)}
                  disabled={sendingReminder === req.id || req.remindersSent >= req.remindersMaxCount}
                  className="h-7 text-xs"
                  title={
                    req.remindersSent >= req.remindersMaxCount
                      ? "Max reminders sent"
                      : `Send reminder (${req.remindersSent}/${req.remindersMaxCount})`
                  }
                >
                  {sendingReminder === req.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Bell className="w-3 h-3 mr-1" />
                      Remind
                    </>
                  )}
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Delete submission from ${name}? This cannot be undone.`)) {
                      onDelete?.(req.id)
                    }
                  }}
                  className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete submission"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          </td>
        )}
      </tr>
    )
  }

  const renderTableHeader = (rows: FormRequestItem[]) => {
    const allSelected = rows.length > 0 && rows.every(r => selectedIds.has(r.id))
    const someSelected = rows.some(r => selectedIds.has(r.id)) && !allSelected

    return (
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          {canDelete && (
            <th className="w-10 px-3 py-2.5 text-center">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected }}
                onChange={() => toggleGroupSelection(rows)}
                className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
              />
            </th>
          )}
          <th
            className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
            style={{ width: 200, minWidth: 200 }}
          >
            Recipient
          </th>
          <th
            className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200"
            style={{ width: 150, minWidth: 150 }}
          >
            Tracking
          </th>
          {sortedFields.map(field => (
            <th
              key={field.key}
              className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200 whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ width: 150, minWidth: 150 }}
              title={field.label}
            >
              {field.label}
            </th>
          ))}
          <th
            className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200"
            style={{ width: 120, minWidth: 120 }}
          >
            Submitted
          </th>
          {hasActions && (
            <th
              className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200"
              style={{ width: 90, minWidth: 90 }}
            />
          )}
        </tr>
      </thead>
    )
  }

  return (
    <div className="space-y-3">
      {/* Form header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{formName}</h3>
          <span className="text-xs text-gray-500">
            {submitted}/{total} submitted
          </span>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <>
              <div className="w-24 bg-gray-200 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${submitted === total ? "bg-green-500" : "bg-blue-500"}`}
                  style={{ width: `${total > 0 ? Math.round((submitted / total) * 100) : 0}%` }}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="h-7 text-xs"
                title="Download as Excel"
              >
                <Download className="w-3 h-3 mr-1" />
                Excel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Status-grouped sections */}
      <div className="space-y-3">
        {STATUS_GROUPS.map(group => {
          const groupRows = byStatus[group.status] || []
          if (groupRows.length === 0) return null

          const isSubmitted = group.status === "SUBMITTED"
          const hasSubGroups = isSubmitted && submittedSubGroups.length > 0
          const isExpanded = expandedGroups.has(group.status)

          return (
            <div key={group.status} className={`rounded-lg overflow-hidden border-l-4 ${group.borderColor}`}>
              {/* Group header */}
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

              {/* Group content */}
              {isExpanded && (
                <div className="border border-t-0 border-gray-200 bg-white">
                  {hasSubGroups ? (
                    // Sub-groups by custom tracking status
                    <div className="divide-y divide-gray-100">
                      {submittedSubGroups.map(sub => {
                        if (sub.rows.length === 0) return null
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
                              <div className="overflow-auto">
                                <table className="text-sm border-collapse w-full" style={{ tableLayout: "fixed" }}>
                                  {renderTableHeader(sub.rows)}
                                  <tbody className="divide-y divide-gray-100">
                                    {sub.rows.map(req => renderRow(req))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    // Flat table for Pending/Expired
                    <div className="overflow-auto">
                      <table className="text-sm border-collapse w-full" style={{ tableLayout: "fixed" }}>
                        {renderTableHeader(groupRows)}
                        <tbody className="divide-y divide-gray-100">
                          {groupRows.map(req => renderRow(req))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && canDelete && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 text-white rounded-xl shadow-2xl">
            <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
              <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-sm font-medium">
                {selectedIds.size}
              </div>
              <span className="text-sm font-medium">
                Submission{selectedIds.size !== 1 ? "s" : ""} selected
              </span>
            </div>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm">Delete</span>
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-2 p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
