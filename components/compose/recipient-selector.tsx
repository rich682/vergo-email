"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

export type SelectedRecipient = {
  id: string
  name: string
  type: "entity" | "group"
  email?: string | null
  entityCount?: number // For groups
}

interface RecipientSelectorProps {
  selectedRecipients: SelectedRecipient[]
  onRecipientsChange: (recipients: SelectedRecipient[]) => void
  requireContacts?: boolean
}

export function RecipientSelector({
  selectedRecipients,
  onRecipientsChange,
  requireContacts = false
}: RecipientSelectorProps) {
  const [input, setInput] = useState("")
  const [searchResults, setSearchResults] = useState<{
    entities: Array<{ id: string; firstName: string; email: string }>
    groups: Array<{ id: string; name: string; entityCount: number; color: string | null }>
  }>({ entities: [], groups: [] })
  const [showResults, setShowResults] = useState(false)
  const [hasContacts, setHasContacts] = useState(true)
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
          const totalContacts = (data.entities?.length || 0) + (data.groups?.length || 0)
          setHasContacts(totalContacts > 0)
        }
      } catch (error) {
        console.error("Error checking contacts:", error)
      }
    }
    checkContacts()
  }, [])

  // Search for contacts/groups
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    const query = input.trim()
    if (query.length < 1) {
      setSearchResults({ entities: [], groups: [] })
      setShowResults(false)
      return
    }

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
    }, 300)
  }, [input])

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

  const removeRecipient = (id: string, type: "entity" | "group") => {
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

  const availableEntities = searchResults.entities.filter(
    e => !selectedRecipients.some(r => r.id === e.id && r.type === "entity")
  )
  const availableGroups = searchResults.groups.filter(
    g => !selectedRecipients.some(r => r.id === g.id && r.type === "group")
  )

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="relative">
        <Input
          placeholder="Search contacts or groups..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => {
            if (input.trim().length >= 1) {
              setShowResults(true)
            }
          }}
        />
        {showResults && (availableEntities.length > 0 || availableGroups.length > 0) && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {availableGroups.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-medium text-gray-500 px-2 py-1">Groups</div>
                {availableGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className="w-full text-left px-2 py-2 hover:bg-gray-50 rounded flex items-center justify-between"
                    onClick={() => addGroup(group)}
                  >
                    <div>
                      <div className="text-sm font-medium">{group.name}</div>
                      <div className="text-xs text-gray-500">Includes {group.entityCount} members</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {availableEntities.length > 0 && (
              <div className="p-2">
                {availableGroups.length > 0 && <div className="text-xs font-medium text-gray-500 px-2 py-1">Contacts</div>}
                {availableEntities.map((entity) => (
                  <button
                    key={entity.id}
                    type="button"
                    className="w-full text-left px-2 py-2 hover:bg-gray-50 rounded"
                    onClick={() => addEntity(entity)}
                  >
                    <div className="text-sm font-medium">{entity.firstName}</div>
                    {entity.email && (
                      <div className="text-xs text-gray-500">{entity.email}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedRecipients.map((r) => (
          <span
            key={`${r.type}-${r.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm"
          >
            {r.name}
            {r.type === "group" && r.entityCount !== undefined && (
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
    </div>
  )
}
