"use client"

/**
 * Forms Tab
 *
 * Tab content for the Forms section within a task detail page.
 * Fetches form requests, groups by form definition, and renders
 * a FormSubmissionsTable for each form.
 */

import { useState, useEffect, useCallback } from "react"
import { ClipboardList, Loader2 } from "lucide-react"
import { usePermissions } from "@/components/permissions-context"
import { parseFields } from "@/lib/utils/form-formatting"
import { FormSubmissionsTable } from "@/components/jobs/form-submissions-table"
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
  formDefinition: {
    id: string
    name: string
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

interface FormsTabProps {
  jobId: string
  onFormsSent?: () => void
}

export function FormsTab({ jobId, onFormsSent }: FormsTabProps) {
  const { can } = usePermissions()
  const canSendForms = can("forms:send")
  const [loading, setLoading] = useState(true)
  const [formRequests, setFormRequests] = useState<FormRequestItem[]>([])
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

  // Expose refresh for parent to call after sending forms
  useEffect(() => {
    if (onFormsSent) {
      // Re-fetch when parent signals new forms were sent
    }
  }, [onFormsSent])

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
        <p className="mt-2 text-sm text-gray-500">No forms sent yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Send a form to start collecting structured responses
        </p>
      </div>
    )
  }

  // Group form requests by form definition
  const groupedByForm = formRequests.reduce((acc, req) => {
    if (!req?.formDefinition) return acc
    const formId = req.formDefinition.id
    if (!acc[formId]) {
      acc[formId] = {
        formName: req.formDefinition.name || "Unnamed Form",
        fields: parseFields(req.formDefinition.fields),
        requests: [],
      }
    }
    acc[formId].requests.push(req)
    return acc
  }, {} as Record<string, { formName: string; fields: FormField[]; requests: FormRequestItem[] }>)

  return (
    <div className="space-y-6">
      {Object.entries(groupedByForm).map(([formId, group]) => (
        <FormSubmissionsTable
          key={formId}
          formName={group.formName}
          fields={group.fields}
          formRequests={group.requests}
          canSendForms={canSendForms}
          onSendReminder={handleSendReminder}
          sendingReminder={sendingReminder}
        />
      ))}
    </div>
  )
}
