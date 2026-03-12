"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X, Users, Database, ChevronDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TeamMember } from "@/lib/types/recipient-source"

export type SelectedRecipient = {
  id: string
  name: string
  type: "user" | "database_query"
  email?: string | null
  /** For database_query type: config to resolve at send time */
  databaseConfig?: {
    databaseId: string
    emailColumnKey: string
    nameColumnKey?: string
  }
}

interface RecipientSelectorProps {
  selectedRecipients: SelectedRecipient[]
  onRecipientsChange: (recipients: SelectedRecipient[]) => void
}

export function RecipientSelector({
  selectedRecipients,
  onRecipientsChange,
}: RecipientSelectorProps) {
  const [mode, setMode] = useState<"users" | "database">("users")
  const [input, setInput] = useState("")
  const [members, setMembers] = useState<TeamMember[]>([])
  const [showResults, setShowResults] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Database state
  const [databases, setDatabases] = useState<Array<{ id: string; name: string }>>([])
  const [dbColumns, setDbColumns] = useState<Array<{ key: string; label: string }>>([])
  const [selectedDbId, setSelectedDbId] = useState("")
  const [emailColumn, setEmailColumn] = useState("")
  const [nameColumn, setNameColumn] = useState("")

  // Fetch users on mount
  useEffect(() => {
    fetch("/api/org/team")
      .then((r) => (r.ok ? r.json() : { teamMembers: [] }))
      .then((data) => setMembers(data.teamMembers || []))
      .catch(() => {})
  }, [])

  // Fetch databases on mount
  useEffect(() => {
    fetch("/api/databases")
      .then((r) => (r.ok ? r.json() : { databases: [] }))
      .then((data) => setDatabases(data.databases || []))
      .catch(() => {})
  }, [])

  // Fetch columns when database changes
  useEffect(() => {
    if (!selectedDbId) {
      setDbColumns([])
      return
    }
    fetch(`/api/databases/${selectedDbId}/columns`)
      .then((r) => (r.ok ? r.json() : { columns: [] }))
      .then((data) => setDbColumns(data.columns || []))
      .catch(() => {})
  }, [selectedDbId])

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

  // Filter members by search
  const filteredMembers = useMemo(() => {
    const q = input.toLowerCase()
    return members
      .filter((m) => m.email)
      .filter(
        (m) =>
          !selectedRecipients.some((r) => r.id === m.id && r.type === "user")
      )
      .filter(
        (m) =>
          !q ||
          (m.name || "").toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
      )
  }, [members, input, selectedRecipients])

  const addUser = (member: TeamMember) => {
    if (selectedRecipients.some((r) => r.id === member.id && r.type === "user")) return

    const recipient: SelectedRecipient = {
      id: member.id,
      name: member.name || member.email,
      type: "user",
      email: member.email,
    }
    onRecipientsChange([...selectedRecipients, recipient])
    setInput("")
    setShowResults(false)
  }

  const addDatabaseRecipients = () => {
    if (!selectedDbId || !emailColumn) return

    const db = databases.find((d) => d.id === selectedDbId)
    const recipient: SelectedRecipient = {
      id: `db-${selectedDbId}`,
      name: `${db?.name || "Database"} recipients`,
      type: "database_query",
      databaseConfig: {
        databaseId: selectedDbId,
        emailColumnKey: emailColumn,
        nameColumnKey: nameColumn || undefined,
      },
    }

    // Replace any existing database query for the same DB
    const filtered = selectedRecipients.filter(
      (r) => !(r.type === "database_query" && r.databaseConfig?.databaseId === selectedDbId)
    )
    onRecipientsChange([...filtered, recipient])

    // Reset database form
    setSelectedDbId("")
    setEmailColumn("")
    setNameColumn("")
  }

  const removeRecipient = (id: string, type: string) => {
    onRecipientsChange(selectedRecipients.filter((r) => !(r.id === id && r.type === type)))
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Mode toggle */}
      <div className="flex gap-1 p-0.5 bg-gray-100 rounded-md w-fit">
        <button
          type="button"
          onClick={() => setMode("users")}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            mode === "users"
              ? "bg-white shadow text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Users className="w-3 h-3" />
          Users
        </button>
        <button
          type="button"
          onClick={() => setMode("database")}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            mode === "database"
              ? "bg-white shadow text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Database className="w-3 h-3" />
          Database
        </button>
      </div>

      {/* Users mode: search + add */}
      {mode === "users" && (
        <div className="relative">
          <Input
            placeholder="Search team members..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setShowResults(true)}
          />
          {showResults && filteredMembers.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded"
                  onClick={() => addUser(member)}
                >
                  <div className="text-sm font-medium">
                    {member.name || member.email}
                  </div>
                  <div className="text-xs text-gray-500">{member.email}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Database mode: pick DB + column */}
      {mode === "database" && (
        <div className="space-y-2">
          <Select value={selectedDbId} onValueChange={(v) => { setSelectedDbId(v); setEmailColumn(""); setNameColumn("") }}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select database" />
            </SelectTrigger>
            <SelectContent>
              {databases.map((db) => (
                <SelectItem key={db.id} value={db.id}>{db.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedDbId && dbColumns.length > 0 && (
            <>
              <Select value={emailColumn} onValueChange={setEmailColumn}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Email column" />
                </SelectTrigger>
                <SelectContent>
                  {dbColumns.map((col) => (
                    <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={nameColumn || "__none__"} onValueChange={(v) => setNameColumn(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Name column (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {dbColumns.map((col) => (
                    <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDatabaseRecipients}
                disabled={!emailColumn}
                className="w-full"
              >
                Add database recipients
              </Button>
            </>
          )}
        </div>
      )}

      {/* Selected recipients as chips */}
      <div className="flex flex-wrap gap-2">
        {selectedRecipients.map((r) => (
          <span
            key={`${r.type}-${r.id}`}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
              r.type === "database_query"
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {r.type === "database_query" && <Database className="w-3 h-3" />}
            {r.name}
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
