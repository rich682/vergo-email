"use client"

/**
 * Public Form Page
 *
 * Universal link page where anyone can fill out and submit a form
 * without authentication. Submissions are routed to the correct
 * task based on the accounting period field.
 */

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  ClipboardList,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Upload,
  FileText,
  X,
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
import type { FormField, FormSettings } from "@/lib/types/form"

const safeString = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  return String(value)
}

interface FileUpload {
  url: string
  filename: string
  mimeType: string
  sizeBytes: number
  fieldKey: string
}

interface PublicFormData {
  id: string
  name: string
  description: string | null
  fields: FormField[]
  settings: FormSettings
  organizationName: string
}

export default function PublicFormPage() {
  const params = useParams()
  const token = typeof params?.token === "string" ? params.token : ""

  const [form, setForm] = useState<PublicFormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // File upload state
  const [fileUploads, setFileUploads] = useState<Record<string, FileUpload[]>>({})
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({})

  // Optional submitter info
  const [submitterName, setSubmitterName] = useState("")
  const [submitterEmail, setSubmitterEmail] = useState("")

  const fetchForm = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/forms/public/${token}`)
      if (response.ok) {
        const data = await response.json()
        let fields = data.form.fields || []
        let settings = data.form.settings || {}
        if (typeof fields === "string") {
          try { fields = JSON.parse(fields) } catch { fields = [] }
        }
        if (typeof settings === "string") {
          try { settings = JSON.parse(settings) } catch { settings = {} }
        }
        setForm({
          ...data.form,
          fields: Array.isArray(fields) ? fields : [],
          settings,
        })
      } else {
        const data = await response.json().catch(() => ({}))
        setError(data.error || "Form not found")
      }
    } catch (err) {
      setError("Failed to load form")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (token) fetchForm()
  }, [token, fetchForm])

  const updateField = (key: string, value: unknown) => {
    setFormValues(prev => ({ ...prev, [key]: value }))
    setValidationErrors(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const validate = (): boolean => {
    if (!form) return false
    const errors: Record<string, string> = {}
    for (const field of form.fields) {
      if (field.required) {
        if (field.type === "file") {
          if ((fileUploads[field.key] || []).length === 0) {
            errors[field.key] = `${field.label} is required - please upload a file`
          }
        } else {
          const value = formValues[field.key]
          if (value === null || value === undefined || value === "") {
            errors[field.key] = `${field.label} is required`
          }
        }
      }
    }
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      // Flatten all file uploads into a single array
      const allFileUploads = Object.values(fileUploads).flat()

      const response = await fetch(`/api/forms/public/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseData: formValues,
          submitterName: submitterName.trim() || undefined,
          submitterEmail: submitterEmail.trim() || undefined,
          fileUploads: allFileUploads.length > 0 ? allFileUploads : undefined,
        }),
      })

      if (response.ok) {
        setSubmitted(true)
      } else {
        const data = await response.json().catch(() => ({}))
        if (data.errors) {
          setValidationErrors(data.errors)
        }
        setSubmitError(data.error || "Failed to submit form")
      }
    } catch (err) {
      setSubmitError("Failed to submit form. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleFileUpload = async (fieldKey: string, file: File) => {
    setUploadingFields(prev => ({ ...prev, [fieldKey]: true }))
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("fieldKey", fieldKey)

      const response = await fetch(`/api/forms/public/${token}/upload`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to upload file")
      }

      const { upload } = await response.json()
      setFileUploads(prev => ({
        ...prev,
        [fieldKey]: [...(prev[fieldKey] || []), upload],
      }))
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[fieldKey]
        return next
      })
    } catch (err: any) {
      setSubmitError(err.message)
    } finally {
      setUploadingFields(prev => ({ ...prev, [fieldKey]: false }))
    }
  }

  const handleFileRemove = (fieldKey: string, url: string) => {
    setFileUploads(prev => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] || []).filter(f => f.url !== url),
    }))
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Form Not Available</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Form Submitted</h1>
          <p className="text-gray-500 mb-6">
            Your response has been recorded successfully.
          </p>
          <Button
            onClick={() => {
              setSubmitted(false)
              setFormValues({})
              setFileUploads({})
              setSubmitError(null)
              setSubmitterName("")
              setSubmitterEmail("")
            }}
            variant="outline"
          >
            Submit Another Response
          </Button>
        </div>
      </div>
    )
  }

  if (!form) return null

  const sortedFields = [...form.fields].sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-100 rounded-lg">
              <ClipboardList className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {safeString(form.name)}
              </h1>
              <p className="text-sm text-gray-500">{form.organizationName}</p>
            </div>
          </div>
          {form.description && (
            <p className="text-sm text-gray-600">{safeString(form.description)}</p>
          )}
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="space-y-6">
            {/* Optional submitter info */}
            <div className="grid grid-cols-2 gap-4 pb-6 border-b border-gray-200">
              <div>
                <Label>Your Name (optional)</Label>
                <Input
                  value={submitterName}
                  onChange={(e) => setSubmitterName(e.target.value)}
                  placeholder="Enter your name"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Your Email (optional)</Label>
                <Input
                  type="email"
                  value={submitterEmail}
                  onChange={(e) => setSubmitterEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="mt-1.5"
                />
              </div>
            </div>

            {/* Form fields */}
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
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <Input
                        id={field.key}
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={(formValues[field.key] as number) ?? ""}
                        onChange={(e) => updateField(field.key, e.target.value ? Number(e.target.value) : "")}
                        placeholder="0.00"
                        className={`pl-7 ${validationErrors[field.key] ? "border-red-500" : ""}`}
                      />
                    </div>
                  )}
                  {field.type === "percentage" && (
                    <div className="relative">
                      <Input
                        id={field.key}
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={(formValues[field.key] as number) ?? ""}
                        onChange={(e) => updateField(field.key, e.target.value ? Number(e.target.value) : "")}
                        placeholder="0"
                        className={`pr-8 ${validationErrors[field.key] ? "border-red-500" : ""}`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">%</span>
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
                  {field.type === "accountingPeriod" && (
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
                          const optionValue = typeof option === "object" && option !== null
                            ? (option as any).value || String(option)
                            : String(option)
                          const optionLabel = typeof option === "object" && option !== null
                            ? (option as any).label || String(option)
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
                      {(fileUploads[field.key] || []).length > 0 && (
                        <div className="space-y-2">
                          {fileUploads[field.key].map((upload) => (
                            <div
                              key={upload.url}
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border"
                            >
                              <FileText className="w-5 h-5 text-gray-500 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {upload.filename}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatFileSize(upload.sizeBytes)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleFileRemove(field.key, upload.url)}
                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                title="Remove"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
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
                              e.target.value = ""
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
                  <p className="text-xs text-red-500 mt-1">
                    {validationErrors[field.key]}
                  </p>
                )}
              </div>
            ))}

            {submitError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{submitError}</p>
                </div>
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
