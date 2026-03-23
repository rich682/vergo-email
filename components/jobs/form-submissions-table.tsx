"use client"

/**
 * Form Submissions Table
 *
 * Spreadsheet-style view of form submissions where:
 * - Columns = form questions (fields)
 * - Rows = recipients (all recipients, not just submitted)
 * - Cells populate with response data as submissions come in
 */

import {
  Bell,
  Loader2,
  Paperclip,
  Download,
  Trash2,
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
  sendingReminder: string | null
  userMap?: Record<string, string>
}

function getRecipientName(req: FormRequestItem, fields?: FormField[], userMap?: Record<string, string>): string {
  if (req.recipientUser?.name) return req.recipientUser.name
  if (req.recipientEntity) {
    return `${req.recipientEntity.firstName}${req.recipientEntity.lastName ? ` ${req.recipientEntity.lastName}` : ""}`
  }
  // Universal link submissions: try to extract submitter name from responseData
  if (!req.recipientUser && !req.recipientEntity && req.responseData && fields) {
    // Look for a "users" type field and resolve the name
    for (const field of fields) {
      if (field.type === "users" && req.responseData[field.key]) {
        const userId = req.responseData[field.key]
        if (typeof userId === "string" && userMap?.[userId]) {
          return userMap[userId]
        }
      }
    }
    // Fallback: look for text fields with name-like keys
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

function getRecipientEmail(req: FormRequestItem): string | null {
  return req.recipientUser?.email || req.recipientEntity?.email || null
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
  sendingReminder,
  userMap,
}: FormSubmissionsTableProps) {
  const sortedFields = [...fields].sort((a, b) => (a.order || 0) - (b.order || 0))

  // Sort requests: submitted first, then pending, then expired
  const statusOrder: Record<string, number> = { SUBMITTED: 0, PENDING: 1, EXPIRED: 2 }
  const sortedRequests = [...formRequests].sort(
    (a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1)
  )

  const submitted = formRequests.filter(r => r.status === "SUBMITTED").length
  const total = formRequests.length

  // Resolve display status: use customStatus if set, else derive from system status
  const getDisplayStatus = (req: FormRequestItem): string => {
    if (req.customStatus) return req.customStatus
    if (req.status === "SUBMITTED") return "Submitted"
    if (req.status === "PENDING") return "In Progress"
    return req.status
  }

  const handleExportExcel = () => {
    const headers = ["Recipient", "Email", "Status", ...sortedFields.map(f => f.label), "Submitted"]
    const data: (string | number | boolean | null)[][] = [headers]

    for (const req of sortedRequests) {
      const row = [
        getRecipientName(req, sortedFields, userMap),
        getRecipientEmail(req) || "",
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

    // Auto-size columns
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

      {/* Table */}
      <div className="rounded-lg border border-gray-200 overflow-auto">
        <table className="text-sm border-collapse" style={{ tableLayout: "fixed" }}>
          <thead className="bg-gray-100 sticky top-0 z-20">
            <tr className="border-b border-gray-200">
              {/* Recipient column - sticky left */}
              <th
                className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 z-30 bg-gray-100 whitespace-nowrap"
                style={{ width: 200, minWidth: 200 }}
              >
                Recipient
              </th>
              {/* Custom status column */}
              <th
                className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200"
                style={{ width: 150, minWidth: 150 }}
              >
                Tracking
              </th>
              {/* Dynamic field columns */}
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
              {/* Submitted date column */}
              <th
                className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200"
                style={{ width: 120, minWidth: 120 }}
              >
                Submitted
              </th>
              {/* Actions column */}
              {(canSendForms || canDelete) && (
                <th
                  className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200"
                  style={{ width: 90, minWidth: 90 }}
                >
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedRequests.map(req => {
              const name = getRecipientName(req, sortedFields, userMap)
              const email = getRecipientEmail(req)
              const isSubmitted = req.status === "SUBMITTED"

              return (
                <tr key={req.id} className="hover:bg-gray-50">
                  {/* Recipient - sticky left */}
                  <td
                    className="px-4 py-2.5 sticky left-0 z-10 bg-white whitespace-nowrap"
                  >
                    <p className="text-sm font-medium text-gray-900 truncate" title={name}>
                      {name}
                    </p>
                    {email && (
                      <p className="text-xs text-gray-500 truncate" title={email}>
                        {email}
                      </p>
                    )}
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
                            <SelectItem key={s} value={s} className="text-xs">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {getDisplayStatus(req)}
                      </span>
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
                          // File fields: show attachment links
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
                    {req.submittedAt
                      ? format(new Date(req.submittedAt), "MMM d, yyyy")
                      : "—"}
                  </td>
                  {/* Actions */}
                  {(canSendForms || canDelete) && (
                    <td className="px-4 py-2.5 border-l border-gray-100 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {canSendForms && req.status === "PENDING" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSendReminder(req.id)}
                            disabled={
                              sendingReminder === req.id ||
                              req.remindersSent >= req.remindersMaxCount
                            }
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
                              const recipientName = getRecipientName(req, sortedFields, userMap)
                              if (confirm(`Delete submission from ${recipientName}? This cannot be undone.`)) {
                                onDelete?.(req.id)
                              }
                            }}
                            className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
