"use client"

/**
 * Form Requests Panel
 *
 * Displays form request progress, individual recipient status, and
 * expandable response data within a task view.
 */

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ClipboardList,
  Check,
  Clock,
  AlertCircle,
  Loader2,
  Bell,
  Eye,
  EyeOff,
  Database,
  ChevronDown,
  ChevronUp,
  Download,
  Paperclip,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { usePermissions } from "@/components/permissions-context"
import { parseFields, formatResponseValue } from "@/lib/utils/form-formatting"
import type { FormField } from "@/lib/types/form"

interface FormAttachment {
  id: string
  filename: string
  url: string
  mimeType: string | null
  sizeBytes: number | null
  fieldKey: string
}

interface FormRequestItem {
  id: string
  status: string
  submittedAt: string | null
  deadlineDate: string | null
  remindersSent: number
  remindersMaxCount: number
  responseData: Record<string, unknown> | null
  formDefinition: {
    id: string
    name: string
    databaseId: string | null
    fields: FormField[] | string
  }
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

interface FormRequestProgress {
  total: number
  submitted: number
  pending: number
  expired: number
}

interface FormRequestsPanelProps {
  jobId: string
  onRefresh?: () => void
}

export function FormRequestsPanel({ jobId, onRefresh }: FormRequestsPanelProps) {
  const { can } = usePermissions()
  const canSendForms = can("forms:send")
  const [loading, setLoading] = useState(true)
  const [formRequests, setFormRequests] = useState<FormRequestItem[]>([])
  const [progress, setProgress] = useState<FormRequestProgress>({
    total: 0,
    submitted: 0,
    pending: 0,
    expired: 0,
  })
  const [expanded, setExpanded] = useState(true)
  const [sendingReminder, setSendingReminder] = useState<string | null>(null)
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set())
  const [viewerRestricted, setViewerRestricted] = useState(false)

  const toggleResponse = (requestId: string) => {
    setExpandedResponses(prev => {
      const next = new Set(prev)
      if (next.has(requestId)) {
        next.delete(requestId)
      } else {
        next.add(requestId)
      }
      return next
    })
  }

