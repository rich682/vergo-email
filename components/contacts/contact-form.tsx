"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GroupsInput } from "@/components/contacts/groups-input"

interface Group {
  id: string
  name: string
  color?: string | null
}

interface EntityInput {
  id?: string
  firstName?: string
  email?: string
  phone?: string
  contactType?: string
  contactTypeCustomLabel?: string
  groups?: { id: string; name: string }[]
}

interface ContactFormProps {
  entity?: EntityInput
  onSuccess: () => void
  onCancel: () => void
}

export function ContactForm({ entity, onSuccess, onCancel }: ContactFormProps) {
  const [firstName, setFirstName] = useState(entity?.firstName || "")
  const [email, setEmail] = useState(entity?.email || "")
  const [phone, setPhone] = useState(entity?.phone || "")
  const [contactType, setContactType] = useState(entity?.contactType || "UNKNOWN")
  const [contactTypeCustomLabel, setContactTypeCustomLabel] = useState(entity?.contactTypeCustomLabel || "")
  const [groupIds, setGroupIds] = useState<string[]>(
    entity?.groups?.map((g) => g.id) || []
  )
  const [groups, setGroups] = useState<Group[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadGroups = async () => {
      try {
        const res = await fetch("/api/groups")
        if (res.ok) {
          const data = await res.json()
          setGroups(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        console.error("Failed to load groups", err)
      }
    }
    loadGroups()
  }, [])

  useEffect(() => {
    setFirstName(entity?.firstName || "")
    setEmail(entity?.email || "")
    setPhone(entity?.phone || "")
    setContactType(entity?.contactType || "UNKNOWN")
    setContactTypeCustomLabel(entity?.contactTypeCustomLabel || "")
    setGroupIds(entity?.groups?.map((g) => g.id) || [])
  }, [entity])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const payload = {
        firstName,
        email,
        phone: phone || undefined,
        contactType,
        contactTypeCustomLabel: contactType === "CUSTOM" ? contactTypeCustomLabel || undefined : undefined,
        groupIds
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

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="firstName">Name</Label>
        <Input
          id="firstName"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Contact name"
          required
        />
      </div>
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
        <Label htmlFor="phone">Phone (optional)</Label>
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
