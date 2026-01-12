"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"

type Group = {
  id: string
  name: string
  color?: string | null
}

type Props = {
  existingGroups: Group[]
  selectedGroupIds: string[]
  onChangeSelected: (ids: string[]) => void
}

export function GroupsInput({
  existingGroups,
  selectedGroupIds,
  onChangeSelected
}: Props) {
  const [query, setQuery] = useState("")
  const [groups, setGroups] = useState<Group[]>(existingGroups)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setGroups(existingGroups)
  }, [existingGroups])

  const normalized = useMemo(() => {
    const map = new Map<string, Group>()
    groups.forEach((g) => map.set(g.name.trim().toLowerCase(), g))
    return map
  }, [groups])

  const suggestions = useMemo(() => {
    if (!query.trim()) return groups
    const q = query.trim().toLowerCase()
    return groups.filter((g) => g.name.toLowerCase().includes(q))
  }, [groups, query])

  const selectGroup = (group: Group) => {
    if (selectedGroupIds.includes(group.id)) return
    onChangeSelected([...selectedGroupIds, group.id])
    setQuery("")
    setError(null)
  }

  const removeGroup = (groupId: string) => {
    onChangeSelected(selectedGroupIds.filter((id) => id !== groupId))
  }

  const handleEnter = async () => {
    const trimmed = query.trim()
    if (!trimmed) return

    const existing = normalized.get(trimmed.toLowerCase())
    if (existing) {
      selectGroup(existing)
      return
    }

    try {
      setCreating(true)
      setError(null)
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to create group")
      }
      const newGroup = await res.json()
      setGroups((prev) => [...prev, newGroup])
      selectGroup(newGroup)
    } catch (err: any) {
      setError(err?.message || "Failed to create group")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {selectedGroupIds.map((id) => {
          const group = groups.find((g) => g.id === id)
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-800"
            >
              {group?.name ?? "Unknown"}
              <button
                type="button"
                onClick={() => removeGroup(id)}
                className="text-gray-500 hover:text-gray-800"
                aria-label={`Remove ${group?.name ?? "group"}`}
              >
                ×
              </button>
            </span>
          )
        })}
      </div>

      <Input
        placeholder="Type group name and press Enter"
        value={query}
        disabled={creating}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            handleEnter()
          }
        }}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((g) => (
            <button
              type="button"
              key={g.id}
              onClick={() => selectGroup(g)}
              className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-800 hover:border-gray-300"
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {groups.length === 0 && (
        <p className="text-sm text-gray-500">No groups yet. Create one by pressing Enter.</p>
      )}
    </div>
  )
}
