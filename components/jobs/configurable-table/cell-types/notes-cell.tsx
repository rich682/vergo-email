"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { FileText } from "lucide-react"
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
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setEditValue(value || "")
  }, [value])

  // Calculate position when opening
  useEffect(() => {
    if (isEditing && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left
      })
      // Focus textarea after portal renders
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [isEditing])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        popoverRef.current && !popoverRef.current.contains(e.target as Node)
      ) {
        handleSave()
      }
    }
    if (isEditing) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isEditing, editValue])

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

  return (
    <>
      <button
        ref={buttonRef}
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

      {isEditing && typeof document !== "undefined" && createPortal(
        <div 
          ref={popoverRef}
          className="fixed w-72 bg-white border border-gray-200 rounded-lg shadow-xl p-3"
          style={{ 
            top: position.top, 
            left: position.left,
            zIndex: 9999 
          }}
        >
          <Textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add notes..."
            className="min-h-[100px] text-sm resize-none"
          />
          <div className="flex justify-end gap-2 mt-3">
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
        </div>,
        document.body
      )}
    </>
  )
}
