"use client"

/**
 * RecipientSourceSelector
 *
 * Shared component for choosing "who" should receive a form, request, or email.
 * Two modes:
 *  - Users: pick individuals and/or entire roles (resolved dynamically at send time)
 *  - Database: pick a database, map email column, optionally filter rows
 */

import { useState, useEffect, useMemo } from "react"
import { Search, Users, Database, Check, Loader2, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InlineFilterBuilder } from "@/components/automations/steps/send-request/inline-filter-builder"
import type {
  RecipientSourceSelection,
  TeamMember,
} from "@/lib/types/recipient-source"

// ─── Props ──────────────────────────────────────────────────────────────────

interface RecipientSourceSelectorProps {
  value: RecipientSourceSelection
  onChange: (selection: RecipientSourceSelection) => void
  compact?: boolean
}

// ─── Role definitions ────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "MEMBER", label: "Employee" },
  { value: "VIEWER", label: "Viewer" },
]

// ─── Database types ──────────────────────────────────────────────────────────

interface DatabaseInfo {
  id: string
  name: string
  rowCount?: number
}

interface SchemaColumn {
  key: string
  label: string
  dataType: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RecipientSourceSelector({
  value,
  onChange,
  compact = false,
}: RecipientSourceSelectorProps) {
  const { mode } = value

  const setMode = (m: "users" | "database") => {
    onChange({ ...value, mode: m })
  }

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
        <button
          type="button"
          onClick={() => setMode("users")}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
            mode === "users"
              ? "bg-white shadow text-gray-900 font-medium"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Users className="w-4 h-4" />
          Users
        </button>
        <button
          type="button"
          onClick={() => setMode("database")}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
            mode === "database"
              ? "bg-white shadow text-gray-900 font-medium"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Database className="w-4 h-4" />
          Database
        </button>
      </div>

      {mode === "users" && (
        <UsersTab value={value} onChange={onChange} compact={compact} />
      )}
      {mode === "database" && (
        <DatabaseTab value={value} onChange={onChange} compact={compact} />
      )}
    </div>
  )
}

// ─── Users Tab ──────────────────────────────────────────────────────────────

