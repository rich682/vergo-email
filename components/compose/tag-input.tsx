/**
 * Tag Input Component
 * 
 * Text input/textarea with tag insertion support via "/" trigger and dropdown.
 * Supports inserting {{Tag Name}} syntax at cursor position.
 */

"use client"

import { useState, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface TagInputProps {
  value: string
  onChange: (value: string) => void
  availableTags: string[]
  placeholder?: string
  multiline?: boolean
  rows?: number
  className?: string
}

export function TagInput({
  value,
  onChange,
  availableTags,
  placeholder,
  multiline = false,
  rows = 4,
  className = ""
}: TagInputProps) {
  const [tagInsertPosition, setTagInsertPosition] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const [selectOpen, setSelectOpen] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Detect "/" key press to trigger tag insertion
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && availableTags.length > 0) {
      e.preventDefault()
      const target = e.target as HTMLInputElement | HTMLTextAreaElement
      const cursorPos = target.selectionStart || 0
      setTagInsertPosition(cursorPos)
      // Open dropdown for tag selection
      setSelectOpen(true)
    }
  }

  const handleTagInsert = (tag: string, position?: number) => {
    const insertPos = position ?? tagInsertPosition ?? value.length
    const tagSyntax = `{{${tag}}}`
    const before = position !== undefined ? value.substring(0, position - 1) : value.substring(0, insertPos - 1) // Remove the "/" if present
    const after = position !== undefined ? value.substring(position) : value.substring(insertPos)
    const newValue = before + tagSyntax + after
    
    onChange(newValue)
    setTagInsertPosition(null)
    setSelectOpen(false)

    // Set cursor position after inserted tag
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = before.length + tagSyntax.length
        inputRef.current.focus()
        if (inputRef.current.setSelectionRange) {
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      }
    }, 0)
  }

  const InputComponent = multiline ? Textarea : Input

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex-1">
          <InputComponent
            ref={inputRef as any}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={multiline ? rows : undefined}
            className={className}
          />
        </div>
        {availableTags.length > 0 && (
          <Select
            open={selectOpen}
            onOpenChange={setSelectOpen}
            onValueChange={(tag) => {
              const cursorPos = inputRef.current?.selectionStart || value.length
              handleTagInsert(tag, tagInsertPosition ?? cursorPos)
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Insert tag" />
            </SelectTrigger>
            <SelectContent>
              {availableTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {`{{${tag}}}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {availableTags.length > 0 && (
        <p className="text-xs text-gray-500 mt-1">
          Type "/" or use dropdown to insert tags
        </p>
      )}
    </div>
  )
}


