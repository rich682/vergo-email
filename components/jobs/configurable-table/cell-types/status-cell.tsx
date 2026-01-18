"use client"

import { useState, useRef, useEffect } from "react"
import { Check, ChevronDown } from "lucide-react"
import { createPortal } from "react-dom"

interface StatusOption {
  value: string
  label: string
  color: string
  bgColor: string
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: "NOT_STARTED", label: "Not Started", color: "text-gray-700", bgColor: "bg-gray-100" },
  { value: "IN_PROGRESS", label: "In Progress", color: "text-blue-700", bgColor: "bg-blue-100" },
  { value: "BLOCKED", label: "Blocked", color: "text-red-700", bgColor: "bg-red-100" },
  { value: "COMPLETE", label: "Complete", color: "text-green-700", bgColor: "bg-green-100" },
]

interface StatusCellProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function StatusCell({ value, onChange, className = "" }: StatusCellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Map legacy statuses
  const mapStatus = (status: string): string => {
    switch (status) {
      case "ACTIVE": return "NOT_STARTED"
      case "WAITING": return "IN_PROGRESS"
      case "COMPLETED": return "COMPLETE"
      case "ARCHIVED": return "COMPLETE"
      default: return status
    }
  }

  const displayStatus = mapStatus(value)
  const currentOption = STATUS_OPTIONS.find(opt => opt.value === displayStatus) || STATUS_OPTIONS[0]

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left
      })
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (newValue: string) => {
    onChange(newValue)
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${currentOption.bgColor} ${currentOption.color} hover:opacity-80 transition-opacity`}
      >
        {currentOption.label}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && typeof document !== "undefined" && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed w-36 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          style={{ 
            top: dropdownPosition.top, 
            left: dropdownPosition.left,
            zIndex: 9999 
          }}
        >
          {STATUS_OPTIONS.map((option) => {
            const dotColor = option.value === "NOT_STARTED" ? "bg-gray-400" 
              : option.value === "IN_PROGRESS" ? "bg-blue-500"
              : option.value === "BLOCKED" ? "bg-red-500"
              : "bg-green-500"
            return (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center justify-between"
              >
                <span className="inline-flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  {option.label}
                </span>
                {displayStatus === option.value && (
                  <Check className="w-4 h-4 text-gray-500" />
                )}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