function UsersTab({
  value,
  onChange,
  compact,
}: {
  value: RecipientSourceSelection
  onChange: (v: RecipientSourceSelection) => void
  compact: boolean
}) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetch("/api/org/team")
      .then((r) => (r.ok ? r.json() : { teamMembers: [] }))
      .then((data) => setMembers(data.teamMembers || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Members with valid emails only
  const validMembers = useMemo(
    () => members.filter((m) => m.email),
    [members]
  )

  // Filtered by search
  const filteredMembers = useMemo(() => {
    if (!search) return validMembers
    const q = search.toLowerCase()
    return validMembers.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
    )
  }, [validMembers, search])

  // Role counts
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const m of validMembers) {
      counts[m.role] = (counts[m.role] || 0) + 1
    }
    return counts
  }, [validMembers])

  // Determine if a user is "selected" — either explicitly by ID or via a role selection
  const isUserSelected = (member: TeamMember): boolean => {
    if (value.userIds.includes(member.id)) return true
    if (value.roleSelections.includes(member.role)) return true
    return false
  }

  // Toggle an individual user
  const toggleUser = (member: TeamMember) => {
    const isInRole = value.roleSelections.includes(member.role)
    const isExplicit = value.userIds.includes(member.id)

    if (isInRole) {
      // User is selected via role — to deselect, remove the role and add all
      // other users of that role explicitly, minus this one
      const otherUsersInRole = validMembers
        .filter((m) => m.role === member.role && m.id !== member.id)
        .map((m) => m.id)
      onChange({
        ...value,
        roleSelections: value.roleSelections.filter((r) => r !== member.role),
        userIds: [
          ...value.userIds.filter(
            (id) => !validMembers.some((m) => m.id === id && m.role === member.role)
          ),
          ...otherUsersInRole,
        ],
      })
    } else if (isExplicit) {
      // Remove explicit selection
      onChange({
        ...value,
        userIds: value.userIds.filter((id) => id !== member.id),
      })
    } else {
      // Add explicit selection
      onChange({
        ...value,
        userIds: [...value.userIds, member.id],
      })
    }
  }

  // Toggle a role chip
  const toggleRole = (role: string) => {
    const isSelected = value.roleSelections.includes(role)
    if (isSelected) {
      // Remove role, also remove any explicit IDs that belong to this role
      onChange({
        ...value,
        roleSelections: value.roleSelections.filter((r) => r !== role),
        userIds: value.userIds.filter(
          (id) => !validMembers.some((m) => m.id === id && m.role === role)
        ),
      })
    } else {
      // Add role, remove explicit IDs for users in this role (role covers them)
      const roleUserIds = new Set(
        validMembers.filter((m) => m.role === role).map((m) => m.id)
      )
      onChange({
        ...value,
        roleSelections: [...value.roleSelections, role],
        userIds: value.userIds.filter((id) => !roleUserIds.has(id)),
      })
    }
  }

  // Select all / deselect all
  const selectedCount = filteredMembers.filter(isUserSelected).length
  const allSelected = selectedCount === filteredMembers.length && filteredMembers.length > 0

  const toggleAll = () => {
    if (allSelected) {
      // Deselect all — clear roles and explicit IDs
      onChange({ ...value, userIds: [], roleSelections: [] })
    } else {
      // Select all unique roles present
      const allRoles = [...new Set(validMembers.map((m) => m.role))]
      onChange({ ...value, roleSelections: allRoles, userIds: [] })
    }
  }

  // Summary text
  const totalSelected = validMembers.filter(isUserSelected).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Role quick-select chips */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-gray-500 uppercase">
          Select by Role
        </span>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((opt) => {
            const count = roleCounts[opt.value] || 0
            if (count === 0) return null
            const isActive = value.roleSelections.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleRole(opt.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {opt.label} ({count})
                {isActive && <Check className="w-3 h-3" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Select all / count */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={toggleAll}
          className="text-sm text-orange-600 hover:underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span className="text-sm text-gray-500">{totalSelected} selected</span>
      </div>

      {/* User list */}
      <div
        className={`border rounded-lg overflow-y-auto ${
          compact ? "max-h-40" : "max-h-[50vh]"
        }`}
      >
        {filteredMembers.length === 0 ? (
          <div className="py-6 text-center">
            <Users className="w-6 h-6 text-gray-300 mx-auto mb-1" />
            <p className="text-sm text-gray-500">
              {validMembers.length === 0
                ? "No team members found"
                : "No members match your search"}
            </p>
          </div>
        ) : (
          filteredMembers.map((member) => {
            const selected = isUserSelected(member)
            const viaRole = value.roleSelections.includes(member.role)
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => toggleUser(member)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors ${
                  selected ? "bg-orange-50" : ""
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                    selected
                      ? "bg-orange-500 border-orange-500"
                      : "border-gray-300"
                  }`}
                >
                  {selected && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {member.name || member.email}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {member.email}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded capitalize shrink-0">
                  {member.role === "MEMBER" ? "Employee" : member.role.toLowerCase()}
                </span>
                {viaRole && (
                  <span className="text-[10px] text-orange-500 shrink-0">
                    via role
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Database Tab ───────────────────────────────────────────────────────────

function DatabaseTab({
  value,
  onChange,
  compact,
}: {
  value: RecipientSourceSelection
  onChange: (v: RecipientSourceSelection) => void
  compact: boolean
}) {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [columns, setColumns] = useState<SchemaColumn[]>([])
  const [loadingDbs, setLoadingDbs] = useState(true)
  const [loadingCols, setLoadingCols] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Load databases
  useEffect(() => {
    fetch("/api/databases")
      .then((r) => (r.ok ? r.json() : { databases: [] }))
      .then((data) => setDatabases(data.databases || []))
      .catch(() => {})
      .finally(() => setLoadingDbs(false))
  }, [])

  // Load columns when database changes
  useEffect(() => {
    if (!value.databaseId) {
      setColumns([])
      setPreviewCount(null)
      return
    }
    setLoadingCols(true)
    fetch(`/api/databases/${value.databaseId}/columns`)
      .then((r) => (r.ok ? r.json() : { columns: [] }))
      .then((data) => setColumns(data.columns || []))
      .catch(() => {})
      .finally(() => setLoadingCols(false))
  }, [value.databaseId])

  // Fetch preview count when config is complete
  useEffect(() => {
    if (!value.databaseId || !value.emailColumnKey) {
      setPreviewCount(null)
      return
    }
    setLoadingPreview(true)
    fetch("/api/recipients/resolve?countOnly=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        mode: "database",
        databaseId: value.databaseId,
        emailColumnKey: value.emailColumnKey,
        nameColumnKey: value.nameColumnKey,
        filters: value.filters || [],
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setPreviewCount(data.count ?? null)
      })
      .catch(() => setPreviewCount(null))
      .finally(() => setLoadingPreview(false))
  }, [
    value.databaseId,
    value.emailColumnKey,
    value.nameColumnKey,
    JSON.stringify(value.filters),
  ])

  const setDatabase = (dbId: string) => {
    onChange({
      ...value,
      databaseId: dbId,
      emailColumnKey: undefined,
      nameColumnKey: undefined,
      filters: [],
    })
  }

  return (
    <div className="space-y-3">
      {/* Database picker */}
      <div>
        <label className="text-xs font-medium text-gray-500">Database</label>
        <Select
          value={value.databaseId || ""}
          onValueChange={setDatabase}
        >
          <SelectTrigger className="mt-1">
            <SelectValue
              placeholder={loadingDbs ? "Loading..." : "Select a database"}
            />
          </SelectTrigger>
          <SelectContent>
            {databases.map((db) => (
              <SelectItem key={db.id} value={db.id}>
                {db.name}
                {db.rowCount != null && (
                  <span className="text-gray-400 ml-1">
                    ({db.rowCount} rows)
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.databaseId && columns.length > 0 && (
        <>
          {/* Email column */}
          <div>
            <label className="text-xs font-medium text-gray-500">
              Email column
            </label>
            <Select
              value={value.emailColumnKey || ""}
              onValueChange={(v) =>
                onChange({ ...value, emailColumnKey: v })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue
                  placeholder={
                    loadingCols ? "Loading..." : "Which column has emails?"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col.key} value={col.key}>
                    {col.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name column (optional) */}
          <div>
            <label className="text-xs font-medium text-gray-500">
              Name column (optional)
            </label>
            <Select
              value={value.nameColumnKey || "__none__"}
              onValueChange={(v) =>
                onChange({
                  ...value,
                  nameColumnKey: v === "__none__" ? undefined : v,
                })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Optional: column for recipient name" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {columns.map((col) => (
                  <SelectItem key={col.key} value={col.key}>
                    {col.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filters */}
          <InlineFilterBuilder
            columns={columns}
            filters={value.filters || []}
            onChange={(newFilters) =>
              onChange({ ...value, filters: newFilters as any })
            }
          />

          {/* Preview count */}
          {value.emailColumnKey && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 bg-gray-50 rounded-lg">
              {loadingPreview ? (
                <>
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  <span className="text-gray-500">Counting recipients...</span>
                </>
              ) : previewCount !== null ? (
                <>
                  <Users className="w-4 h-4 text-orange-500" />
                  <span className="text-gray-700">
                    {previewCount} recipient{previewCount !== 1 ? "s" : ""} found
                  </span>
                </>
              ) : null}
            </div>
          )}
        </>
      )}

      {value.databaseId && loadingCols && (
        <p className="text-xs text-gray-400">Loading columns...</p>
      )}
    </div>
  )
}
