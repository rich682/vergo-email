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
        const value = formValues[field.key]
        if (value === null || value === undefined || value === "") {
          errors[field.key] = `${field.label} is required`
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
      const response = await fetch(`/api/forms/public/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseData: formValues,
          submitterName: submitterName.trim() || undefined,
          submitterEmail: submitterEmail.trim() || undefined,
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
                    <p className="text-sm text-gray-500 italic">
                      File uploads are not supported in public form submissions.
                    </p>
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
