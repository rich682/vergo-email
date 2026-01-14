"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Building2, Lock } from "lucide-react"

// Built-in organization types that cannot be deleted
const BUILT_IN_TYPES = [
  { id: "EMPLOYEE", label: "Employee", description: "Internal team members" },
  { id: "CLIENT", label: "Client", description: "Customers and clients" },
  { id: "VENDOR", label: "Vendor", description: "Suppliers and vendors" },
  { id: "CONTRACTOR", label: "Contractor", description: "External contractors" },
  { id: "MANAGEMENT", label: "Management", description: "Leadership and executives" },
]

interface CustomType {
  label: string
  count: number
}

interface TypesManagerProps {
  onTypesChange?: () => void
}

export function TypesManager({ onTypesChange }: TypesManagerProps) {
  const [customTypes, setCustomTypes] = useState<CustomType[]>([])
  const [builtInCounts, setBuiltInCounts] = useState<Record<string, number>>({})
  const [newTypeName, setNewTypeName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTypeCounts()
  }, [])

  const fetchTypeCounts = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/contacts/type-counts")
      if (res.ok) {
        const data = await res.json()
        setBuiltInCounts(data.builtInCounts || {})
        setCustomTypes(data.customTypes || [])
      }
    } catch (err) {
      console.error("Error fetching type counts:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newTypeName.trim()) return
    
    // Check if name already exists
    const normalizedName = newTypeName.trim().toUpperCase()
    if (BUILT_IN_TYPES.some(t => t.id === normalizedName || t.label.toUpperCase() === normalizedName)) {
      setError("This organization name is reserved")
      return
    }
    if (customTypes.some(t => t.label.toUpperCase() === normalizedName)) {
      setError("This custom organization already exists")
      return
    }
    
    setCreating(true)
    setError(null)
    
    try {
      const res = await fetch("/api/contacts/custom-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newTypeName.trim() })
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to create organization")
      }
      
      setNewTypeName("")
      fetchTypeCounts()
      onTypesChange?.()
    } catch (err: any) {
      setError(err.message || "Failed to create organization")
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (label: string) => {
    const count = customTypes.find(t => t.label === label)?.count || 0
    if (count > 0) {
      if (!confirm(`This organization is used by ${count} contact(s). Deleting it will set those contacts to "Unknown" organization. Continue?`)) {
        return
      }
    } else {
      if (!confirm(`Are you sure you want to delete the custom organization "${label}"?`)) {
        return
      }
    }
    
    setError(null)
    
    try {
      const res = await fetch(`/api/contacts/custom-types?label=${encodeURIComponent(label)}`, {
        method: "DELETE"
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete organization")
      }
      
      fetchTypeCounts()
      onTypesChange?.()
    } catch (err: any) {
      setError(err.message || "Failed to delete organization")
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading organizations...</div>
  }

  return (
    <div className="space-y-6">
      {/* Built-in organizations */}
      <div className="space-y-2">
        <Label>Built-in Organizations</Label>
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          {BUILT_IN_TYPES.map((type) => (
            <div
              key={type.id}
              className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0"
            >
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-blue-500" />
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {type.label}
                    <Lock className="w-3 h-3 text-gray-400" />
                  </div>
                  <div className="text-xs text-gray-500">{type.description}</div>
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {builtInCounts[type.id] || 0} contact{(builtInCounts[type.id] || 0) !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500">Built-in organizations cannot be deleted.</p>
      </div>

      {/* Create custom organization */}
      <div className="space-y-2">
        <Label>Create Custom Organization</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Enter organization name..."
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleCreate()
              }
            }}
          />
          <Button onClick={handleCreate} disabled={creating || !newTypeName.trim()}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Custom organizations list */}
      <div className="space-y-2">
        <Label>Custom Organizations ({customTypes.length})</Label>
        {customTypes.length === 0 ? (
          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 text-center text-gray-500 text-sm">
            No custom organizations yet. Create one above.
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            {customTypes.map((type) => (
              <div
                key={type.label}
                className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-purple-500" />
                  <div>
                    <div className="font-medium text-sm">{type.label}</div>
                    <div className="text-xs text-gray-500">
                      {type.count} contact{type.count !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(type.label)}
                  className="text-gray-500 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Custom organizations help categorize contacts beyond the built-in options. When creating a contact, select "Custom" as the organization and enter your custom label.
      </p>
    </div>
  )
}
