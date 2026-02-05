"use client"

/**
 * Form Requests Panel
 * 
 * Displays form request progress and individual recipient status within a task view.
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
  Database,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

interface FormRequestItem {
  id: string
  status: string
  submittedAt: string | null
  deadlineDate: string | null
  remindersSent: number
  remindersMaxCount: number
  formDefinition: {
    id: string
    name: string
  }
  recipientUser: {
    id: string
    name: string | null
    email: string
  }
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
        requests: [],
      }
    }
    acc[formId].requests.push(req)
    return acc
  }, {} as Record<string, { formName: string; requests: FormRequestItem[] }>)

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
          {Object.entries(groupedByForm).map(([formId, group]) => (
            <div key={formId} className="border-b border-gray-100 last:border-b-0">
              {/* Form header */}
              <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {group.formName}
                </span>
                <Link
                  href={`/dashboard/forms/${formId}`}
                  className="text-xs text-orange-600 hover:underline flex items-center gap-1"
                >
                  Edit Form
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {/* Recipients list */}
              <div className="divide-y divide-gray-100">
                {(group.requests || []).filter(req => req != null).map((req) => (
                  <div
                    key={req.id}
                    className="px-4 py-3 flex items-center justify-between"
                  >
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
                          {req.recipientUser?.name || req.recipientUser?.email || 'Unknown'}
                        </p>
                        {req.recipientUser?.name && (
                          <p className="text-xs text-gray-500">
                            {req.recipientUser?.email || ''}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status/action */}
                    <div className="flex items-center gap-2">
                      {req.status === "SUBMITTED" ? (
                        <span className="text-xs text-gray-500">
                          Submitted{" "}
                          {req.submittedAt &&
                            new Date(req.submittedAt).toLocaleDateString()}
                        </span>
                      ) : req.status === "PENDING" ? (
                        <>
                          {req.remindersSent > 0 && (
                            <span className="text-xs text-gray-400">
                              {req.remindersSent}/{req.remindersMaxCount} reminders
                            </span>
                          )}
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
                        </>
                      ) : (
                        <span className="text-xs text-red-500">Expired</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* View in database link if applicable */}
          {formRequests[0]?.formDefinition && (
            <div className="px-4 py-3 bg-gray-50 text-center">
              <Link
                href={`/dashboard/databases`}
                className="text-sm text-orange-600 hover:underline inline-flex items-center gap-1"
              >
                <Database className="w-4 h-4" />
                View responses in database
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
