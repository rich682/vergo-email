"use client"

/**
 * Cell Renderers
 *
 * Type-based cell rendering for the DataGrid.
 * Maps CellValue.type to appropriate display components.
 * Shows interactive elements for app columns on hover.
 */

import type { CellValue, DataType, ColumnDefinition } from "@/lib/data-grid/types"
import { format, parseISO, isValid } from "date-fns"
import { Plus, FileText } from "lucide-react"

// ============================================
// Cell Renderer Component
// ============================================

interface CellRendererProps {
  value: CellValue
  className?: string
  column?: ColumnDefinition
  isHovered?: boolean
  isAppColumn?: boolean
  isFirstColumn?: boolean
}

/**
 * Render a CellValue based on its type.
 * Shows interactive hints for app columns.
 * First column is left-aligned and bold, others are centered.
 */
export function CellRenderer({ 
  value, 
  className = "", 
  column,
  isHovered = false,
  isAppColumn = false,
  isFirstColumn = false,
}: CellRendererProps) {
  // First column: left-aligned, others: centered (alignment is handled by parent, but text-align matters for truncate)
  const textAlign = isFirstColumn ? "text-left" : "text-center"
  const baseClass = `truncate w-full ${textAlign}`

  switch (value.type) {
    case "empty":
      // Show interactive hints for empty app columns
      if (isAppColumn && isHovered) {
        return <EmptyAppColumnCell dataType={column?.dataType} />
      }
      return (
        <span className={`${baseClass} text-gray-300 ${className}`}>—</span>
      )

    case "text":
      return (
        <span className={`${baseClass} ${className}`} title={value.value}>
          {value.value || (isAppColumn && isHovered ? <EmptyAppColumnCell dataType="text" /> : null)}
        </span>
      )

    case "number":
      return (
        <span className={`${baseClass} tabular-nums ${className}`}>
          {value.value.toLocaleString()}
        </span>
      )

    case "currency":
      return (
        <span className={`${baseClass} tabular-nums ${className}`}>
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

    // App column types with interactive rendering
    case "attachment":
      if (value.value.length === 0) {
        return (
          <span className="flex items-center justify-center w-full">
            <button className="p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
            <FileText className="w-4 h-4 text-gray-300 ml-1" />
          </span>
        )
      }
      return (
        <span className={`${baseClass} text-blue-600 ${className}`}>
          <span className="inline-flex items-center">
            <PaperclipIcon className="w-3.5 h-3.5 mr-1" />
            {value.value.length} file{value.value.length !== 1 ? "s" : ""}
          </span>
        </span>
      )

    case "label":
      if (value.value.length === 0) {
        return <EmptyAppColumnCell dataType="status" />
      }
      return (
        <span className={`${baseClass} ${className}`}>
          <span className="inline-flex gap-1 flex-wrap">
            {value.value.slice(0, 2).map((label, i) => (
              <span
                key={i}
                className="inline-block px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded-full font-medium"
              >
                {label}
              </span>
            ))}
            {value.value.length > 2 && (
              <span className="text-xs text-gray-500">
                +{value.value.length - 2}
              </span>
            )}
          </span>
        </span>
      )

    case "user":
      return (
        <span className={`${baseClass} ${className}`}>
          <span className="inline-flex items-center">
            <UserAvatar name={value.value.display} />
            <span className="ml-1.5 truncate">{value.value.display}</span>
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
      return <span className={`${baseClass} text-gray-300 ${className}`}>—</span>
  }
}

// ============================================
// Empty App Column Cell (interactive hint)
// ============================================

function EmptyAppColumnCell({ dataType }: { dataType?: DataType | string }) {
  switch (dataType) {
    case "attachment":
      return (
        <span className="flex items-center justify-center w-full gap-1">
          <button className="p-1 rounded-full bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <FileText className="w-4 h-4 text-gray-300" />
        </span>
      )
    case "user":
      return (
        <span className="flex items-center text-gray-400 text-sm">
          <UserIcon className="w-4 h-4 mr-1" />
          <span className="text-xs">Assign</span>
        </span>
      )
    case "status":
      return (
        <span className="text-gray-400 text-xs">Select status</span>
      )
    case "text":
    default:
      return (
        <span className="text-gray-400 text-xs italic">Click to edit</span>
      )
  }
}

// ============================================
// User Avatar Component
// ============================================

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  // Generate color from name
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
  ]
  const colorIndex = name.charCodeAt(0) % colors.length
  const bgColor = colors[colorIndex]

  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-medium flex-shrink-0 ${bgColor}`}
    >
      {initials || "?"}
    </span>
  )
}

// ============================================
// Date Formatting
// ============================================

function formatDateValue(dateStr: string): string {
  if (!dateStr) return "—"

  try {
    let date = parseISO(dateStr)
    if (!isValid(date)) {
      date = new Date(dateStr)
    }
    if (!isValid(date)) {
      return dateStr
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
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

// ============================================
// Data Type Display Helpers
// ============================================

export function getAlignmentClass(dataType: DataType): string {
  switch (dataType) {
    case "number":
    case "currency":
      return "text-right"
    default:
      return "text-left"
  }
}

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
