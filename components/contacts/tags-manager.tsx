"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Tag as TagIcon, AlertCircle, Edit2, Check, X } from "lucide-react"

interface Tag {
  id: string
  name: string
  displayName: string
  description?: string | null
  contactCount: number
}

interface TagsManagerProps {
  onTagsChange?: () => void
}

export function TagsManager({ onTagsChange }: TagsManagerProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [newTagName, setNewTagName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDisplayName, setEditDisplayName] = useState("")

  useEffect(() => {
    fetchTags()
  }, [])

  const fetchTags = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/contacts/tags")
      if (res.ok) {
        const data = await res.json()
        setTags(data.tags || [])
      }
    } catch (err) {
      console.error("Error fetching tags:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newTagName.trim()) return
    
    // Normalize tag name (lowercase, replace spaces with underscores)
    const normalizedName = newTagName.trim().toLowerCase().replace(/\s+/g, "_")
    
    // Check if tag already exists
    if (tags.some(t => t.name.toLowerCase() === normalizedName)) {
      setError("This tag already exists")
      return
    }
    
    // Reserved names
    const reserved = ["firstname", "lastname", "email", "phone", "type", "groups"]
    if (reserved.includes(normalizedName)) {
      setError("This tag name is reserved")
      return
    }
    
    setCreating(true)
    setError(null)
    
    try {
      const res = await fetch("/api/contacts/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tagName: normalizedName,
          displayName: newTagName.trim() // Preserve original casing for display
        })
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to create tag")
      }
      
      setNewTagName("")
      fetchTags()
      onTagsChange?.()
    } catch (err: any) {
      setError(err.message || "Failed to create tag")
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (tag: Tag) => {
    if (tag.contactCount > 0) {
      if (!confirm(`This tag is used by ${tag.contactCount} contact(s). Deleting it will remove this personalization data from all contacts. This cannot be undone. Continue?`)) {
        return
      }
    } else {
      if (!confirm(`Are you sure you want to delete the tag "${tag.displayName}"?`)) {
        return
      }
    }
    
    setDeleting(tag.id)
    setError(null)
    
    try {
      const res = await fetch(`/api/contacts/tags?tagId=${encodeURIComponent(tag.id)}`, {
        method: "DELETE"
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete tag")
      }
      
      fetchTags()
      onTagsChange?.()
    } catch (err: any) {
      setError(err.message || "Failed to delete tag")
    } finally {
      setDeleting(null)
    }
  }

  const startEditing = (tag: Tag) => {
    setEditingId(tag.id)
    setEditDisplayName(tag.displayName)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditDisplayName("")
  }

  const saveEdit = async (tagId: string) => {
    if (!editDisplayName.trim()) {
      cancelEditing()
      return
    }

    try {
      const res = await fetch("/api/contacts/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tagId,
          displayName: editDisplayName.trim()
        })
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update tag")
      }
      
      fetchTags()
      onTagsChange?.()
    } catch (err: any) {
      setError(err.message || "Failed to update tag")
    } finally {
      cancelEditing()
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading tags...</div>
  }

  return (
    <div className="space-y-6">
      {/* Create new tag */}
      <div className="space-y-2">
        <Label>Create New Tag</Label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g., Invoice Number, Due Date..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleCreate()
              }
            }}
          />
          <Button onClick={handleCreate} disabled={creating || !newTagName.trim()}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Tag names will be normalized for use in templates (e.g., &quot;Invoice Number&quot; → invoice_number).
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tags list */}
      <div className="space-y-2">
        <Label>Existing Tags ({tags.length})</Label>
        {tags.length === 0 ? (
          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 text-center text-gray-500 text-sm">
            <div className="flex flex-col items-center gap-2">
              <TagIcon className="w-8 h-8 text-gray-300" />
              <div>No personalization tags yet.</div>
              <div className="text-xs">Create tags here or import contacts with custom columns to auto-create them.</div>
            </div>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3 flex-1">
                  <TagIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {editingId === tag.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(tag.id)
                            if (e.key === "Escape") cancelEditing()
                          }}
                        />
                        <Button size="sm" variant="ghost" onClick={() => saveEdit(tag.id)} className="h-8 w-8 p-0">
                          <Check className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEditing} className="h-8 w-8 p-0">
                          <X className="w-4 h-4 text-gray-500" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-sm">{tag.displayName}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <code className="bg-gray-100 px-1 rounded">{`{{${tag.name}}}`}</code>
                          <span>•</span>
                          <span>{tag.contactCount} contact{tag.contactCount !== 1 ? "s" : ""}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {editingId !== tag.id && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEditing(tag)}
                      className="text-gray-500 hover:text-blue-600"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(tag)}
                      disabled={deleting === tag.id}
                      className="text-gray-500 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <div className="font-medium mb-1">About Personalization Tags</div>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>Tags store custom data for each contact (e.g., invoice numbers, due dates)</li>
              <li>Import contacts via CSV/Excel to bulk-add tag values</li>
              <li>Use tags in email templates with {"{{tag_name}}"} syntax</li>
              <li>Filter contacts by tags to target specific groups</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
