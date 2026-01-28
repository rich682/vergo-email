"use client"

/**
 * Add Column Button
 * 
 * Button that opens the formula editor modal to add a formula column.
 * All columns are formula columns in the Monday.com style.
 */

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

export type AppColumnType = "formula"

interface AddColumnButtonProps {
  /** Callback when clicked - opens formula editor modal */
  onFormulaSelect: () => void
  disabled?: boolean
  variant?: "header" | "button"
}

export function AddColumnButton({ onFormulaSelect, disabled, variant = "button" }: AddColumnButtonProps) {
  const handleClick = () => {
    if (disabled) return
    onFormulaSelect()
  }

  if (variant === "header") {
    return (
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`
          flex items-center justify-center
          w-9 h-8
          text-gray-400 hover:text-gray-600 hover:bg-gray-200
          rounded
          transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        title="Add formula column"
      >
        <Plus className="w-4 h-4" />
      </button>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      className="h-8"
    >
      <Plus className="w-4 h-4 mr-1" />
      Add Column
    </Button>
  )
}
