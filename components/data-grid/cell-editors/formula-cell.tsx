"use client"

/**
 * Formula Cell Editor
 *
 * Allows editing cells with Excel-style formulas.
 * When user types = as the first character, enters formula mode.
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { FunctionSquare } from "lucide-react"
import { isFormula, parseCellFormula } from "@/lib/formula"

interface FormulaCellEditorProps {
  value: string | number
  formula?: string
  cellRef: string
  isFormulaCell: boolean
  onSave: (value: string, isFormula: boolean) => Promise<void>
  onCancel: () => void
}

export function FormulaCellEditor({
  value,
  formula,
  cellRef,
  isFormulaCell,
  onSave,
  onCancel,
}: FormulaCellEditorProps) {
  // Start with formula if it exists, otherwise the display value
  const [inputValue, setInputValue] = useState(
    isFormulaCell && formula ? formula : String(value ?? "")
  )
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  const handleSave = useCallback(async () => {
    const trimmed = inputValue.trim()
    
    if (trimmed === "") {
      // Empty value - clear any formula
      await onSave("", false)
      return
    }
    
    if (isFormula(trimmed)) {
      // Validate formula syntax
      const result = parseCellFormula(trimmed)
      if (!result.ok) {
        setError(result.error)
        return
      }
      await onSave(trimmed, true)
    } else {
      // Regular value
      await onSave(trimmed, false)
    }
  }, [inputValue, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }, [handleSave, onCancel])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setError(null)
  }, [])

  const showFormulaHint = inputValue.startsWith("=")

  return (
    <div className="relative w-full h-full">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className={`
          w-full h-full px-1 text-xs
          border rounded outline-none text-center
          ${error ? "border-red-500 bg-red-50" : "border-blue-500"}
          ${showFormulaHint ? "font-mono" : ""}
        `}
        placeholder={`${cellRef}`}
      />
      {showFormulaHint && (
        <div className="absolute -top-5 left-0 flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1 rounded">
          <FunctionSquare className="w-3 h-3" />
          Formula
        </div>
      )}
      {error && (
        <div className="absolute top-full left-0 mt-1 text-[10px] text-red-600 bg-red-50 px-1 rounded whitespace-nowrap z-50">
          {error}
        </div>
      )}
    </div>
  )
}

/**
 * Formula Cell Display
 * Shows a cell value with formula indicator if applicable.
 */
interface FormulaCellDisplayProps {
  value: string | number
  isFormulaCell: boolean
  isFirstColumn: boolean
  onClick: () => void
}

export function FormulaCellDisplay({
  value,
  isFormulaCell,
  isFirstColumn,
  onClick,
}: FormulaCellDisplayProps) {
  const alignClass = isFirstColumn ? "text-left" : "text-center"
  
  return (
    <div
      className={`
        w-full h-full flex items-center cursor-pointer
        ${isFirstColumn ? "justify-start" : "justify-center"}
        ${isFormulaCell ? "relative" : ""}
      `}
      onClick={onClick}
    >
      <span className={`truncate ${alignClass}`}>
        {value}
      </span>
      {isFormulaCell && (
        <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-t-blue-500 border-l-[6px] border-l-transparent" />
      )}
    </div>
  )
}
