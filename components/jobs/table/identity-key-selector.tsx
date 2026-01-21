"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Key, AlertCircle } from "lucide-react"

interface Column {
  id: string
  label: string
}

interface IdentityKeySelectorProps {
  columns: Column[]
  value: string | null
  onChange: (columnId: string) => void
  disabled?: boolean
}

export function IdentityKeySelector({ columns, value, onChange, disabled }: IdentityKeySelectorProps) {
  const hasColumns = columns.length > 0
  const selectedColumn = columns.find(c => c.id === value)

  if (!hasColumns) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border rounded-md text-sm text-gray-500">
        <AlertCircle className="w-4 h-4" />
        <span>Add columns first</span>
      </div>
    )
  }

  return (
    <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select identity column...">
          {selectedColumn && (
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              <span>{selectedColumn.label}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {columns.map((column) => (
          <SelectItem key={column.id} value={column.id}>
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              <span>{column.label}</span>
              <span className="text-xs text-gray-400">({column.id})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