  const fetchFormRequests = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/task-instances/${jobId}/form-requests`, {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setFormRequests(data.formRequests || [])
        setProgress(data.progress || { total: 0, submitted: 0, pending: 0, expired: 0 })
        setViewerRestricted(!!data.viewerRestricted)
      }
    } catch (error) {
      console.error("Error fetching form requests:", error)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    fetchFormRequests()
  }, [fetchFormRequests])

  const handleSendReminder = async (formRequestId: string) => {
    setSendingReminder(formRequestId)
    try {
      const response = await fetch(`/api/form-requests/${formRequestId}/remind`, {
        method: "POST",
        credentials: "include",
      })
      if (response.ok) {
        // Refresh the list to update reminder count
        await fetchFormRequests()
      } else {
        const data = await response.json()
        alert(data.error || "Failed to send reminder")
      }
    } catch (error) {
      console.error("Error sending reminder:", error)
      alert("Failed to send reminder")
    } finally {
      setSendingReminder(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      </div>
    )
  }

  if (formRequests.length === 0) {
    return null // Don't show panel if no form requests
  }

  const progressPercent = progress.total > 0
    ? Math.round((progress.submitted / progress.total) * 100)
    : 0

  // Group by form definition
  const groupedByForm = formRequests.reduce((acc, req) => {
    if (!req || !req.formDefinition) return acc
    const formId = req.formDefinition.id
    if (!acc[formId]) {
      acc[formId] = {
        formName: req.formDefinition.name || 'Unnamed Form',
        databaseId: req.formDefinition.databaseId || null,
        fields: parseFields(req.formDefinition.fields),
        requests: [],
      }
    }
    acc[formId].requests.push(req)
    return acc
  }, {} as Record<string, { formName: string; databaseId: string | null; fields: FormField[]; requests: FormRequestItem[] }>)

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <ClipboardList className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-left">
            <h3 className="font-medium text-gray-900">Form Requests</h3>
            <p className="text-sm text-gray-500">
              {progress.submitted} of {progress.total} submitted
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-32">
            <Progress value={progressPercent} className="h-2" />
          </div>
          <span className="text-sm font-medium text-gray-700">{progressPercent}%</span>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-200">
          {viewerRestricted && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700">
                You&apos;re only seeing your own form requests. Ask an admin to add you as a viewer to see all responses.
              </p>
            </div>
          )}
          {Object.entries(groupedByForm).map(([formId, group]) => (
            <div key={formId} className="border-b border-gray-100 last:border-b-0">
              {/* Form header */}
              <div className="px-4 py-2 bg-gray-50">
                <span className="text-sm font-medium text-gray-700">
                  {group.formName}
                </span>
              </div>

              {/* Recipients list */}
              <div className="divide-y divide-gray-100">
                {(group.requests || []).filter(req => req != null).map((req) => {
                  // Get recipient name and email from either user or entity
                  const recipientName = req.recipientUser?.name ||
                    (req.recipientEntity ? `${req.recipientEntity.firstName}${req.recipientEntity.lastName ? ` ${req.recipientEntity.lastName}` : ''}` : null)
                  const recipientEmail = req.recipientUser?.email || req.recipientEntity?.email
                  const isResponseExpanded = expandedResponses.has(req.id)
                  const hasResponseData = req.status === "SUBMITTED" && req.responseData && Object.keys(req.responseData).length > 0

                  return (
                  <div key={req.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Status icon */}
                        {req.status === "SUBMITTED" ? (
                          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          </div>
                        ) : req.status === "EXPIRED" ? (
                          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                          </div>
                        )}

                        {/* Recipient info */}
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {recipientName || recipientEmail || 'Unknown'}
                          </p>
                          {recipientName && recipientEmail && (
                            <p className="text-xs text-gray-500">
                              {recipientEmail}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Status/action */}
                      <div className="flex items-center gap-2">
                        {req.status === "SUBMITTED" ? (
                          <>
                            <span className="text-xs text-gray-500">
                              Submitted{" "}
                              {req.submittedAt &&
                                new Date(req.submittedAt).toLocaleDateString()}
                            </span>
                            {hasResponseData && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleResponse(req.id)}
                                className="h-7 text-xs"
                              >
                                {isResponseExpanded ? (
                                  <><EyeOff className="w-3 h-3 mr-1" />Hide</>
                                ) : (
                                  <><Eye className="w-3 h-3 mr-1" />View</>
                                )}
                              </Button>
                            )}
                          </>
                        ) : req.status === "PENDING" ? (
                          <>
                            {req.remindersSent > 0 && (
                              <span className="text-xs text-gray-400">
                                {req.remindersSent}/{req.remindersMaxCount} reminders
                              </span>
                            )}
                            {canSendForms && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSendReminder(req.id)}
                              disabled={
                                sendingReminder === req.id ||
                                req.remindersSent >= req.remindersMaxCount
                              }
                              className="h-7 text-xs"
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
                          </>
                        ) : (
                          <span className="text-xs text-red-500">Expired</span>
                        )}
                      </div>
                    </div>

                    {/* Expandable response data */}
                    {isResponseExpanded && hasResponseData && req.responseData && (
                      <div className="mt-3 ml-9 bg-gray-50 rounded-lg p-3">
                        <div className="space-y-2">
                          {group.fields.length > 0 ? (
                            // Use field definitions for labels and ordering
                            group.fields
                              .sort((a, b) => (a.order || 0) - (b.order || 0))
                              .filter(field => field.key in (req.responseData || {}))
                              .map(field => (
                                <div key={field.key} className="flex items-start gap-2">
                                  <span className="text-xs font-medium text-gray-500 min-w-[120px] flex-shrink-0">
                                    {field.label}
                                  </span>
                                  <span className="text-xs text-gray-900">
                                    {formatResponseValue(req.responseData![field.key], field.type)}
                                  </span>
                                </div>
                              ))
                          ) : (
                            // Fallback: show raw keys if no field definitions
                            Object.entries(req.responseData).map(([key, value]) => (
                              <div key={key} className="flex items-start gap-2">
                                <span className="text-xs font-medium text-gray-500 min-w-[120px] flex-shrink-0">
                                  {key}
                                </span>
                                <span className="text-xs text-gray-900">
                                  {formatResponseValue(value)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Attachments for submitted forms */}
                    {req.status === "SUBMITTED" && req.attachments && req.attachments.length > 0 && (
                      <div className="mt-2 ml-9 flex flex-wrap gap-2">
                        {req.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-700 transition-colors"
                            title={`Download ${attachment.filename}`}
                          >
                            <Paperclip className="w-3 h-3" />
                            <span className="max-w-[120px] truncate">{attachment.filename}</span>
                            <Download className="w-3 h-3 text-gray-400" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* View in database link - deep link to specific database */}
          {(() => {
            // Find the first form group with a databaseId
            const groupWithDb = Object.values(groupedByForm).find(g => g.databaseId)
            if (!groupWithDb) return null
            return (
              <div className="px-4 py-3 bg-gray-50 text-center">
                <Link
                  href={`/dashboard/databases/${groupWithDb.databaseId}`}
                  className="text-sm text-orange-600 hover:underline inline-flex items-center gap-1"
                >
                  <Database className="w-4 h-4" />
                  View all responses in database
                </Link>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
