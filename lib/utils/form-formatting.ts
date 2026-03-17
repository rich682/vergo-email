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
export function formatResponseValue(value: unknown, fieldType?: string, userMap?: Record<string, string>): string {
  if (value === null || value === undefined || value === "") return "—"
  if (fieldType === "users" && userMap) {
    if (typeof value === "string") return userMap[value] || value
    if (Array.isArray(value)) return value.map(id => userMap[id] || id).join(", ")
  }
  if (fieldType === "currency" && typeof value === "number") {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (fieldType === "checkbox") return value ? "Yes" : "No"
  if (fieldType === "accountingPeriod" && typeof value === "string") {
    try {
      const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) {
        const d = new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3])
        return d.toLocaleDateString(undefined, { year: "numeric", month: "long" })
      }
      return String(value)
    } catch {
      return String(value)
    }
  }
  if (fieldType === "date" && typeof value === "string") {
    try {
      // Parse YYYY-MM-DD as local date to avoid UTC timezone shift
      const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) {
        return new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]).toLocaleDateString()
      }
      return new Date(value + "T00:00:00").toLocaleDateString()
    } catch {
      return String(value)
    }
  }
  if (typeof value === "object") {
    try { return JSON.stringify(value) } catch { return "[object]" }
  }
  return String(value)
}
