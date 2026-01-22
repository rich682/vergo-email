"use client"

/**
 * Notes Cell Editor
 * 
 * Expandable textarea for free text notes.
 * Click to edit, press Enter to save, Escape to cancel.
 */

import { useState, useRef, useEffect } from "react"
import { Loader2 } from "lucide-react"

interface NotesCellProps {
  value: { text: string } | null
  rowIdentity: string
  onSave: (value: { text: string }) => Promise<void>
  readOnly?: boolean
}

export function NotesCell({
  value,
  rowIdentity,
  onSave,
  readOnly = false,
}: NotesCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value?.text || "")
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const displayText = value?.text || ""

  // Auto-focus and select text when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = () => {
    if (readOnly) return
    setEditValue(displayText)
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (editValue === displayText) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    try {
      await onSave({ text: editValue })
      setIsEditing(false)
    } catch (error) {
      console.error("Failed to save note:", error)
      // Keep editing on error
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setEditValue(displayText)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      handleCancel()
    }
  }

  if (isEditing) {
    return (
      <div className="w-full h-full relative">
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          disabled={isSaving}
          className={`
            w-full h-full min-h-[60px] px-1 py-0.5
            text-sm resize-none
            border border-blue-500 rounded
            focus:outline-none focus:ring-1 focus:ring-blue-500
            bg-white
            ${isSaving ? "opacity-50" : ""}
          `}
          placeholder="Enter notes..."
        />
        {isSaving && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`
        w-full h-full truncate text-sm
        ${!readOnly ? "cursor-text hover:bg-blue-50" : ""}
        ${!displayText ? "text-gray-400 italic" : ""}
      `}
      onClick={handleStartEdit}
      title={displayText || (readOnly ? "No notes" : "Click to add notes")}
    >
      {displayText || (readOnly ? "-" : "Click to add notes")}
    </div>
  )
}
