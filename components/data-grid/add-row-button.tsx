"use client"

/**
 * Add Row Button
 * 
 * Simple button that adds a new text row directly.
 * User can then double-click the row label to rename it.
 */

import { useState } from "react"
import { Plus, Loader2 } from "lucide-react"

export type AppRowType = "text"

interface AddRowButtonProps {
  onAddRow: (type: AppRowType, label: string) => Promise<void>
  /** Callback when formula type is selected - opens formula editor */
  onFormulaSelect?: () => void
  disabled?: boolean
}

export function AddRowButton({ onAddRow, disabled }: AddRowButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleClick = async () => {
    if (isSubmitting || disabled) return
    
    setIsSubmitting(true)
    try {
      // Create a new text row with default name
      // User can double-click to rename
      await onAddRow("text", "New Row")
    } catch (err) {
      console.error("Failed to add row:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isSubmitting}
      className={`
        flex items-center justify-center
        w-full h-8
        text-gray-400 hover:text-gray-600 hover:bg-gray-100
        border border-dashed border-gray-300 hover:border-gray-400
        rounded
        transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {isSubmitting ? (
        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
      ) : (
        <Plus className="w-4 h-4 mr-1" />
      )}
      <span className="text-sm">Add Row</span>
    </button>
  )
}
