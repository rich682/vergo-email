"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Edit2, X, Check, Users } from "lucide-react"

interface Group {
  id: string
  name: string
  color?: string | null
  description?: string | null
  _count?: { entities: number }
}

interface GroupsManagerProps {
  groups: Group[]
  onGroupsChange: () => void
}

export function GroupsManager({ groups, onGroupsChange }: GroupsManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [newGroupName, setNewGroupName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newGroupName.trim()) return
    
    setCreating(true)
    setError(null)
    
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() })
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to create group")
      }
      
      setNewGroupName("")
      onGroupsChange()
    } catch (err: any) {
      setError(err.message || "Failed to create group")
    } finally {
      setCreating(false)
    }
  }

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return
    
    setError(null)
    
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() })
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update group")
      }
      
      setEditingId(null)
      setEditName("")
      onGroupsChange()
    } catch (err: any) {
      setError(err.message || "Failed to update group")
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the group "${name}"? Contacts in this group will not be deleted.`)) {
      return
    }
    
    setDeleting(id)
    setError(null)
    
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: "DELETE"
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete group")
      }
      
      onGroupsChange()
    } catch (err: any) {
      setError(err.message || "Failed to delete group")
    } finally {
      setDeleting(null)
    }
  }

  const startEdit = (group: Group) => {
    setEditingId(group.id)
    setEditName(group.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName("")
  }

  return (
    <div className="space-y-6">
      {/* Create new group */}
      <div className="space-y-2">
        <Label>Create New Group</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Enter group name..."
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleCreate()
              }
            }}
          />
          <Button onClick={handleCreate} disabled={creating || !newGroupName.trim()}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Groups list */}
      <div className="space-y-2">
        <Label>Existing Groups ({groups.length})</Label>
        {groups.length === 0 ? (
          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 text-center text-gray-500 text-sm">
            No groups yet. Create one above.
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                {editingId === group.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleUpdate(group.id)
                        } else if (e.key === "Escape") {
                          cancelEdit()
                        }
                      }}
                    />
                    <Button size="sm" variant="ghost" onClick={() => handleUpdate(group.id)}>
                      <Check className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="w-4 h-4 text-gray-500" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="font-medium text-sm">{group.name}</div>
                        <div className="text-xs text-gray-500">
                          {group._count?.entities || 0} member{(group._count?.entities || 0) !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(group)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(group.id, group.name)}
                        disabled={deleting === group.id}
                        className="text-gray-500 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Groups help organize contacts. Deleting a group does not delete the contacts in it.
      </p>
    </div>
  )
}
