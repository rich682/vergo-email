"use client"

import { useState, useRef, useEffect } from "react"
import { FileText, X } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

interface NotesCellProps {
  value: string | null
  onChange: (value: string | null) => void
  className?: string
}

export function NotesCell({ value, onChange, className = "" }: NotesCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value || "")
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setEditValue(value || "")
  }, [value])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleSave()
      }
    }
    if (isEditing) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isEditing, editValue])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(editValue.length, editValue.length)
    }
  }, [isEditing])

  const handleSave = () => {
    const trimmedValue = editValue.trim()
    if (trimmedValue !== (value || "")) {
      onChange(trimmedValue || null)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setEditValue(value || "")
      setIsEditing(false)
    }
    // Allow Shift+Enter for new lines, Enter alone saves
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }

  // Truncate display value
  const displayValue = value && value.length > 50 ? value.substring(0, 50) + "..." : value

  if (isEditing) {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        <div className="absolute left-0 top-0 z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
          <Textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add notes..."
            className="min-h-[80px] text-sm resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditValue(value || "")
                setIsEditing(false)
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-50 transition-colors text-left ${className}`}
    >
      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
      {displayValue ? (
        <span className="text-sm text-gray-700 truncate max-w-[150px]">{displayValue}</span>
      ) : (
        <span className="text-sm text-gray-400">Add notes</span>
      )}
    </button>
  )
}
