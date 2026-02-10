"use client"

import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ============================================
// Types
// ============================================

export interface SyncFilter {
  column: string
  value: string
}

export interface FilterableColumn {
  key: string
  label: string
  filterable?: boolean
  filterOptions?: string[]
}

interface SyncFilterEditorProps {
  filters: SyncFilter[]
  onChange: (filters: SyncFilter[]) => void
  columns: FilterableColumn[]
}

// ============================================
// Component
// ============================================

export function SyncFilterEditor({ filters, onChange, columns }: SyncFilterEditorProps) {
  const filterableColumns = columns.filter((col) => col.filterable)

  if (filterableColumns.length === 0) return null

  const addFilter = () => {
    onChange([...filters, { column: "", value: "" }])
  }

  const updateFilter = (index: number, updates: Partial<SyncFilter>) => {
    const updated = [...filters]
    // Reset value when column changes
    if (updates.column && updates.column !== updated[index].column) {
      updated[index] = { ...updated[index], column: updates.column, value: "" }
    } else {
      updated[index] = { ...updated[index], ...updates }
    }
    onChange(updated)
  }

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>Filters (optional)</Label>
        <Button variant="outline" size="sm" onClick={addFilter}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Filter
        </Button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Only rows matching ALL filters will be included when syncing.
      </p>
      {filters.length > 0 && (
        <div className="space-y-2">
          {filters.map((filter, index) => {
            const selectedCol = filterableColumns.find((col) => col.key === filter.column)
            return (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={filter.column}
                  onValueChange={(val) => updateFilter(index, { column: val })}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Column..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filterableColumns.map((col) => (
                      <SelectItem key={col.key} value={col.key}>
                        {col.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-gray-500">=</span>
                <Select
                  value={filter.value}
                  onValueChange={(val) => updateFilter(index, { value: val })}
                  disabled={!filter.column}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={filter.column ? "Select value..." : "Select column first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedCol?.filterOptions || []).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFilter(index)}
                  className="h-9 w-9 p-0 text-gray-400 hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
