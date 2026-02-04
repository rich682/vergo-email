"use client"

/**
 * Form Fill Page
 * 
 * Authenticated page where users complete form requests.
 * - Requires login
 * - Verifies user is the intended recipient
 * - Displays form fields based on FormDefinition
 * - Handles submission
 */

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import {
  ClipboardList,
  Send,
  Loader2,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FormField } from "@/lib/types/form"

interface FormRequestData {
  id: string
  status: string
  submittedAt: string | null
  deadlineDate: string | null
  responseData: Record<string, unknown> | null
  formDefinition: {
    id: string
    name: string
    description: string | null
    fields: FormField[]
    settings: {
      allowEdit?: boolean
      enforceDeadline?: boolean
    }
  }
  taskInstance: {
    id: string
    name: string
    board?: {
      periodStart: string | null
      periodEnd: string | null
      cadence: string | null
    } | null
  }
  recipientUser: {
    id: string
    name: string | null
    email: string
  }
}

type PageState = "loading" | "unauthorized" | "not_found" | "expired" | "submitted" | "ready" | "submitting" | "success" | "error"

export default function FormFillPage({
  params,
}: {
  params: Promise<{ requestId: string }>
}) {
  const { requestId } = use(params)
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>("loading")
  const [formRequest, setFormRequest] = useState<FormRequestData | null>(null)
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchFormRequest()
  }, [requestId])

  const fetchFormRequest = async () => {
    try {
      setPageState("loading")
      const response = await fetch(`/api/form-requests/${requestId}/request`, {
        credentials: "include",
      })

      if (response.status === 401) {
        // Redirect to login
        window.location.href = `/auth/signin?callbackUrl=/forms/${requestId}`
        return
      }

      if (response.status === 403) {
        setPageState("unauthorized")
        return
      }

      if (response.status === 404) {
        setPageState("not_found")
        return
      }

      if (!response.ok) {
        throw new Error("Failed to load form")
      }

      const data = await response.json()
      setFormRequest(data.formRequest)

      // Initialize form values from existing response data
      const initialValues: Record<string, unknown> = {}
      const fields = data.formRequest.formDefinition.fields as FormField[]
      for (const field of fields) {
        initialValues[field.key] = data.formRequest.responseData?.[field.key] ?? field.defaultValue ?? ""
      }
      setFormValues(initialValues)

      // Check status
      if (data.formRequest.status === "SUBMITTED") {
        const settings = data.formRequest.formDefinition.settings || {}
        if (!settings.allowEdit) {
          setPageState("submitted")
          return
        }
      }

      if (data.formRequest.status === "EXPIRED") {
        setPageState("expired")
        return
      }

      // Check deadline
      const deadline = data.formRequest.deadlineDate
      const settings = data.formRequest.formDefinition.settings || {}
      if (deadline && settings.enforceDeadline && new Date(deadline) < new Date()) {
        setPageState("expired")
        return
      }

      setPageState("ready")
    } catch (err: any) {
      console.error("Error loading form:", err)
      setError(err.message)
      setPageState("error")
    }
  }

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}
    const fields = formRequest?.formDefinition.fields || []

    for (const field of fields) {
      if (field.required) {
        const value = formValues[field.key]
        if (value === undefined || value === null || value === "") {
          errors[field.key] = `${field.label} is required`
        }
      }

      // Type-specific validation
      if (field.validation && formValues[field.key]) {
        const value = formValues[field.key]
        
        if (field.validation.min !== undefined && typeof value === "number" && value < field.validation.min) {
          errors[field.key] = field.validation.message || `Minimum value is ${field.validation.min}`
        }
        
        if (field.validation.max !== undefined && typeof value === "number" && value > field.validation.max) {
          errors[field.key] = field.validation.message || `Maximum value is ${field.validation.max}`
        }
        
        if (field.validation.pattern && typeof value === "string") {
          const regex = new RegExp(field.validation.pattern)
          if (!regex.test(value)) {
            errors[field.key] = field.validation.message || "Invalid format"
          }
        }
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setPageState("submitting")
    setError(null)

    try {
      const response = await fetch(`/api/form-requests/${requestId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ responseData: formValues }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to submit form")
      }

      setPageState("success")
    } catch (err: any) {
      console.error("Error submitting form:", err)
      setError(err.message)
      setPageState("error")
    }
  }

  const updateField = (key: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [key]: value }))
    // Clear validation error for this field
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const updated = { ...prev }
        delete updated[key]
        return updated
      })
    }
  }

  // Loading state
  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Loading form...</p>
        </div>
      </div>
    )
  }

  // Unauthorized
  if (pageState === "unauthorized") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Access Denied</h1>
          <p className="mt-2 text-gray-600">
            You don't have permission to view this form. Please contact the person who sent it.
          </p>
        </div>
      </div>
    )
  }

  // Not found
  if (pageState === "not_found") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <ClipboardList className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Form Not Found</h1>
          <p className="mt-2 text-gray-600">
            This form request doesn't exist or has been deleted.
          </p>
        </div>
      </div>
    )
  }

  // Expired
  if (pageState === "expired") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <Clock className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Form Expired</h1>
          <p className="mt-2 text-gray-600">
            The deadline for this form has passed. Please contact the sender if you still need to submit.
          </p>
        </div>
      </div>
    )
  }

  // Already submitted (no edit allowed)
  if (pageState === "submitted") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Already Submitted</h1>
          <p className="mt-2 text-gray-600">
            You have already submitted this form. Thank you for your response!
          </p>
          {formRequest?.submittedAt && (
            <p className="mt-2 text-sm text-gray-500">
              Submitted on{" "}
              {new Date(formRequest.submittedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Success
  if (pageState === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Form Submitted!</h1>
          <p className="mt-2 text-gray-600">
            Thank you for completing the form. Your response has been recorded.
          </p>
        </div>
      </div>
    )
  }

  // Error
  if (pageState === "error" && !formRequest) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Error</h1>
          <p className="mt-2 text-gray-600">{error || "Something went wrong"}</p>
          <Button onClick={fetchFormRequest} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  if (!formRequest) return null

  const fields = formRequest.formDefinition.fields as FormField[]
  const sortedFields = [...fields].sort((a, b) => a.order - b.order)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-100 rounded-lg">
              <ClipboardList className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-gray-900">
                {formRequest.formDefinition.name}
              </h1>
              {formRequest.formDefinition.description && (
                <p className="mt-1 text-gray-600">
                  {formRequest.formDefinition.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                <span>For: {formRequest.taskInstance.name}</span>
                {formRequest.deadlineDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Due: {new Date(formRequest.deadlineDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Error message */}
        {pageState === "error" && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="space-y-6">
            {sortedFields.map((field) => (
              <div key={field.key}>
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {field.helpText && (
                  <p className="text-xs text-gray-500 mt-0.5">{field.helpText}</p>
                )}
                <div className="mt-1.5">
                  {field.type === "text" && (
                    <Input
                      id={field.key}
                      value={(formValues[field.key] as string) || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      className={validationErrors[field.key] ? "border-red-500" : ""}
                    />
                  )}
                  {field.type === "longText" && (
                    <Textarea
                      id={field.key}
                      value={(formValues[field.key] as string) || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      rows={4}
                      className={validationErrors[field.key] ? "border-red-500" : ""}
                    />
                  )}
                  {(field.type === "number" || field.type === "currency") && (
                    <Input
                      id={field.key}
                      type="number"
                      step={field.type === "currency" ? "0.01" : "1"}
                      value={(formValues[field.key] as number) || ""}
                      onChange={(e) => updateField(field.key, e.target.value ? Number(e.target.value) : "")}
                      placeholder={field.type === "currency" ? "0.00" : "0"}
                      className={validationErrors[field.key] ? "border-red-500" : ""}
                    />
                  )}
                  {field.type === "date" && (
                    <Input
                      id={field.key}
                      type="date"
                      value={(formValues[field.key] as string) || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className={validationErrors[field.key] ? "border-red-500" : ""}
                    />
                  )}
                  {field.type === "dropdown" && (
                    <Select
                      value={(formValues[field.key] as string) || ""}
                      onValueChange={(value) => updateField(field.key, value)}
                    >
                      <SelectTrigger className={validationErrors[field.key] ? "border-red-500" : ""}>
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {field.type === "checkbox" && (
                    <div className="flex items-center gap-2">
                      <input
                        id={field.key}
                        type="checkbox"
                        checked={Boolean(formValues[field.key])}
                        onChange={(e) => updateField(field.key, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                      <label htmlFor={field.key} className="text-sm text-gray-600">
                        Yes
                      </label>
                    </div>
                  )}
                  {field.type === "file" && (
                    <Input
                      id={field.key}
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          updateField(field.key, file.name)
                        }
                      }}
                      className={validationErrors[field.key] ? "border-red-500" : ""}
                    />
                  )}
                </div>
                {validationErrors[field.key] && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors[field.key]}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t">
            <Button
              type="submit"
              disabled={pageState === "submitting"}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            >
              {pageState === "submitting" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit Form
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
