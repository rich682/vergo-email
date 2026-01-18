"use client"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"

interface TextCellProps {
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function TextCell({ value, onChange, placeholder = "", className = "" }: TextCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value || "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditValue(value || "")
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    if (editValue !== value) {
      onChange(editValue)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave()
    } else if (e.key === "Escape") {
      setEditValue(value || "")
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`h-8 text-sm ${className}`}
      />
    )
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`min-h-[32px] py-1.5 px-2 rounded cursor-text hover:bg-gray-50 transition-colors ${className}`}
    >
      {value ? (
        <span className="text-sm text-gray-900">{value}</span>
      ) : (
        <span className="text-sm text-gray-400">{placeholder || "Click to edit"}</span>
      )}
    </div>
  )
}
