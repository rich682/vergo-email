"use client"

import { useState, useRef, useEffect } from "react"
import { Check, ChevronDown, User } from "lucide-react"

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
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
  const label = displayName || displayEmail

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
      >
        <div 
          className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700"
          title={label}
        >
          {initials}
        </div>
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search team members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filteredMembers.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No team members found</div>
            ) : (
              filteredMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleSelect(member.id)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
                      {getInitials(member.name, member.email)}
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
                  {value === member.id && (
                    <Check className="w-4 h-4 text-blue-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
