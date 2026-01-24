"use client"

import { useState, useRef, useEffect } from "react"
import { Calendar, X } from "lucide-react"
import { format, parseISO, isValid } from "date-fns"

interface DateCellProps {
  value: string | null // ISO date string
  onChange: (value: string | null) => void
  className?: string
}

export function DateCell({ value, onChange, className = "" }: DateCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse date for display - extract just the date part to avoid timezone shifts
  const parseDateForDisplay = (dateStr: string): Date | null => {
    const datePart = dateStr.split("T")[0]
    const [year, month, day] = datePart.split("-").map(Number)
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null
    return new Date(year, month - 1, day)
  }
  
  const parsedDate = value ? parseDateForDisplay(value) : null
  const isValidDate = parsedDate && isValid(parsedDate)
  const displayValue = isValidDate ? format(parsedDate, "MMM d") : null
  const inputValue = value ? value.split("T")[0] : "" // Use date part directly for input

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsEditing(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    if (newValue) {
      // Convert to ISO string with time preserved
      const date = new Date(newValue + "T12:00:00")
      onChange(date.toISOString())
    } else {
      onChange(null)
    }
    setIsEditing(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }

  if (isEditing) {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        <input
          ref={inputRef}
          type="date"
          value={inputValue}
          onChange={handleChange}
          onBlur={() => setIsEditing(false)}
          className="h-8 px-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className={className}>
      <button
        onClick={() => setIsEditing(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-50 transition-colors group"
      >
        <Calendar className="w-4 h-4 text-gray-400" />
        {displayValue ? (
          <>
            <span className="text-sm text-gray-700">{displayValue}</span>
            <button
              onClick={handleClear}
              className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 rounded hover:bg-gray-200 transition-opacity"
            >
              <X className="w-3 h-3 text-gray-400" />
            </button>
          </>
        ) : (
          <span className="text-sm text-gray-400">Set date</span>
        )}
      </button>
    </div>
  )
}
