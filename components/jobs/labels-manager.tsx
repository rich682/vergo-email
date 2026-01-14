"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, X, Edit2, Trash2, Tag, Palette } from "lucide-react"

// Types
interface MetadataFieldSchema {
  key: string
  label: string
  type: "text" | "number" | "date" | "currency"
}

interface JobLabel {
  id: string
  jobId: string
  organizationId: string
  name: string
  color: string | null
  metadataSchema: MetadataFieldSchema[]
  contactCount: number
  createdAt: string
  updatedAt: string
}

interface LabelsManagerProps {
  jobId: string
  canEdit?: boolean
}

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
]

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "currency", label: "Currency" },
]

export function LabelsManager({ jobId, canEdit = true }: LabelsManagerProps) {
  const [labels, setLabels] = useState<JobLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState<JobLabel | null>(null)

  // Create form state
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [newFields, setNewFields] = useState<MetadataFieldSchema[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch labels
  const fetchLabels = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/jobs/${jobId}/labels`, {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setLabels(data.labels || [])
      }
    } catch (err) {
      console.error("Error fetching labels:", err)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    fetchLabels()
  }, [fetchLabels])

  // Reset form
  const resetForm = () => {
    setNewName("")
    setNewColor(PRESET_COLORS[0])
    setNewFields([])
    setError(null)
  }

  // Create label
  const handleCreate = async () => {
    if (!newName.trim()) {
      setError("Label name is required")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/jobs/${jobId}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          metadataSchema: newFields,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setLabels((prev) => [...prev, data.label])
        setIsCreateOpen(false)
        resetForm()
      } else {
        const data = await response.json()
        setError(data.error || "Failed to create label")
      }
    } catch (err) {
      setError("Failed to create label")
    } finally {
      setSaving(false)
    }
  }

  // Update label
  const handleUpdate = async () => {
    if (!editingLabel || !newName.trim()) {
      setError("Label name is required")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/jobs/${jobId}/labels/${editingLabel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          metadataSchema: newFields,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setLabels((prev) =>
          prev.map((l) => (l.id === editingLabel.id ? data.label : l))
        )
        setIsEditOpen(false)
        setEditingLabel(null)
        resetForm()
      } else {
        const data = await response.json()
        setError(data.error || "Failed to update label")
      }
    } catch (err) {
      setError("Failed to update label")
    } finally {
      setSaving(false)
    }
  }

  // Delete label
  const handleDelete = async (labelId: string) => {
    if (!confirm("Delete this label? This will remove it from all contacts.")) {
      return
    }

    try {
      const response = await fetch(`/api/jobs/${jobId}/labels/${labelId}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (response.ok) {
        setLabels((prev) => prev.filter((l) => l.id !== labelId))
      }
    } catch (err) {
      console.error("Error deleting label:", err)
    }
  }

  // Open edit dialog
  const openEdit = (label: JobLabel) => {
    setEditingLabel(label)
    setNewName(label.name)
    setNewColor(label.color || PRESET_COLORS[0])
    setNewFields(label.metadataSchema || [])
    setError(null)
    setIsEditOpen(true)
  }

  // Add metadata field
  const addField = () => {
    setNewFields((prev) => [
      ...prev,
      { key: `field_${prev.length + 1}`, label: "", type: "text" },
    ])
  }

  // Update metadata field
  const updateField = (index: number, updates: Partial<MetadataFieldSchema>) => {
    setNewFields((prev) =>
      prev.map((f, i) => {
        if (i === index) {
          const updated = { ...f, ...updates }
          // Auto-generate key from label
          if (updates.label !== undefined) {
            updated.key = updates.label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_|_$/g, "")
          }
          return updated
        }
        return f
      })
    )
  }

  // Remove metadata field
  const removeField = (index: number) => {
    setNewFields((prev) => prev.filter((_, i) => i !== index))
  }

  // Render form content (shared between create and edit)
  const renderForm = () => (
    <div className="space-y-4 pt-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <Label htmlFor="label-name">Label Name</Label>
        <Input
          id="label-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g., unpaid, received, pending"
          className="mt-1"
        />
      </div>

      {/* Color */}
      <div>
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setNewColor(color)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                newColor === color
                  ? "border-gray-900 scale-110"
                  : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Metadata Fields */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Metadata Fields (Optional)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addField}
            className="h-7 text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Field
          </Button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Define custom fields to track data for contacts with this label (e.g., invoice number, amount)
        </p>
        {newFields.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-md">
            No metadata fields defined
          </p>
        ) : (
          <div className="space-y-2">
            {newFields.map((field, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-md"
              >
                <Input
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                  placeholder="Field name"
                  className="flex-1 h-8 text-sm"
                />
                <Select
                  value={field.type}
                  onValueChange={(v) =>
                    updateField(index, { type: v as MetadataFieldSchema["type"] })
                  }
                >
                  <SelectTrigger className="w-28 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => removeField(index)}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => {
            setIsCreateOpen(false)
            setIsEditOpen(false)
            setEditingLabel(null)
            resetForm()
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={editingLabel ? handleUpdate : handleCreate}
          disabled={saving || !newName.trim()}
        >
          {saving ? "Saving..." : editingLabel ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-gray-500" />
          <h4 className="text-sm font-medium text-gray-900">Contact Labels</h4>
          {labels.length > 0 && (
            <span className="text-xs text-gray-500">({labels.length})</span>
          )}
        </div>
        {canEdit && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" />
                New Label
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Label</DialogTitle>
              </DialogHeader>
              {renderForm()}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Labels List */}
      {labels.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
          <Tag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No labels defined yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Create labels to categorize contacts (e.g., paid, unpaid)
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {labels.map((label) => (
            <div
              key={label.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: label.color || "#6b7280" }}
                />
                <div>
                  <div className="font-medium text-sm text-gray-900 capitalize">
                    {label.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {label.contactCount} contact{label.contactCount !== 1 ? "s" : ""}
                    {label.metadataSchema.length > 0 && (
                      <span className="ml-2">
                        · {label.metadataSchema.length} field{label.metadataSchema.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(label)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(label.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Label</DialogTitle>
          </DialogHeader>
          {renderForm()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
