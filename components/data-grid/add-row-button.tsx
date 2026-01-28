"use client"

/**
 * Add Row Button
 * 
 * Button that opens the formula editor modal to add a formula row.
 * All rows are formula rows in the Monday.com style.
 */

import { Plus } from "lucide-react"

export type AppRowType = "formula"

interface AddRowButtonProps {
  /** Callback when clicked - opens formula editor modal */
  onFormulaSelect: () => void
  disabled?: boolean
}

export function AddRowButton({ onFormulaSelect, disabled }: AddRowButtonProps) {
  const handleClick = () => {
    if (disabled) return
    onFormulaSelect()
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
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
      <Plus className="w-4 h-4 mr-1" />
      <span className="text-sm">Add Row</span>
    </button>
  )
}
