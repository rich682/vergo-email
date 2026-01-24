"use client"

/**
 * Owner Cell Editor
 * 
 * Dropdown to select a team member as owner.
 * Shows user avatar/initials with name.
 */

import { useState, useEffect } from "react"
import { Check, ChevronDown, Loader2, User } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

export interface TeamMember {
  id: string
  name: string | null
  email: string
}

interface OwnerCellProps {
  value: { userId: string } | null
  teamMembers: TeamMember[]
  rowIdentity: string
  onSave: (value: { userId: string } | null) => Promise<void>
  readOnly?: boolean
}

export function OwnerCell({
  value,
  teamMembers,
  rowIdentity,
  onSave,
  readOnly = false,
}: OwnerCellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const selectedMember = teamMembers.find((m) => m.id === value?.userId)

  // Filter team members by search query
  const filteredMembers = teamMembers.filter((m) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      m.name?.toLowerCase().includes(query) ||
      m.email.toLowerCase().includes(query)
    )
  })

  // Reset search when popover closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("")
    }
  }, [isOpen])

  const handleSelect = async (userId: string | null) => {
    if (userId === value?.userId) {
      setIsOpen(false)
      return
    }

    setIsSaving(true)
    try {
      await onSave(userId ? { userId } : null)
      setIsOpen(false)
    } catch (error) {
      console.error("Failed to save owner:", error)
    } finally {
      setIsSaving(false)
    }
  }

  if (readOnly) {
    return <OwnerBadge member={selectedMember} />
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={`
            w-full h-full flex items-center justify-between
            text-left px-1 rounded
            hover:bg-gray-100 transition-colors
            ${isSaving ? "opacity-50" : ""}
          `}
          disabled={isSaving}
        >
          <OwnerBadge member={selectedMember} />
          <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        {/* Search input */}
        {teamMembers.length > 5 && (
          <div className="p-2 border-b border-gray-100">
            <Input
              placeholder="Search team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 text-sm"
              autoFocus
            />
          </div>
        )}

        <div className="p-1 max-h-60 overflow-y-auto">
          {/* Clear option */}
          <button
            className={`
              w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded
              hover:bg-gray-100 transition-colors text-left
              ${!value?.userId ? "bg-gray-50" : ""}
            `}
            onClick={() => handleSelect(null)}
          >
            <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-3 h-3 text-gray-400" />
            </span>
            <span className="text-gray-500">Unassigned</span>
            {!value?.userId && (
              <Check className="w-3 h-3 ml-auto text-gray-500" />
            )}
          </button>

          {/* Team members */}
          {filteredMembers.map((member) => (
            <button
              key={member.id}
              className={`
                w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded
                hover:bg-gray-100 transition-colors text-left
                ${value?.userId === member.id ? "bg-gray-50" : ""}
              `}
              onClick={() => handleSelect(member.id)}
            >
              <UserAvatar name={member.name} email={member.email} />
              <div className="flex-1 min-w-0">
                <div className="truncate">
                  {member.name || member.email}
                </div>
                {member.name && (
                  <div className="text-xs text-gray-400 truncate">
                    {member.email}
                  </div>
                )}
              </div>
              {value?.userId === member.id && (
                <Check className="w-3 h-3 flex-shrink-0 text-gray-500" />
              )}
            </button>
          ))}

          {filteredMembers.length === 0 && searchQuery && (
            <div className="px-2 py-3 text-sm text-gray-500 text-center">
              No matching team members
            </div>
          )}

          {isSaving && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Owner badge display component
 */
function OwnerBadge({ member }: { member?: TeamMember }) {
  if (!member) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-400 italic">
        <User className="w-3.5 h-3.5" />
        Unassigned
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 text-xs">
      <UserAvatar name={member.name} email={member.email} size="sm" />
      <span className="truncate">{member.name || member.email}</span>
    </span>
  )
}

/**
 * User avatar with initials
 */
function UserAvatar({
  name,
  email,
  size = "md",
}: {
  name: string | null
  email: string
  size?: "sm" | "md"
}) {
  const initials = getInitials(name, email)
  const bgColor = getAvatarColor(email)

  const sizeClasses = size === "sm" 
    ? "w-5 h-5 text-[10px]" 
    : "w-6 h-6 text-xs"

  return (
    <span
      className={`
        rounded-full flex items-center justify-center
        font-medium text-white flex-shrink-0
        ${sizeClasses}
      `}
      style={{ backgroundColor: bgColor }}
    >
      {initials}
    </span>
  )
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function getAvatarColor(email: string): string {
  // Generate a consistent color based on email
  const colors = [
    "#3B82F6", // blue
    "#10B981", // green
    "#F59E0B", // amber
    "#EF4444", // red
    "#8B5CF6", // purple
    "#EC4899", // pink
    "#06B6D4", // cyan
    "#F97316", // orange
  ]
  
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  return colors[Math.abs(hash) % colors.length]
}

export { OwnerBadge, UserAvatar }
