"use client"

/**
 * Status Cell Editor
 * 
 * Dropdown selector with colored status badges.
 * Click to open dropdown, select to save.
 */

import { useState } from "react"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface StatusOption {
  key: string
  label: string
  color: string
}

interface StatusCellProps {
  value: { statusKey: string } | null
  options: StatusOption[]
  rowIdentity: string
  onSave: (value: { statusKey: string } | null) => Promise<void>
  readOnly?: boolean
}

export function StatusCell({
  value,
  options,
  rowIdentity,
  onSave,
  readOnly = false,
}: StatusCellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const selectedOption = options.find((o) => o.key === value?.statusKey)

  const handleSelect = async (statusKey: string | null) => {
    if (statusKey === value?.statusKey) {
      setIsOpen(false)
      return
    }

    setIsSaving(true)
    try {
      await onSave(statusKey ? { statusKey } : null)
      setIsOpen(false)
    } catch (error) {
      console.error("Failed to save status:", error)
    } finally {
      setIsSaving(false)
    }
  }

  if (readOnly) {
    return (
      <StatusBadge option={selectedOption} />
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={`
            w-full h-full flex items-center justify-between
            text-left px-1 rounded
            hover:bg-gray-100 transition-colors
            ${isSaving ? "opacity-50" : ""}
          `}
          disabled={isSaving}
        >
          <StatusBadge option={selectedOption} />
          <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start">
        {/* Clear option */}
        <button
          className={`
            w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded
            hover:bg-gray-100 transition-colors text-left
            ${!value?.statusKey ? "bg-gray-50" : ""}
          `}
          onClick={() => handleSelect(null)}
        >
          <span className="w-3 h-3 rounded-full bg-gray-200" />
          <span className="text-gray-500">None</span>
          {!value?.statusKey && (
            <Check className="w-3 h-3 ml-auto text-gray-500" />
          )}
        </button>

        {/* Status options */}
        {options.map((option) => (
          <button
            key={option.key}
            className={`
              w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded
              hover:bg-gray-100 transition-colors text-left
              ${value?.statusKey === option.key ? "bg-gray-50" : ""}
            `}
            onClick={() => handleSelect(option.key)}
          >
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: option.color }}
            />
            <span className="truncate">{option.label}</span>
            {value?.statusKey === option.key && (
              <Check className="w-3 h-3 ml-auto text-gray-500" />
            )}
          </button>
        ))}

        {isSaving && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Status badge display component
 */
function StatusBadge({ option }: { option?: StatusOption }) {
  if (!option) {
    return (
      <span className="text-sm text-gray-400 italic">
        No status
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: `${option.color}20`,
        color: option.color,
      }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: option.color }}
      />
      {option.label}
    </span>
  )
}

export { StatusBadge }
