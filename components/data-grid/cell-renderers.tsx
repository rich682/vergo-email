"use client"

/**
 * Cell Renderers
 *
 * Type-based cell rendering for the DataGrid.
 * Maps CellValue.type to appropriate display components.
 */

import type { CellValue, DataType } from "@/lib/data-grid/types"
import { format, parseISO, isValid } from "date-fns"

// ============================================
// Cell Renderer Component
// ============================================

interface CellRendererProps {
  value: CellValue
  className?: string
}

/**
 * Render a CellValue based on its type.
 * Includes placeholders for reserved types (attachment, label, user, link).
 */
export function CellRenderer({ value, className = "" }: CellRendererProps) {
  const baseClass = "truncate"

  switch (value.type) {
    case "empty":
      return (
        <span className={`${baseClass} text-gray-400 ${className}`}>—</span>
      )

    case "text":
      return (
        <span className={`${baseClass} ${className}`} title={value.value}>
          {value.value}
        </span>
      )

    case "number":
      return (
        <span className={`${baseClass} tabular-nums text-right ${className}`}>
          {value.value.toLocaleString()}
        </span>
      )

    case "currency":
      return (
        <span className={`${baseClass} tabular-nums text-right ${className}`}>
          ${value.value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      )

    case "date":
      return (
        <span className={`${baseClass} tabular-nums ${className}`}>
          {formatDateValue(value.value)}
        </span>
      )

    case "boolean":
      return (
        <span className={`${baseClass} ${className}`}>
          {value.value ? (
            <span className="inline-flex items-center text-green-700">
              <CheckIcon className="w-3.5 h-3.5 mr-1" />
              Yes
            </span>
          ) : (
            <span className="inline-flex items-center text-gray-500">
              <XIcon className="w-3.5 h-3.5 mr-1" />
              No
            </span>
          )}
        </span>
      )

    // Reserved types - render placeholders
    case "attachment":
      return (
        <span className={`${baseClass} text-gray-500 ${className}`}>
          <span className="inline-flex items-center">
            <PaperclipIcon className="w-3.5 h-3.5 mr-1" />
            {value.value.length} file{value.value.length !== 1 ? "s" : ""}
          </span>
        </span>
      )

    case "label":
      return (
        <span className={`${baseClass} ${className}`}>
          <span className="inline-flex gap-1 flex-wrap">
            {value.value.slice(0, 3).map((label, i) => (
              <span
                key={i}
                className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
              >
                {label}
              </span>
            ))}
            {value.value.length > 3 && (
              <span className="text-xs text-gray-500">
                +{value.value.length - 3}
              </span>
            )}
          </span>
        </span>
      )

    case "user":
      return (
        <span className={`${baseClass} ${className}`}>
          <span className="inline-flex items-center">
            <UserIcon className="w-3.5 h-3.5 mr-1 text-gray-400" />
            {value.value.display}
          </span>
        </span>
      )

    case "link":
      return (
        <span className={`${baseClass} text-blue-600 underline ${className}`}>
          {value.value.label || value.value.url}
        </span>
      )

    case "error":
      return (
        <span
          className={`${baseClass} text-red-500 text-xs italic ${className}`}
          title={value.message}
        >
          {value.message}
        </span>
      )

    default:
      return <span className={`${baseClass} text-gray-400 ${className}`}>—</span>
  }
}

// ============================================
// Date Formatting
// ============================================

/**
 * Format a date string for display.
 * Handles various input formats.
 */
function formatDateValue(dateStr: string): string {
  if (!dateStr) return "—"

  try {
    // Try ISO format first
    let date = parseISO(dateStr)

    // If invalid, try native Date parsing
    if (!isValid(date)) {
      date = new Date(dateStr)
    }

    if (!isValid(date)) {
      return dateStr // Return original if unparseable
    }

    return format(date, "MMM d, yyyy")
  } catch {
    return dateStr
  }
}

// ============================================
// Mini Icon Components
// ============================================

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  )
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
      />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  )
}

// ============================================
// Data Type Display Helpers
// ============================================

/**
 * Get alignment class for a data type.
 */
export function getAlignmentClass(dataType: DataType): string {
  switch (dataType) {
    case "number":
    case "currency":
      return "text-right"
    default:
      return "text-left"
  }
}

/**
 * Get font class for a data type.
 */
export function getFontClass(dataType: DataType): string {
  switch (dataType) {
    case "number":
    case "currency":
    case "date":
      return "tabular-nums"
    default:
      return ""
  }
}
