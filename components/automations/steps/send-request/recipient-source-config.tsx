"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { DatabaseRecipientConfig } from "./database-recipient-config"

type RecipientSourceType =
  | "specific_users"
  | "database"

const SOURCE_OPTIONS: { value: RecipientSourceType; label: string; description: string }[] = [
  { value: "specific_users", label: "Specific users", description: "Pick internal team members" },
  { value: "database", label: "From a database", description: "Recipients from database rows (e.g. clients with outstanding invoices)" },
]

interface TeamMember {
  id: string
  name: string | null
  email: string | null
}

interface RecipientSourceConfigProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

export function RecipientSourceConfig({ params, onChange }: RecipientSourceConfigProps) {
  const sourceType = (params.recipientSourceType as RecipientSourceType) || ""

  const [members, setMembers] = useState<TeamMember[]>([])

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
    delete cleaned.databaseId
    delete cleaned.emailColumnKey
    delete cleaned.nameColumnKey
    delete cleaned.filters
    onChange(cleaned)
  }

  // Users: toggle
  const selectedUserIds = (params.userIds as string[]) || []
  const toggleUser = (id: string) => {
    const next = selectedUserIds.includes(id)
      ? selectedUserIds.filter((u) => u !== id)
      : [...selectedUserIds, id]
    onChange({ ...params, userIds: next })
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
