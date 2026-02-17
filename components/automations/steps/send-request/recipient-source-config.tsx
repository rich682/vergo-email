"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { DatabaseRecipientConfig } from "./database-recipient-config"

type RecipientSourceType =
  | "contact_types"
  | "groups"
  | "specific_contacts"
  | "specific_users"
  | "database"

const SOURCE_OPTIONS: { value: RecipientSourceType; label: string; description: string }[] = [
  { value: "contact_types", label: "By contact type", description: "All contacts of a type (Clients, Vendors, etc.)" },
  { value: "groups", label: "By group", description: "Contacts in specific groups" },
  { value: "specific_contacts", label: "Specific contacts", description: "Pick individual contacts" },
  { value: "specific_users", label: "Specific users", description: "Pick internal team members" },
  { value: "database", label: "From a database", description: "Contacts from database rows (e.g. clients with outstanding invoices)" },
]

const CONTACT_TYPES = [
  { id: "CLIENT", name: "Clients" },
  { id: "VENDOR", name: "Vendors" },
  { id: "EMPLOYEE", name: "Employees" },
  { id: "CONTRACTOR", name: "Contractors" },
  { id: "MANAGEMENT", name: "Management" },
]

interface Group {
  id: string
  name: string
}

interface TeamMember {
  id: string
  name: string | null
  email: string | null
}

interface Entity {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  companyName: string | null
}

interface RecipientSourceConfigProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

export function RecipientSourceConfig({ params, onChange }: RecipientSourceConfigProps) {
  const sourceType = (params.recipientSourceType as RecipientSourceType) || ""

  // Data for the sub-forms
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [contactSearch, setContactSearch] = useState("")
  const [contactResults, setContactResults] = useState<Entity[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Load groups when needed
  useEffect(() => {
    if (sourceType === "groups") {
      fetch("/api/groups")
        .then((r) => (r.ok ? r.json() : { groups: [] }))
        .then((data) => setGroups(data.groups || []))
        .catch(() => {})
    }
  }, [sourceType])

  // Load members when needed
  useEffect(() => {
    if (sourceType === "specific_users") {
      fetch("/api/org/members")
        .then((r) => (r.ok ? r.json() : { members: [] }))
        .then((data) => setMembers(data.members || []))
        .catch(() => {})
    }
  }, [sourceType])

  // Contact search
  useEffect(() => {
    if (sourceType !== "specific_contacts" || contactSearch.length < 2) {
      setContactResults([])
      return
    }
    const timeout = setTimeout(() => {
      setSearchLoading(true)
      fetch(`/api/recipients/search?q=${encodeURIComponent(contactSearch)}`)
        .then((r) => (r.ok ? r.json() : { entities: [] }))
        .then((data) => setContactResults(data.entities || []))
        .catch(() => {})
        .finally(() => setSearchLoading(false))
    }, 300)
    return () => clearTimeout(timeout)
  }, [contactSearch, sourceType])

  const setSourceType = (type: RecipientSourceType) => {
    // Clear previous source-specific params when switching
    const cleaned: Record<string, unknown> = {
      ...params,
      recipientSourceType: type,
    }
    // Remove old source params
    delete cleaned.contactTypes
    delete cleaned.groupIds
    delete cleaned.entityIds
    delete cleaned.userIds
    delete cleaned.databaseId
    delete cleaned.emailColumnKey
    delete cleaned.nameColumnKey
    delete cleaned.filters
    onChange(cleaned)
  }

  // Contact types: toggle
  const selectedContactTypes = (params.contactTypes as string[]) || []
  const toggleContactType = (id: string) => {
    const next = selectedContactTypes.includes(id)
      ? selectedContactTypes.filter((t) => t !== id)
      : [...selectedContactTypes, id]
    onChange({ ...params, contactTypes: next })
  }

  // Groups: toggle
  const selectedGroupIds = (params.groupIds as string[]) || []
  const toggleGroup = (id: string) => {
    const next = selectedGroupIds.includes(id)
      ? selectedGroupIds.filter((g) => g !== id)
      : [...selectedGroupIds, id]
    onChange({ ...params, groupIds: next })
  }

  // Users: toggle
  const selectedUserIds = (params.userIds as string[]) || []
  const toggleUser = (id: string) => {
    const next = selectedUserIds.includes(id)
      ? selectedUserIds.filter((u) => u !== id)
      : [...selectedUserIds, id]
    onChange({ ...params, userIds: next })
  }

  // Contacts: toggle
  const selectedEntityIds = (params.entityIds as string[]) || []
  const toggleEntity = (id: string) => {
    const next = selectedEntityIds.includes(id)
      ? selectedEntityIds.filter((e) => e !== id)
      : [...selectedEntityIds, id]
    onChange({ ...params, entityIds: next })
  }

  return (
    <div className="space-y-3">
      <Label className="text-xs text-gray-500">Recipient Source</Label>

      {/* Source type selector */}
      <div className="space-y-1">
        {SOURCE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-2.5 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
              sourceType === opt.value
                ? "border-orange-300 bg-orange-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              name="recipientSourceType"
              checked={sourceType === opt.value}
              onChange={() => setSourceType(opt.value)}
              className="mt-0.5 text-orange-600 focus:ring-orange-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">{opt.label}</span>
              <p className="text-[11px] text-gray-400">{opt.description}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Sub-forms based on source type */}
      {sourceType === "contact_types" && (
        <div className="border border-gray-200 rounded-md max-h-40 overflow-y-auto">
          {CONTACT_TYPES.map((ct) => (
            <label
              key={ct.id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedContactTypes.includes(ct.id)}
                onChange={() => toggleContactType(ct.id)}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700">{ct.name}</span>
            </label>
          ))}
        </div>
      )}

      {sourceType === "groups" && (
        <div className="border border-gray-200 rounded-md max-h-40 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400 px-3 py-2">No groups found</p>
          ) : (
            groups.map((g) => (
              <label
                key={g.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(g.id)}
                  onChange={() => toggleGroup(g.id)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">{g.name}</span>
              </label>
            ))
          )}
        </div>
      )}

      {sourceType === "specific_contacts" && (
        <div className="space-y-2">
          <input
            type="text"
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            placeholder="Search contacts by name or email..."
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          {selectedEntityIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedEntityIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-full"
                >
                  {id.slice(0, 8)}...
                  <button
                    onClick={() => toggleEntity(id)}
                    className="text-orange-500 hover:text-orange-700"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          {contactResults.length > 0 && (
            <div className="border border-gray-200 rounded-md max-h-40 overflow-y-auto">
              {contactResults.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedEntityIds.includes(e.id)}
                    onChange={() => toggleEntity(e.id)}
                    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <div className="text-sm">
                    <span className="text-gray-700">
                      {[e.firstName, e.lastName].filter(Boolean).join(" ") || e.companyName || "Unknown"}
                    </span>
                    {e.email && <span className="text-gray-400 ml-1">({e.email})</span>}
                  </div>
                </label>
              ))}
            </div>
          )}
          {searchLoading && <p className="text-xs text-gray-400">Searching...</p>}
        </div>
      )}

      {sourceType === "specific_users" && (
        <div className="border border-gray-200 rounded-md max-h-40 overflow-y-auto">
          {members.length === 0 ? (
            <p className="text-sm text-gray-400 px-3 py-2">Loading members...</p>
          ) : (
            members.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(m.id)}
                  onChange={() => toggleUser(m.id)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">{m.name || m.email}</span>
              </label>
            ))
          )}
        </div>
      )}

      {sourceType === "database" && (
        <DatabaseRecipientConfig params={params} onChange={onChange} />
      )}
    </div>
  )
}
