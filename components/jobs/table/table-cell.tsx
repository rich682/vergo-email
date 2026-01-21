"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Lock, Calculator, Paperclip, FileText } from "lucide-react"
import { format } from "date-fns"
import { TableColumn, ColumnEditPolicy } from "./schema-editor"

interface TableCellProps {
  column: TableColumn
  value: any
  rowIdentity: any
  onUpdate?: (rowIdentity: any, columnId: string, value: any) => void
  isSnapshot?: boolean
}

// Format value for display based on column type
function formatValue(value: any, column: TableColumn): string {
  if (value === null || value === undefined || value === "") return "—"

  switch (column.type) {
    case "currency":
    case "amount":
      const num = Number(value)
      if (isNaN(num)) return String(value)
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(num)

    case "percent":
      const pct = Number(value)
      if (isNaN(pct)) return String(value)
      return `${pct.toFixed(1)}%`

    case "number":
      const n = Number(value)
      if (isNaN(n)) return String(value)
      return new Intl.NumberFormat("en-US").format(n)

    case "date":
      try {
        const date = new Date(value)
        if (isNaN(date.getTime())) return String(value)
        return format(date, "MMM d, yyyy")
      } catch {
        return String(value)
      }

    case "status":
      return String(value).replace(/_/g, " ")

    default:
      return String(value)
  }
}

// Status options for status columns
const STATUS_OPTIONS = [
  { value: "UNVERIFIED", label: "Unverified", color: "bg-gray-100 text-gray-700" },
  { value: "VERIFIED", label: "Verified", color: "bg-green-100 text-green-700" },
  { value: "FLAGGED", label: "Flagged", color: "bg-red-100 text-red-700" },
  { value: "PENDING", label: "Pending", color: "bg-yellow-100 text-yellow-700" },
]

export function TableCell({ column, value, rowIdentity, onUpdate, isSnapshot }: TableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  const isEditable = column.editPolicy === "EDITABLE_COLLAB" && !isSnapshot && onUpdate

  // Reset edit value when value changes externally
  useEffect(() => {
    setEditValue(value)
  }, [value])

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = useCallback(() => {
    if (onUpdate && editValue !== value) {
      onUpdate(rowIdentity, column.id, editValue)
    }
    setIsEditing(false)
  }, [onUpdate, rowIdentity, column.id, editValue, value])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave()
    } else if (e.key === "Escape") {
      setEditValue(value)
      setIsEditing(false)
    }
  }, [handleSave, value])

  // READ_ONLY_IMPORTED: Gray background, lock icon
  if (column.editPolicy === "READ_ONLY_IMPORTED") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 rounded text-sm text-gray-700 group">
        <span className="flex-1 truncate">{formatValue(value, column)}</span>
        <Lock className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    )
  }

  // COMPUTED_ROW: Italic with formula icon
  if (column.editPolicy === "COMPUTED_ROW") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 rounded text-sm text-blue-700 italic group">
        <Calculator className="w-3 h-3 text-blue-400" />
        <span className="flex-1 truncate">{formatValue(value, column)}</span>
      </div>
    )
  }

  // SYSTEM_VARIANCE: Badge style (handled in compare view)
  if (column.editPolicy === "SYSTEM_VARIANCE") {
    return (
      <div className="px-2 py-1.5 text-sm text-gray-500">
        {formatValue(value, column)}
      </div>
    )
  }

  // EDITABLE_COLLAB: Editable cell
  if (column.editPolicy === "EDITABLE_COLLAB") {
    // Status type: dropdown
    if (column.type === "status") {
      return (
        <Select
          value={value || ""}
          onValueChange={(v) => {
            if (onUpdate) onUpdate(rowIdentity, column.id, v)
          }}
          disabled={isSnapshot}
        >
          <SelectTrigger className="h-8 text-sm border-transparent hover:border-gray-200">
            <SelectValue placeholder="Select...">
              {value && (
                <span className={`px-2 py-0.5 rounded text-xs ${
                  STATUS_OPTIONS.find(o => o.value === value)?.color || "bg-gray-100"
                }`}>
                  {STATUS_OPTIONS.find(o => o.value === value)?.label || value}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className={`px-2 py-0.5 rounded text-xs ${option.color}`}>
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    // Attachment type: show indicator
    if (column.type === "attachment") {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm">
          {value ? (
            <div className="flex items-center gap-1 text-blue-600 hover:underline cursor-pointer">
              <Paperclip className="w-3 h-3" />
              <span className="truncate">View attachment</span>
            </div>
          ) : (
            <button className="text-gray-400 hover:text-gray-600 text-xs flex items-center gap-1">
              <Paperclip className="w-3 h-3" />
              <span>Add</span>
            </button>
          )}
        </div>
      )
    }

    // Notes type: multiline hint
    if (column.type === "notes") {
      return (
        <div
          className={`px-2 py-1.5 text-sm cursor-pointer rounded transition-colors ${
            isEditing ? "bg-white" : "hover:bg-gray-50"
          }`}
          onClick={() => isEditable && setIsEditing(true)}
        >
          {isEditing ? (
            <textarea
              ref={inputRef as any}
              value={editValue || ""}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditValue(value)
                  setIsEditing(false)
                }
              }}
              className="w-full min-h-[60px] p-1 text-sm border rounded resize-none focus:ring-1 focus:ring-blue-500"
              placeholder="Add notes..."
            />
          ) : (
            <div className="flex items-start gap-1.5">
              <FileText className="w-3 h-3 text-gray-400 mt-0.5" />
              <span className={`flex-1 ${value ? "text-gray-700" : "text-gray-400 italic"}`}>
                {value || "Add notes..."}
              </span>
            </div>
          )}
        </div>
      )
    }

    // Date type: date input
    if (column.type === "date") {
      return (
        <div
          className={`px-2 py-1.5 text-sm cursor-pointer rounded transition-colors ${
            isEditing ? "bg-white" : "hover:bg-gray-50"
          }`}
        >
          {isEditing ? (
            <Input
              ref={inputRef}
              type="date"
              value={editValue || ""}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="h-7 text-sm"
            />
          ) : (
            <div
              onClick={() => isEditable && setIsEditing(true)}
              className={value ? "text-gray-700" : "text-gray-400 italic"}
            >
              {formatValue(value, column)}
            </div>
          )}
        </div>
      )
    }

    // Default: text/number input
    return (
      <div
        className={`px-2 py-1.5 text-sm cursor-pointer rounded transition-colors ${
          isEditing ? "bg-white" : "hover:bg-gray-50"
        }`}
      >
        {isEditing ? (
          <Input
            ref={inputRef}
            type={column.type === "number" || column.type === "currency" || column.type === "percent" || column.type === "amount" ? "number" : "text"}
            value={editValue ?? ""}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="h-7 text-sm"
            step={column.type === "percent" ? "0.1" : column.type === "currency" || column.type === "amount" ? "0.01" : undefined}
          />
        ) : (
          <div
            onClick={() => isEditable && setIsEditing(true)}
            className={value !== null && value !== undefined && value !== "" ? "text-gray-700" : "text-gray-400 italic"}
          >
            {formatValue(value, column)}
          </div>
        )}
      </div>
    )
  }

  // Fallback
  return (
    <div className="px-2 py-1.5 text-sm text-gray-700">
      {formatValue(value, column)}
    </div>
  )
}
