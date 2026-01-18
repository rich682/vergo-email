"use client"

import { useState, useRef, useEffect } from "react"
import { Check, ChevronDown } from "lucide-react"
import { createPortal } from "react-dom"

interface TeamMember {
  id: string
  name: string | null
  email: string
}

interface PersonCellProps {
  value: string | null // userId
  displayName: string | null
  displayEmail: string
  teamMembers: TeamMember[]
  onChange: (userId: string) => void
  className?: string
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0]?.[0]?.toUpperCase() || email[0]?.toUpperCase() || "?"
  }
  return email[0]?.toUpperCase() || "?"
}

// Generate a consistent color based on name/email
function getAvatarColor(name: string | null, email: string): string {
  const str = name || email
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-green-100 text-green-700",
    "bg-purple-100 text-purple-700",
    "bg-amber-100 text-amber-700",
    "bg-pink-100 text-pink-700",
    "bg-cyan-100 text-cyan-700",
    "bg-indigo-100 text-indigo-700",
    "bg-rose-100 text-rose-700",
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export function PersonCell({ 
  value, 
  displayName, 
  displayEmail, 
  teamMembers, 
  onChange, 
  className = "" 
}: PersonCellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left
      })
      // Focus the search input after portal renders
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (userId: string) => {
    onChange(userId)
    setIsOpen(false)
    setSearch("")
  }

  const filteredMembers = teamMembers.filter(m => 
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  )

  const initials = getInitials(displayName, displayEmail)
  const avatarColor = getAvatarColor(displayName, displayEmail)
  const shortName = displayName?.split(" ")[0] || displayEmail.split("@")[0]

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
      >
        <div 
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${avatarColor}`}
          title={displayName || displayEmail}
        >
          {initials}
        </div>
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>

      {isOpen && typeof document !== "undefined" && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed w-64 bg-white border border-gray-200 rounded-lg shadow-lg"
          style={{ 
            top: dropdownPosition.top, 
            left: dropdownPosition.left,
            zIndex: 9999 
          }}
        >
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search team members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filteredMembers.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                {teamMembers.length === 0 
                  ? "No team members available" 
                  : `No results for "${search}"`
                }
              </div>
            ) : (
              filteredMembers.map((member) => {
                const memberInitials = getInitials(member.name, member.email)
                const memberColor = getAvatarColor(member.name, member.email)
                const isSelected = value === member.id
                
                return (
                  <button
                    key={member.id}
                    onClick={() => handleSelect(member.id)}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between ${isSelected ? "bg-blue-50" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${memberColor}`}>
                        {memberInitials}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {member.name || member.email}
                        </div>
                        {member.name && (
                          <div className="text-xs text-gray-500">{member.email}</div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
