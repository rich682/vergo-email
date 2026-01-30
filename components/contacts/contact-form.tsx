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
  lastName?: string
  email?: string
  phone?: string
  companyName?: string
  contactType?: string
  contactTypeCustomLabel?: string
  isInternal?: boolean
  groups?: { id: string; name: string }[]
}

interface ContactFormProps {
  entity?: EntityInput
  onSuccess: () => void
  onCancel: () => void
}

export function ContactForm({ entity, onSuccess, onCancel }: ContactFormProps) {
  const [firstName, setFirstName] = useState(entity?.firstName || "")
  const [lastName, setLastName] = useState(entity?.lastName || "")
  const [email, setEmail] = useState(entity?.email || "")
  const [phone, setPhone] = useState(entity?.phone || "")
  const [companyName, setCompanyName] = useState(entity?.companyName || "")
  const [isInternal, setIsInternal] = useState(entity?.isInternal ?? false)
  const [contactType, setContactType] = useState(entity?.contactType || "UNKNOWN")
  const [contactTypeCustomLabel, setContactTypeCustomLabel] = useState(entity?.contactTypeCustomLabel || "")
  const [groupIds, setGroupIds] = useState<string[]>(
    entity?.groups?.map((g) => g.id) || []
  )
  const [groups, setGroups] = useState<Group[]>([])
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
    setCompanyName(entity?.companyName || "")
    setIsInternal(entity?.isInternal ?? false)
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
        lastName: lastName.trim() || undefined,
        email,
        phone: phone || undefined,
        companyName: companyName.trim() || undefined,
        isInternal,
        contactType,
        contactTypeCustomLabel: contactType === "CUSTOM" ? contactTypeCustomLabel || undefined : undefined,
        groupIds,
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
        <Label htmlFor="companyName">Company <span className="text-gray-400 text-xs font-normal">(optional)</span></Label>
        <Input
          id="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Acme Corp"
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
      {/* Internal/External Toggle */}
      <div className="space-y-2">
        <Label>Contact Type</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsInternal(false)}
            className={`flex-1 px-4 py-2 text-sm font-medium border rounded-md transition-colors ${
              !isInternal 
                ? "bg-gray-900 text-white border-gray-900" 
                : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
            }`}
          >
            External
          </button>
          <button
            type="button"
            onClick={() => setIsInternal(true)}
            className={`flex-1 px-4 py-2 text-sm font-medium border rounded-md transition-colors ${
              isInternal 
                ? "bg-blue-600 text-white border-blue-600" 
                : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
            }`}
          >
            Internal
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {isInternal 
            ? "Internal contacts are employees and team members within your organization." 
            : "External contacts are clients, vendors, and other outside parties."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactType">Role</Label>
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
        <Label>Tags</Label>
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
