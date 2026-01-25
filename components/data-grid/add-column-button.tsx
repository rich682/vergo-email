"use client"

/**
 * Add Column Button
 * 
 * Simple button that adds a new text column directly.
 * User can then double-click the column header to rename it.
 */

import { useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export type AppColumnType = "text"

interface AddColumnButtonProps {
  onAddColumn: (type: AppColumnType, label: string) => Promise<void>
  /** Callback when formula type is selected - opens formula editor */
  onFormulaSelect?: () => void
  disabled?: boolean
  variant?: "header" | "button"
}

export function AddColumnButton({ onAddColumn, disabled, variant = "button" }: AddColumnButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleClick = async () => {
    if (isSubmitting || disabled) return
    
    setIsSubmitting(true)
    try {
      // Create a new text column with default name
      // User can double-click to rename
      await onAddColumn("text", "New Column")
    } catch (err) {
      console.error("Failed to add column:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (variant === "header") {
    return (
      <button
        onClick={handleClick}
        disabled={disabled || isSubmitting}
        className={`
          flex items-center justify-center
          w-9 h-8
          text-gray-400 hover:text-gray-600 hover:bg-gray-200
          rounded
          transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        title="Add column"
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
      </button>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled || isSubmitting}
      className="h-8"
    >
      {isSubmitting ? (
        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
      ) : (
        <Plus className="w-4 h-4 mr-1" />
      )}
      Add Column
    </Button>
  )
}
