"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { X, Users, Building2, User } from "lucide-react"

export type SelectedRecipient = {
  id: string
  name: string
  type: "entity" | "group" | "contactType"
  email?: string | null
  entityCount?: number // For groups and contact types
}

interface RecipientSelectorProps {
  selectedRecipients: SelectedRecipient[]
  onRecipientsChange: (recipients: SelectedRecipient[]) => void
  requireContacts?: boolean
  mode?: "stakeholders" | "groups" // stakeholders = contacts + types, groups = only groups
  label?: string
  placeholder?: string
}

export function RecipientSelector({
  selectedRecipients,
  onRecipientsChange,
  requireContacts = false,
  mode = "stakeholders",
  label,
  placeholder
}: RecipientSelectorProps) {
  const [input, setInput] = useState("")
  const [searchResults, setSearchResults] = useState<{
    entities: Array<{ id: string; firstName: string; email: string }>
    groups: Array<{ id: string; name: string; entityCount: number; color: string | null }>
    contactTypes: Array<{ id: string; name: string; description: string; entityCount: number }>
  }>({ entities: [], groups: [], contactTypes: [] })
  const [showResults, setShowResults] = useState(false)
  const [hasContacts, setHasContacts] = useState(true)
  const [hasFocused, setHasFocused] = useState(false) // Track if user has focused the input
  const router = useRouter()
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Check if contacts exist on mount
  useEffect(() => {
    const checkContacts = async () => {
      try {
        const response = await fetch("/api/recipients/search?q=")
        if (response.ok) {
          const data = await response.json()
          const totalContacts = (data.entities?.length || 0) + (data.groups?.length || 0) + (data.contactTypes?.length || 0)
          setHasContacts(totalContacts > 0)
        }
      } catch (error) {
        console.error("Error checking contacts:", error)
      }
    }
    checkContacts()
  }, [])

  // Search for contacts/groups/types - only after user has focused
  useEffect(() => {
    if (!hasFocused) return // Don't search until user has focused the input
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    const query = input.trim()
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/recipients/search?q=${encodeURIComponent(query)}`)
        if (response.ok) {
          const data = await response.json()
          setSearchResults(data)
          setShowResults(true)
        }
      } catch (error) {
        console.error("Error searching recipients:", error)
      }
    }, query.length < 1 ? 150 : 300)
  }, [input, hasFocused])

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const addEntity = (entity: { id: string; firstName: string; email: string }) => {
    if (selectedRecipients.some(r => r.id === entity.id && r.type === "entity")) return
    
    const recipient: SelectedRecipient = {
      id: entity.id,
      name: entity.firstName,
      type: "entity",
      email: entity.email
    }
    onRecipientsChange([...selectedRecipients, recipient])
    setInput("")
    setShowResults(false)
  }

  const addGroup = (group: { id: string; name: string; entityCount: number }) => {
    if (selectedRecipients.some(r => r.id === group.id && r.type === "group")) return
    
    const recipient: SelectedRecipient = {
      id: group.id,
      name: group.name,
      type: "group",
      entityCount: group.entityCount
    }
    onRecipientsChange([...selectedRecipients, recipient])
    setInput("")
    setShowResults(false)
  }

  const addContactType = (contactType: { id: string; name: string; entityCount: number }) => {
    if (selectedRecipients.some(r => r.id === contactType.id && r.type === "contactType")) return
    
    const recipient: SelectedRecipient = {
      id: contactType.id,
      name: contactType.name,
      type: "contactType",
      entityCount: contactType.entityCount
    }
    onRecipientsChange([...selectedRecipients, recipient])
    setInput("")
    setShowResults(false)
  }

  const removeRecipient = (id: string, type: "entity" | "group" | "contactType") => {
    onRecipientsChange(selectedRecipients.filter((r) => !(r.id === id && r.type === type)))
  }

  if (!hasContacts && requireContacts) {
    return (
      <div className="space-y-2">
        <div className="p-4 border border-gray-200 rounded-md bg-gray-50 text-center">
          <p className="text-sm text-gray-600 mb-2">No contacts available</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push("/dashboard/contacts")}
          >
            Add contacts
          </Button>
        </div>
      </div>
    )
  }

  // Filter based on mode
  const availableEntities = mode === "stakeholders" 
    ? searchResults.entities.filter(e => !selectedRecipients.some(r => r.id === e.id && r.type === "entity"))
    : []
  const availableGroups = mode === "groups"
    ? searchResults.groups.filter(g => !selectedRecipients.some(r => r.id === g.id && r.type === "group"))
    : []
  const availableContactTypes = mode === "stakeholders"
    ? searchResults.contactTypes.filter(ct => !selectedRecipients.some(r => r.id === ct.id && r.type === "contactType"))
    : []

  const hasResults = availableEntities.length > 0 || availableGroups.length > 0 || availableContactTypes.length > 0

  const getPlaceholder = () => {
    if (placeholder) return placeholder
    if (mode === "stakeholders") return "Search contacts or types..."
    return "Search groups..."
  }

  const getIcon = (type: "entity" | "group" | "contactType") => {
    switch (type) {
      case "contactType":
        return <Building2 className="w-3 h-3 text-gray-500" />
      case "group":
        return <Users className="w-3 h-3 text-gray-500" />
      default:
        return <User className="w-3 h-3 text-gray-500" />
    }
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="relative">
        <Input
          placeholder={getPlaceholder()}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => {
            setHasFocused(true)
            // Trigger search on focus if we haven't searched yet
            if (!hasFocused) {
              setInput("") // This will trigger the search effect
            } else {
              setShowResults(true)
            }
          }}
        />
        {showResults && hasResults && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {/* Contact Types - shown first in stakeholders mode */}
            {availableContactTypes.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-medium text-gray-500 px-2 py-1">Types</div>
                {availableContactTypes.map((ct) => (
                  <button
                    key={ct.id}
                    type="button"
                    className="w-full text-left px-2 py-2 hover:bg-gray-50 rounded flex items-center gap-2"
                    onClick={() => addContactType(ct)}
                  >
                    <Building2 className="w-4 h-4 text-blue-500" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{ct.name}</div>
                      <div className="text-xs text-gray-500">{ct.entityCount} contacts</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {/* Groups - shown in groups mode */}
            {availableGroups.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-medium text-gray-500 px-2 py-1">Groups</div>
                {availableGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className="w-full text-left px-2 py-2 hover:bg-gray-50 rounded flex items-center gap-2"
                    onClick={() => addGroup(group)}
                  >
                    <Users className="w-4 h-4 text-purple-500" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{group.name}</div>
                      <div className="text-xs text-gray-500">{group.entityCount} members</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {/* Individual Contacts - shown in stakeholders mode */}
            {availableEntities.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-medium text-gray-500 px-2 py-1">Contacts</div>
                {availableEntities.map((entity) => (
                  <button
                    key={entity.id}
                    type="button"
                    className="w-full text-left px-2 py-2 hover:bg-gray-50 rounded flex items-center gap-2"
                    onClick={() => addEntity(entity)}
                  >
                    <User className="w-4 h-4 text-gray-500" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{entity.firstName}</div>
                      {entity.email && (
                        <div className="text-xs text-gray-500">{entity.email}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Selected pills */}
      {selectedRecipients.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedRecipients.map((r) => (
            <span
              key={`${r.type}-${r.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm"
            >
              {getIcon(r.type)}
              {r.name}
              {(r.type === "group" || r.type === "contactType") && r.entityCount !== undefined && (
                <span className="text-xs text-gray-500">({r.entityCount})</span>
              )}
              <button
                type="button"
                onClick={() => removeRecipient(r.id, r.type)}
                className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
