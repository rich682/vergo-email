/**
 * Form Formatting Utilities
 *
 * Shared helpers for parsing form fields and formatting response values.
 * Used by FormRequestsPanel, FormSubmissionsTable, and FormsTab.
 */

import type { FormField } from "@/lib/types/form"

/**
 * Safely parse form fields from JSON or already-parsed array.
 */
export function parseFields(fields: FormField[] | string | null | undefined): FormField[] {
  if (!fields) return []
  if (typeof fields === "string") {
    try { return JSON.parse(fields) } catch { return [] }
  }
  return Array.isArray(fields) ? fields : []
}

/**
 * Format a form response value for display based on field type.
 */
export function formatResponseValue(value: unknown, fieldType?: string): string {
  if (value === null || value === undefined || value === "") return "—"
  if (fieldType === "currency" && typeof value === "number") {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (fieldType === "checkbox") return value ? "Yes" : "No"
  if (fieldType === "date" && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString()
    } catch {
      return String(value)
    }
  }
  if (typeof value === "object") {
    try { return JSON.stringify(value) } catch { return "[object]" }
  }
  return String(value)
}
