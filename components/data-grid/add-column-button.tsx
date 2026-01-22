"use client"

/**
 * Add Column Button
 * 
 * Renders a "+ Add Column" button that opens a popover
 * with column type selection options.
 */

import { useState } from "react"
import { Plus, Type, CheckCircle, Paperclip, User } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type AppColumnType = "text" | "status" | "attachment" | "user"

interface ColumnTypeOption {
  type: AppColumnType
  label: string
  description: string
  icon: React.ReactNode
}

const COLUMN_TYPES: ColumnTypeOption[] = [
  {
    type: "text",
    label: "Notes",
    description: "Free text field for notes or comments",
    icon: <Type className="w-4 h-4" />,
  },
  {
    type: "status",
    label: "Status",
    description: "Status dropdown with colored badges",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  {
    type: "user",
    label: "Owner",
    description: "Assign a team member",
    icon: <User className="w-4 h-4" />,
  },
  {
    type: "attachment",
    label: "Attachments",
    description: "Attach files to this row",
    icon: <Paperclip className="w-4 h-4" />,
  },
]

interface AddColumnButtonProps {
  onAddColumn: (type: AppColumnType, label: string) => Promise<void>
  disabled?: boolean
}

export function AddColumnButton({ onAddColumn, disabled }: AddColumnButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<AppColumnType | null>(null)
  const [label, setLabel] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelectType = (type: AppColumnType) => {
    setSelectedType(type)
    // Pre-fill label with default
    const defaultLabel = COLUMN_TYPES.find((t) => t.type === type)?.label || ""
    setLabel(defaultLabel)
    setError(null)
  }

  const handleBack = () => {
    setSelectedType(null)
    setLabel("")
    setError(null)
  }

  const handleSubmit = async () => {
    if (!selectedType || !label.trim()) return

    setIsSubmitting(true)
    setError(null)

    try {
      await onAddColumn(selectedType, label.trim())
      setIsOpen(false)
      setSelectedType(null)
      setLabel("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add column")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      // Reset state on close
      setSelectedType(null)
      setLabel("")
      setError(null)
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={`
            flex items-center justify-center
            px-3 py-2 h-full min-w-[100px]
            text-xs text-gray-500
            bg-gray-50 hover:bg-gray-100
            border-r border-gray-300
            transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Column
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {selectedType === null ? (
          // Type selection screen
          <div className="p-2">
            <div className="text-sm font-medium text-gray-700 px-2 py-1.5 mb-1">
              Add Column
            </div>
            {COLUMN_TYPES.map((option) => (
              <button
                key={option.type}
                className={`
                  w-full flex items-start gap-3 px-2 py-2.5 rounded
                  hover:bg-gray-100 transition-colors text-left
                `}
                onClick={() => handleSelectType(option.type)}
              >
                <span className="text-gray-600 mt-0.5">{option.icon}</span>
                <div>
                  <div className="text-sm font-medium text-gray-800">
                    {option.label}
                  </div>
                  <div className="text-xs text-gray-500">{option.description}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          // Label input screen
          <div className="p-4">
            <button
              className="text-xs text-gray-500 hover:text-gray-700 mb-3 flex items-center"
              onClick={handleBack}
            >
              ← Back
            </button>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-gray-600">
                {COLUMN_TYPES.find((t) => t.type === selectedType)?.icon}
              </span>
              <span className="text-sm font-medium text-gray-800">
                {COLUMN_TYPES.find((t) => t.type === selectedType)?.label} Column
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="column-label" className="text-xs">
                  Column Name
                </Label>
                <Input
                  id="column-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Enter column name"
                  className="mt-1 h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && label.trim()) {
                      handleSubmit()
                    }
                  }}
                />
              </div>
              {error && (
                <div className="text-xs text-red-600">{error}</div>
              )}
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                onClick={handleSubmit}
                disabled={!label.trim() || isSubmitting}
              >
                {isSubmitting ? "Adding..." : "Add Column"}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
