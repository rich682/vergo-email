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
  Check,
  Clock,
  AlertCircle,
  Bell,
  Loader2,
  Paperclip,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
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
  canSendForms: boolean
  onSendReminder: (requestId: string) => void
  sendingReminder: string | null
}

function getRecipientName(req: FormRequestItem): string {
  if (req.recipientUser?.name) return req.recipientUser.name
  if (req.recipientEntity) {
    return `${req.recipientEntity.firstName}${req.recipientEntity.lastName ? ` ${req.recipientEntity.lastName}` : ""}`
  }
  return "Unknown"
}

function getRecipientEmail(req: FormRequestItem): string | null {
  return req.recipientUser?.email || req.recipientEntity?.email || null
}

function StatusBadge({ status }: { status: string }) {
  if (status === "SUBMITTED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
        <Check className="w-3 h-3" /> Submitted
      </span>
    )
  }
  if (status === "EXPIRED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
        <AlertCircle className="w-3 h-3" /> Expired
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
      <Clock className="w-3 h-3" /> Pending
    </span>
  )
}

export function FormSubmissionsTable({
  formName,
  fields,
  formRequests,
  canSendForms,
  onSendReminder,
  sendingReminder,
}: FormSubmissionsTableProps) {
  const sortedFields = [...fields].sort((a, b) => (a.order || 0) - (b.order || 0))

  // Sort requests: submitted first, then pending, then expired
  const statusOrder: Record<string, number> = { SUBMITTED: 0, PENDING: 1, EXPIRED: 2 }
  const sortedRequests = [...formRequests].sort(
    (a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1)
  )

  const submitted = formRequests.filter(r => r.status === "SUBMITTED").length
  const total = formRequests.length

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
        {total > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-24 bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${submitted === total ? "bg-green-500" : "bg-blue-500"}`}
                style={{ width: `${total > 0 ? Math.round((submitted / total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
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
              {/* Status column */}
              <th
                className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200"
                style={{ width: 110, minWidth: 110 }}
              >
                Status
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
              {canSendForms && (
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
              const name = getRecipientName(req)
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
                  {/* Status */}
                  <td className="px-4 py-2.5 border-l border-gray-100">
                    <StatusBadge status={req.status} />
                  </td>
                  {/* Field values */}
                  {sortedFields.map(field => (
                    <td
                      key={field.key}
                      className="px-4 py-2.5 border-l border-gray-100 text-sm text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis"
                      title={
                        isSubmitted && req.responseData
                          ? formatResponseValue(req.responseData[field.key], field.type)
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
                          formatResponseValue(req.responseData[field.key], field.type)
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
                  {canSendForms && (
                    <td className="px-4 py-2.5 border-l border-gray-100 text-center">
                      {req.status === "PENDING" && (
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
