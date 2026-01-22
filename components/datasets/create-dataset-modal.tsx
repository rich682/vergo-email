"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, GripVertical } from "lucide-react"

interface SchemaColumn {
  key: string
  label: string
  type: "text" | "number" | "date" | "boolean" | "currency"
  required: boolean
}

interface CreateDatasetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  // Task-linked mode: when provided, creates schema via /api/data/tasks/[lineageId]/schema
  lineageId?: string
  taskName?: string
}

const COLUMN_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/No" },
  { value: "currency", label: "Currency" },
]

export function CreateDatasetModal({ 
  open, 
  onOpenChange, 
  onCreated,
  lineageId,
  taskName,
}: CreateDatasetModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [columns, setColumns] = useState<SchemaColumn[]>([
    { key: "id", label: "ID", type: "text", required: true },
  ])
  const [identityKey, setIdentityKey] = useState("id")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateKey = (label: string): string => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .replace(/^_|_$/g, "")
      || "column"
  }

  const addColumn = () => {
    const newKey = `column_${columns.length + 1}`
    setColumns([
      ...columns,
      { key: newKey, label: `Column ${columns.length + 1}`, type: "text", required: false },
    ])
  }

  const updateColumn = (index: number, updates: Partial<SchemaColumn>) => {
    const newColumns = [...columns]
    
    // If updating label, also update key
    if (updates.label !== undefined) {
      updates.key = generateKey(updates.label)
      
      // Ensure key is unique
      let baseKey = updates.key
      let counter = 1
      while (newColumns.some((col, i) => i !== index && col.key === updates.key)) {
        updates.key = `${baseKey}_${counter}`
        counter++
      }
    }
    
    newColumns[index] = { ...newColumns[index], ...updates }
    setColumns(newColumns)

    // Update identity key if the column being updated was the identity key
    if (updates.key && columns[index].key === identityKey) {
      setIdentityKey(updates.key)
    }
  }

  const removeColumn = (index: number) => {
    const removedKey = columns[index].key
    const newColumns = columns.filter((_, i) => i !== index)
    setColumns(newColumns)
    
    // If removing the identity key column, reset to first column
    if (removedKey === identityKey && newColumns.length > 0) {
      setIdentityKey(newColumns[0].key)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    if (columns.length === 0) {
      setError("At least one column is required")
      return
    }
    if (!identityKey || !columns.some(c => c.key === identityKey)) {
      setError("Please select an identity key column")
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Use task-linked endpoint if lineageId is provided
      const url = lineageId 
        ? `/api/data/tasks/${lineageId}/schema`
        : "/api/datasets"

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          schema: columns,
          identityKey,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create data schema")
      }

      // Reset form
      setName("")
      setDescription("")
      setColumns([{ key: "id", label: "ID", type: "text", required: true }])
      setIdentityKey("id")
      
      onCreated()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {taskName ? `Create Data Schema for "${taskName}"` : "Create New Dataset"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Name & Description */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Employee List, Vendor Master"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this dataset"
              />
            </div>
          </div>

          {/* Schema Editor */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label>Schema Columns</Label>
              <Button variant="outline" size="sm" onClick={addColumn}>
                <Plus className="w-4 h-4 mr-1" />
                Add Column
              </Button>
            </div>

            <div className="space-y-2 bg-gray-50 rounded-lg p-4">
              {columns.map((column, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-white rounded-lg p-3 border border-gray-200"
                >
                  <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  
                  <Input
                    value={column.label}
                    onChange={(e) => updateColumn(index, { label: e.target.value })}
                    placeholder="Column name"
                    className="flex-1"
                  />

                  <Select
                    value={column.type}
                    onValueChange={(value) => updateColumn(index, { type: value as SchemaColumn["type"] })}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLUMN_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <label className="flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={column.required}
                      onChange={(e) => updateColumn(index, { required: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    Required
                  </label>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeColumn(index)}
                    disabled={columns.length === 1}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Identity Key Selection */}
          <div>
            <Label htmlFor="identityKey">Identity Key (required)</Label>
            <p className="text-sm text-gray-500 mb-2">
              Select the column that uniquely identifies each row
            </p>
            <Select value={identityKey} onValueChange={setIdentityKey}>
              <SelectTrigger>
                <SelectValue placeholder="Select identity key column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((column) => (
                  <SelectItem key={column.key} value={column.key}>
                    {column.label} ({column.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Creating..." : (lineageId ? "Create Schema" : "Create Dataset")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
