"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GroupsInput } from "@/components/contacts/groups-input"
import { Tag, X, Plus } from "lucide-react"

interface Group {
  id: string
  name: string
  color?: string | null
}

interface ContactState {
  stateKey: string
  stateValue?: string
  metadata?: any
  tag?: {
    id: string
    name: string
    displayName?: string
  }
}

interface AvailableTag {
  id: string
  name: string
  displayName: string
}

interface EntityInput {
  id?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  contactType?: string
  contactTypeCustomLabel?: string
  groups?: { id: string; name: string }[]
  contactStates?: ContactState[]
}

interface ContactFormProps {
  entity?: EntityInput
  onSuccess: () => void
  onCancel: () => void
}

// Helper to extract tag values from contactStates
function getTagValuesFromStates(contactStates?: ContactState[]): Record<string, string> {
  if (!contactStates) return {}
  const values: Record<string, string> = {}
  for (const cs of contactStates) {
    const tagName = cs.tag?.name || cs.stateKey
    // Get value from stateValue or metadata
    let value = cs.stateValue || ""
    if (!value && cs.metadata) {
      if (typeof cs.metadata === "string") {
        value = cs.metadata
      } else if (typeof cs.metadata === "object" && cs.metadata.value) {
        value = cs.metadata.value
      } else if (typeof cs.metadata === "object") {
        value = JSON.stringify(cs.metadata)
      }
    }
    if (tagName && value) {
      values[tagName] = value
    }
  }
  return values
}

export function ContactForm({ entity, onSuccess, onCancel }: ContactFormProps) {
  const [firstName, setFirstName] = useState(entity?.firstName || "")
  const [lastName, setLastName] = useState(entity?.lastName || "")
  const [email, setEmail] = useState(entity?.email || "")
  const [phone, setPhone] = useState(entity?.phone || "")
  const [contactType, setContactType] = useState(entity?.contactType || "UNKNOWN")
  const [contactTypeCustomLabel, setContactTypeCustomLabel] = useState(entity?.contactTypeCustomLabel || "")
  const [groupIds, setGroupIds] = useState<string[]>(
    entity?.groups?.map((g) => g.id) || []
  )
  const [groups, setGroups] = useState<Group[]>([])
  const [availableTags, setAvailableTags] = useState<AvailableTag[]>([])
  const [tagValues, setTagValues] = useState<Record<string, string>>(
    getTagValuesFromStates(entity?.contactStates)
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load groups
        const groupsRes = await fetch("/api/groups")
        if (groupsRes.ok) {
          const data = await groupsRes.json()
          setGroups(Array.isArray(data) ? data : [])
        }
        
        // Load available tags
        const tagsRes = await fetch("/api/contacts/tags")
        if (tagsRes.ok) {
          const data = await tagsRes.json()
          setAvailableTags(data.tags || [])
        }
      } catch (err) {
        console.error("Failed to load data", err)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    setFirstName(entity?.firstName || "")
    setLastName(entity?.lastName || "")
    setEmail(entity?.email || "")
    setPhone(entity?.phone || "")
    setContactType(entity?.contactType || "UNKNOWN")
    setContactTypeCustomLabel(entity?.contactTypeCustomLabel || "")
    setGroupIds(entity?.groups?.map((g) => g.id) || [])
    setTagValues(getTagValuesFromStates(entity?.contactStates))
  }, [entity])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const payload = {
        firstName,
        lastName: lastName.trim() || undefined,
        email,
        phone: phone || undefined,
        contactType,
        contactTypeCustomLabel: contactType === "CUSTOM" ? contactTypeCustomLabel || undefined : undefined,
        groupIds,
        tagValues // Include tag values in the payload
      }

      const res = await fetch(
        entity?.id ? `/api/entities/${entity.id}` : "/api/entities",
        {
          method: entity?.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save contact")
      }

      onSuccess()
    } catch (err: any) {
      setError(err?.message || "Failed to save contact")
    } finally {
      setSubmitting(false)
    }
  }

  const handleTagValueChange = (tagName: string, value: string) => {
    setTagValues(prev => {
      if (value === "") {
        // Remove the tag if value is empty
        const { [tagName]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [tagName]: value }
    })
  }

  const handleRemoveTag = (tagName: string) => {
    setTagValues(prev => {
      const { [tagName]: _, ...rest } = prev
      return rest
    })
  }

  // Tags that are assigned to this contact
  const assignedTagNames = Object.keys(tagValues)
  // Tags that are available but not yet assigned
  const unassignedTags = availableTags.filter(t => !assignedTagNames.includes(t.name))

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name <span className="text-gray-400 text-xs font-normal">(optional)</span></Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 -mt-2">First name is used for email personalization (e.g., "Dear Sarah,")</p>
      
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone <span className="text-gray-400 text-xs font-normal">(optional)</span></Label>
        <Input
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactType">Contact Type</Label>
        <select
          id="contactType"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          value={contactType}
          onChange={(e) => setContactType(e.target.value)}
        >
          <option value="UNKNOWN">Unknown</option>
          <option value="EMPLOYEE">Employee</option>
          <option value="VENDOR">Vendor</option>
          <option value="CLIENT">Client</option>
          <option value="CONTRACTOR">Contractor</option>
          <option value="MANAGEMENT">Management</option>
          <option value="CUSTOM">Custom</option>
        </select>
        {contactType === "CUSTOM" && (
          <Input
            id="contactTypeCustomLabel"
            value={contactTypeCustomLabel}
            onChange={(e) => setContactTypeCustomLabel(e.target.value)}
            placeholder="Custom type label"
            className="mt-2"
          />
        )}
      </div>
      <div className="space-y-2">
        <Label>Groups</Label>
        <GroupsInput
          existingGroups={groups}
          selectedGroupIds={groupIds}
          onChangeSelected={setGroupIds}
        />
      </div>

      {/* Tags Section */}
      {availableTags.length > 0 && (
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Personalization Tags
          </Label>
          <p className="text-xs text-gray-500 -mt-1">
            Add custom data for this contact (e.g., invoice numbers, due dates)
          </p>
          
          {/* Assigned tags */}
          {assignedTagNames.length > 0 && (
            <div className="space-y-2">
              {assignedTagNames.map(tagName => {
                const tag = availableTags.find(t => t.name === tagName)
                return (
                  <div key={tagName} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-xs text-gray-500 mb-1 block">
                        {tag?.displayName || tagName}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={tagValues[tagName] || ""}
                          onChange={(e) => handleTagValueChange(tagName, e.target.value)}
                          placeholder={`Enter ${tag?.displayName || tagName}...`}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveTag(tagName)}
                          className="text-gray-400 hover:text-red-500 px-2"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          
          {/* Add tag dropdown */}
          {unassignedTags.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleTagValueChange(e.target.value, "")
                    // Focus will be on the new input after re-render
                  }
                }}
              >
                <option value="">+ Add a tag...</option>
                {unassignedTags.map(tag => (
                  <option key={tag.id} value={tag.name}>
                    {tag.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {assignedTagNames.length === 0 && unassignedTags.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              No tags available. Create tags in Settings → Tags.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : entity?.id ? "Update Contact" : "Create Contact"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
