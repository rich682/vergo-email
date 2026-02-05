"use client"

/**
 * Form Fill Page
 * 
 * Page where users complete form requests.
 * Supports two access modes:
 * - Token-based: External stakeholders access via ?token=xxx (no login required)
 * - Login-based: Internal users access after authentication
 */

import { useState, useEffect } from "react"
import { useRouter, useSearchParams, useParams } from "next/navigation"
import {
  ClipboardList,
  Send,
  Loader2,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Lock,
  Upload,
  FileText,
  X,
  Download,
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

// Helper to safely convert any value to string for rendering
const safeString = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return "[Object]"
    }
  }
  return String(value)
}

interface FormAttachment {
  id: string
  filename: string
  url: string
  mimeType: string
  sizeBytes: number
  fieldKey: string
}

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

export default function FormFillPage() {
  const params = useParams()
  const requestId = params.requestId as string
  const router = useRouter()
  const searchParams = useSearchParams()
  const accessToken = searchParams.get("token") // Token for external stakeholder access
  
  const [pageState, setPageState] = useState<PageState>("loading")
  const [formRequest, setFormRequest] = useState<FormRequestData | null>(null)
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  
  // Attachment state
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({})
  const [uploadedAttachments, setUploadedAttachments] = useState<Record<string, FormAttachment[]>>({})

  useEffect(() => {
    fetchFormRequest()
  }, [requestId, accessToken])

  const fetchFormRequest = async () => {
    try {
      setPageState("loading")
      
      // Use token-based endpoint if token is present (external stakeholder access)
      // Otherwise use login-based endpoint (internal user access)
      const apiUrl = accessToken 
        ? `/api/form-requests/token/${accessToken}`
        : `/api/form-requests/${requestId}/request`
      
      const response = await fetch(apiUrl, {
        credentials: "include",
      })

      if (response.status === 401) {
        // Redirect to login only for non-token access
        if (!accessToken) {
          window.location.href = `/auth/signin?callbackUrl=/forms/${requestId}`
          return
        }
        setPageState("unauthorized")
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
      
      // Safely parse JSON fields that might be returned as strings
      const rawFormRequest = data.formRequest
      const safeFields = typeof rawFormRequest.formDefinition?.fields === "string"
        ? JSON.parse(rawFormRequest.formDefinition.fields)
        : rawFormRequest.formDefinition?.fields || []
      const safeSettings = typeof rawFormRequest.formDefinition?.settings === "string"
        ? JSON.parse(rawFormRequest.formDefinition.settings)
        : rawFormRequest.formDefinition?.settings || {}
      const safeResponseData = typeof rawFormRequest.responseData === "string"
        ? JSON.parse(rawFormRequest.responseData)
        : rawFormRequest.responseData || {}
      
      // Normalize the form request data
      const normalizedFormRequest = {
        ...rawFormRequest,
        responseData: safeResponseData,
        formDefinition: {
          ...rawFormRequest.formDefinition,
          fields: safeFields,
          settings: safeSettings,
        },
      }
      
      setFormRequest(normalizedFormRequest)

      // Initialize form values from existing response data
      const initialValues: Record<string, unknown> = {}
      const fields = safeFields as FormField[]
      for (const field of fields) {
        initialValues[field.key] = safeResponseData?.[field.key] ?? field.defaultValue ?? ""
      }
      setFormValues(initialValues)
      
      // Load existing attachments
      try {
        const attachmentsResponse = await fetch(`/api/form-requests/${requestId}/attachments`, {
          credentials: "include",
        })
        if (attachmentsResponse.ok) {
          const attachmentsData = await attachmentsResponse.json()
          const grouped: Record<string, FormAttachment[]> = {}
          for (const attachment of attachmentsData.attachments || []) {
            if (!grouped[attachment.fieldKey]) {
              grouped[attachment.fieldKey] = []
            }
            grouped[attachment.fieldKey].push(attachment)
          }
          setUploadedAttachments(grouped)
        }
      } catch (attachErr) {
        console.error("Error loading attachments:", attachErr)
      }

      // Check status
      if (normalizedFormRequest.status === "SUBMITTED") {
        if (!safeSettings.allowEdit) {
          setPageState("submitted")
          return
        }
      }

      if (normalizedFormRequest.status === "EXPIRED") {
        setPageState("expired")
        return
      }

      // Check deadline
      const deadline = normalizedFormRequest.deadlineDate
      if (deadline && safeSettings.enforceDeadline && new Date(deadline) < new Date()) {
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
        
        // File fields: check if there are any uploaded attachments
        if (field.type === "file") {
          const attachments = uploadedAttachments[field.key] || []
          if (attachments.length === 0) {
            errors[field.key] = `${field.label} is required - please upload a file`
          }
        } else if (value === undefined || value === null || value === "") {
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
      // Build response data with attachment filenames for database sync
      const responseData = { ...formValues }
      const fields = formRequest?.formDefinition.fields || []
      for (const field of fields) {
        if (field.type === "file") {
          // Store filenames (comma-separated) for database sync instead of IDs
          const attachments = uploadedAttachments[field.key] || []
          responseData[field.key] = attachments.map((a) => a.filename).join(", ") || ""
        }
      }
      
      // Use token-based endpoint if token is present (external stakeholder access)
      // Otherwise use login-based endpoint (internal user access)
      const submitUrl = accessToken 
        ? `/api/form-requests/token/${accessToken}`
        : `/api/form-requests/${requestId}/submit`
      
      const response = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ responseData }),
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

  const handleFileUpload = async (fieldKey: string, file: File) => {
    setUploadingFields((prev) => ({ ...prev, [fieldKey]: true }))
    
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("fieldKey", fieldKey)
      
      const response = await fetch(`/api/form-requests/${requestId}/attachments`, {
        method: "POST",
        credentials: "include",
        body: formData,
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to upload file")
      }
      
      const { attachment } = await response.json()
      
      // Add to uploaded attachments
      setUploadedAttachments((prev) => ({
        ...prev,
        [fieldKey]: [...(prev[fieldKey] || []), attachment],
      }))
      
      // Store attachment ID in form values (for validation and submission)
      const currentIds = (formValues[fieldKey] as string[] | undefined) || []
      updateField(fieldKey, [...currentIds, attachment.id])
    } catch (err: any) {
      console.error("Error uploading file:", err)
      setError(err.message)
    } finally {
      setUploadingFields((prev) => ({ ...prev, [fieldKey]: false }))
    }
  }
  
  const handleFileDelete = async (fieldKey: string, attachmentId: string) => {
    try {
      const response = await fetch(
        `/api/form-requests/${requestId}/attachments?attachmentId=${attachmentId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      )
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete file")
      }
      
      // Remove from uploaded attachments
      setUploadedAttachments((prev) => ({
        ...prev,
        [fieldKey]: (prev[fieldKey] || []).filter((a) => a.id !== attachmentId),
      }))
      
      // Remove from form values
      const currentIds = (formValues[fieldKey] as string[] | undefined) || []
      updateField(fieldKey, currentIds.filter((id) => id !== attachmentId))
    } catch (err: any) {
      console.error("Error deleting file:", err)
      setError(err.message)
    }
  }
  
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
          <p className="mt-2 text-gray-600">{safeString(error) || "Something went wrong"}</p>
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
                {safeString(formRequest.formDefinition.name)}
              </h1>
              {formRequest.formDefinition.description && (
                <p className="mt-1 text-gray-600">
                  {safeString(formRequest.formDefinition.description)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                <span>For: {safeString(formRequest.taskInstance.name)}</span>
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
              <p>{safeString(error)}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="space-y-6">
            {sortedFields.map((field) => (
              <div key={field.key}>
                <Label htmlFor={field.key}>
                  {safeString(field.label)}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {field.helpText && (
                  <p className="text-xs text-gray-500 mt-0.5">{safeString(field.helpText)}</p>
                )}
                <div className="mt-1.5">
                  {field.type === "text" && (
                    <Input
                      id={field.key}
                      value={(formValues[field.key] as string) || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder={`Enter ${safeString(field.label).toLowerCase()}`}
                      className={validationErrors[field.key] ? "border-red-500" : ""}
                    />
                  )}
                  {field.type === "longText" && (
                    <Textarea
                      id={field.key}
                      value={(formValues[field.key] as string) || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder={`Enter ${safeString(field.label).toLowerCase()}`}
                      rows={4}
                      className={validationErrors[field.key] ? "border-red-500" : ""}
                    />
                  )}
                  {field.type === "number" && (
                    <Input
                      id={field.key}
                      type="number"
                      step="1"
                      inputMode="numeric"
                      value={(formValues[field.key] as number) || ""}
                      onChange={(e) => updateField(field.key, e.target.value ? Number(e.target.value) : "")}
                      placeholder="0"
                      className={validationErrors[field.key] ? "border-red-500" : ""}
                    />
                  )}
                  {field.type === "currency" && (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <Input
                        id={field.key}
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={(formValues[field.key] as number) || ""}
                        onChange={(e) => updateField(field.key, e.target.value ? Number(e.target.value) : "")}
                        placeholder="0.00"
                        className={`pl-7 ${validationErrors[field.key] ? "border-red-500" : ""}`}
                      />
                    </div>
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
                        {field.options?.map((option, idx) => {
                          // Handle both string options and object options (e.g., { value, label })
                          const optionValue = typeof option === "object" && option !== null 
                            ? (option as any).value || String(option) 
                            : String(option)
                          const optionLabel = typeof option === "object" && option !== null 
                            ? (option as any).label || (option as any).value || String(option)
                            : String(option)
                          return (
                            <SelectItem key={`${optionValue}-${idx}`} value={optionValue}>
                              {optionLabel}
                            </SelectItem>
                          )
                        })}
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
                    <div className="space-y-3">
                      {/* Uploaded files */}
                      {(uploadedAttachments[field.key] || []).length > 0 && (
                        <div className="space-y-2">
                          {uploadedAttachments[field.key].map((attachment) => (
                            <div
                              key={attachment.id}
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border"
                            >
                              <FileText className="w-5 h-5 text-gray-500 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {attachment.filename}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatFileSize(attachment.sizeBytes)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleFileDelete(field.key, attachment.id)}
                                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                  title="Remove"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Upload area */}
                      <div
                        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
                          validationErrors[field.key]
                            ? "border-red-300 bg-red-50"
                            : "border-gray-300 hover:border-orange-400 hover:bg-orange-50"
                        }`}
                      >
                        <input
                          id={field.key}
                          type="file"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              handleFileUpload(field.key, file)
                              e.target.value = "" // Reset input
                            }
                          }}
                          disabled={uploadingFields[field.key]}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div className="flex flex-col items-center text-center">
                          {uploadingFields[field.key] ? (
                            <>
                              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                              <p className="mt-2 text-sm text-gray-600">Uploading...</p>
                            </>
                          ) : (
                            <>
                              <Upload className="w-8 h-8 text-gray-400" />
                              <p className="mt-2 text-sm text-gray-600">
                                <span className="font-medium text-orange-600">Click to upload</span> or drag and drop
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                PDF, Word, Excel, CSV, or images (max 10MB)
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {validationErrors[field.key] && (
                  <p className="text-sm text-red-500 mt-1">{safeString(validationErrors[field.key])}</p>
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
