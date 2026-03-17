"use client"

import { useState, useEffect, useMemo } from "react"
import { Label } from "@/components/ui/label"
import { Check, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { DatabaseRecipientConfig } from "./database-recipient-config"

type RecipientSourceType =
  | "specific_users"
  | "database"

const SOURCE_OPTIONS: { value: RecipientSourceType; label: string; description: string }[] = [
  { value: "specific_users", label: "Specific users", description: "Pick team members by person or role" },
  { value: "database", label: "From a database", description: "Recipients from database rows (e.g. clients with outstanding invoices)" },
]

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "MEMBER", label: "Employee" },
  { value: "VIEWER", label: "Viewer" },
]

interface TeamMember {
  id: string
  name: string | null
  email: string | null
  role: string
}

interface RecipientSourceConfigProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

export function RecipientSourceConfig({ params, onChange }: RecipientSourceConfigProps) {
  const sourceType = (params.recipientSourceType as RecipientSourceType) || ""

  const [members, setMembers] = useState<TeamMember[]>([])
  const [search, setSearch] = useState("")

  // Load members when needed
  useEffect(() => {
    if (sourceType === "specific_users") {
      fetch("/api/org/members")
        .then((r) => (r.ok ? r.json() : { members: [] }))
        .then((data) => setMembers(data.members || []))
        .catch(() => {})
    }
  }, [sourceType])

  const setSourceType = (type: RecipientSourceType) => {
    const cleaned: Record<string, unknown> = {
      ...params,
      recipientSourceType: type,
    }
    delete cleaned.userIds
    delete cleaned.roleSelections
    delete cleaned.databaseId
    delete cleaned.emailColumnKey
    delete cleaned.nameColumnKey
    delete cleaned.filters
    onChange(cleaned)
  }

  // Users: toggle
  const selectedUserIds = (params.userIds as string[]) || []
  const selectedRoles = (params.roleSelections as string[]) || []

  const toggleUser = (id: string) => {
    const member = members.find((m) => m.id === id)
    if (!member) return

    const isInRole = selectedRoles.includes(member.role)
    if (isInRole) {
      // Deselect from role: remove role, add all others in that role
      const othersInRole = members
        .filter((m) => m.role === member.role && m.id !== id)
        .map((m) => m.id)
      onChange({
        ...params,
        roleSelections: selectedRoles.filter((r) => r !== member.role),
        userIds: [
          ...selectedUserIds.filter(
            (uid) => !members.some((m) => m.id === uid && m.role === member.role)
          ),
          ...othersInRole,
        ],
      })
    } else if (selectedUserIds.includes(id)) {
      onChange({ ...params, userIds: selectedUserIds.filter((u) => u !== id) })
    } else {
      onChange({ ...params, userIds: [...selectedUserIds, id] })
    }
  }

  const toggleRole = (role: string) => {
    const isSelected = selectedRoles.includes(role)
    if (isSelected) {
      onChange({
        ...params,
        roleSelections: selectedRoles.filter((r) => r !== role),
        userIds: selectedUserIds.filter(
          (id) => !members.some((m) => m.id === id && m.role === role)
        ),
      })
    } else {
      const roleUserIds = new Set(
        members.filter((m) => m.role === role).map((m) => m.id)
      )
      onChange({
        ...params,
        roleSelections: [...selectedRoles, role],
        userIds: selectedUserIds.filter((id) => !roleUserIds.has(id)),
      })
    }
  }

  const isUserSelected = (member: TeamMember): boolean => {
    return selectedUserIds.includes(member.id) || selectedRoles.includes(member.role)
  }

  // Role counts
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const m of members) {
      counts[m.role] = (counts[m.role] || 0) + 1
    }
    return counts
  }, [members])

  // Filtered members
  const filteredMembers = useMemo(() => {
    if (!search) return members
    const q = search.toLowerCase()
    return members.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q)
    )
  }, [members, search])

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

      {sourceType === "specific_users" && (
        <div className="space-y-2">
          {/* Role chips */}
          {members.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ROLE_OPTIONS.map((opt) => {
                const count = roleCounts[opt.value] || 0
                if (count === 0) return null
                const isActive = selectedRoles.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleRole(opt.value)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      isActive
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label} ({count})
                    {isActive && <Check className="w-2.5 h-2.5" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* Search */}
          {members.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-7 text-xs"
              />
            </div>
          )}

          {/* Member list */}
          <div className="border border-gray-200 rounded-md max-h-40 overflow-y-auto">
            {filteredMembers.length === 0 ? (
              <p className="text-sm text-gray-400 px-3 py-2">
                {members.length === 0 ? "Loading members..." : "No matches"}
              </p>
            ) : (
              filteredMembers.map((m) => {
                const selected = isUserSelected(m)
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer ${
                      selected ? "bg-orange-50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleUser(m.id)}
                      className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span className="text-sm text-gray-700 flex-1">
                      {m.name || m.email}
                    </span>
                    <span className="text-[10px] text-gray-400 capitalize">
                      {m.role === "MEMBER" ? "Employee" : m.role.toLowerCase()}
                    </span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}

      {sourceType === "database" && (
        <DatabaseRecipientConfig params={params} onChange={onChange} />
      )}
    </div>
  )
}
