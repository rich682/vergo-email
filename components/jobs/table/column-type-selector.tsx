"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Type,
  Hash,
  Calendar,
  DollarSign,
  Percent,
  CheckSquare,
  User,
  Paperclip,
  FileText,
  Calculator
} from "lucide-react"

export type ColumnType = "text" | "number" | "date" | "currency" | "percent" | "status" | "person" | "attachment" | "notes" | "amount" | "formula"

interface ColumnTypeOption {
  value: ColumnType
  label: string
  icon: React.ReactNode
  description: string
}

const COLUMN_TYPES: ColumnTypeOption[] = [
  { value: "text", label: "Text", icon: <Type className="w-4 h-4" />, description: "Plain text values" },
  { value: "number", label: "Number", icon: <Hash className="w-4 h-4" />, description: "Numeric values" },
  { value: "currency", label: "Currency", icon: <DollarSign className="w-4 h-4" />, description: "Money amounts" },
  { value: "percent", label: "Percent", icon: <Percent className="w-4 h-4" />, description: "Percentage values" },
  { value: "date", label: "Date", icon: <Calendar className="w-4 h-4" />, description: "Date values" },
  { value: "status", label: "Status", icon: <CheckSquare className="w-4 h-4" />, description: "Status dropdown" },
  { value: "person", label: "Person", icon: <User className="w-4 h-4" />, description: "Team member" },
  { value: "attachment", label: "Attachment", icon: <Paperclip className="w-4 h-4" />, description: "File attachments" },
  { value: "notes", label: "Notes", icon: <FileText className="w-4 h-4" />, description: "Multi-line text" },
  { value: "formula", label: "Formula", icon: <Calculator className="w-4 h-4" />, description: "Calculated value" },
]

interface ColumnTypeSelectorProps {
  value: ColumnType
  onChange: (value: ColumnType) => void
  disabled?: boolean
}

export function ColumnTypeSelector({ value, onChange, disabled }: ColumnTypeSelectorProps) {
  const selectedType = COLUMN_TYPES.find(t => t.value === value)

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ColumnType)} disabled={disabled}>
      <SelectTrigger className="w-[160px]">
        <SelectValue>
          {selectedType && (
            <div className="flex items-center gap-2">
              {selectedType.icon}
              <span>{selectedType.label}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {COLUMN_TYPES.map((type) => (
          <SelectItem key={type.value} value={type.value}>
            <div className="flex items-center gap-2">
              {type.icon}
              <div>
                <div className="font-medium">{type.label}</div>
                <div className="text-xs text-gray-500">{type.description}</div>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function getColumnTypeIcon(type: ColumnType) {
  const option = COLUMN_TYPES.find(t => t.value === type)
  return option?.icon || <Type className="w-4 h-4" />
}

export function getColumnTypeLabel(type: ColumnType) {
  const option = COLUMN_TYPES.find(t => t.value === type)
  return option?.label || type
}
