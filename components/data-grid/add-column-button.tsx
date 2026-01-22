"use client"

/**
 * Add Column Button
 * 
 * Monday.com-style column type selector with:
 * - Search field
 * - Categorized column types with colored icons
 * - Direct add (no name confirmation step)
 */

import { useState, useMemo } from "react"
import { 
  Plus, Search, Type, CheckSquare, Paperclip, User, 
  Calculator, ListChecks, X, Loader2
} from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type AppColumnType = "text" | "status" | "attachment" | "user" | "formula"

interface ColumnTypeOption {
  type: AppColumnType
  label: string
  description: string
  icon: React.ReactNode
  iconBg: string
  category: "essentials" | "super_useful"
}

const COLUMN_TYPES: ColumnTypeOption[] = [
  // Essentials
  {
    type: "status",
    label: "Status",
    description: "Track progress with colored labels",
    icon: <ListChecks className="w-4 h-4 text-white" />,
    iconBg: "bg-emerald-500",
    category: "essentials",
  },
  {
    type: "text",
    label: "Text",
    description: "Free text field for notes",
    icon: <Type className="w-4 h-4 text-white" />,
    iconBg: "bg-orange-500",
    category: "essentials",
  },
  {
    type: "user",
    label: "People",
    description: "Assign team members",
    icon: <User className="w-4 h-4 text-white" />,
    iconBg: "bg-blue-500",
    category: "essentials",
  },
  // Super useful
  {
    type: "attachment",
    label: "Files",
    description: "Attach documents and images",
    icon: <Paperclip className="w-4 h-4 text-white" />,
    iconBg: "bg-red-400",
    category: "super_useful",
  },
  {
    type: "formula",
    label: "Formula",
    description: "Calculate values automatically",
    icon: <Calculator className="w-4 h-4 text-white" />,
    iconBg: "bg-cyan-500",
    category: "super_useful",
  },
]

interface AddColumnButtonProps {
  onAddColumn: (type: AppColumnType, label: string) => Promise<void>
  disabled?: boolean
  variant?: "header" | "button"
}

export function AddColumnButton({ onAddColumn, disabled, variant = "button" }: AddColumnButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittingType, setSubmittingType] = useState<AppColumnType | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Filter column types by search
  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) return COLUMN_TYPES
    const query = searchQuery.toLowerCase()
    return COLUMN_TYPES.filter(
      (t) => t.label.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)
    )
  }, [searchQuery])

  const essentials = filteredTypes.filter((t) => t.category === "essentials")
  const superUseful = filteredTypes.filter((t) => t.category === "super_useful")

  const handleSelectType = async (option: ColumnTypeOption) => {
    // Formula is coming soon
    if (option.type === "formula") {
      setError("Formula columns coming soon!")
      setTimeout(() => setError(null), 2000)
      return
    }
    
    setIsSubmitting(true)
    setSubmittingType(option.type)
    setError(null)

    try {
      // Use the default label directly - no confirmation step
      await onAddColumn(option.type, option.label)
      setIsOpen(false)
      setSearchQuery("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add column")
    } finally {
      setIsSubmitting(false)
      setSubmittingType(null)
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      setSearchQuery("")
      setError(null)
    }
  }

  const triggerContent = variant === "header" ? (
    <button
      disabled={disabled || isSubmitting}
      className={`
        flex items-center justify-center
        w-10 h-full
        text-gray-400 hover:text-gray-600
        bg-gray-50 hover:bg-gray-100
        border-r border-gray-300
        transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      <Plus className="w-5 h-5" />
    </button>
  ) : (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || isSubmitting}
      className="h-8"
    >
      <Plus className="w-4 h-4 mr-1" />
      Add Column
    </Button>
  )

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {triggerContent}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" sideOffset={4}>
        <div>
          {/* Header with search */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search or describe your column"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm border-blue-500 focus-visible:ring-blue-500"
                autoFocus
              />
              {isOpen && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>

          {/* Column types */}
          <div className="p-2 max-h-80 overflow-y-auto">
            {error && (
              <div className="px-2 py-1.5 mb-2 text-xs text-amber-700 bg-amber-50 rounded">
                {error}
              </div>
            )}
            
            {/* Essentials */}
            {essentials.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Essentials
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {essentials.map((option) => (
                    <ColumnTypeButton
                      key={option.type}
                      option={option}
                      onClick={() => handleSelectType(option)}
                      isLoading={isSubmitting && submittingType === option.type}
                      disabled={isSubmitting}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Super useful */}
            {superUseful.length > 0 && (
              <>
                <div className="px-2 py-1.5 mt-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Super useful
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {superUseful.map((option) => (
                    <ColumnTypeButton
                      key={option.type}
                      option={option}
                      onClick={() => handleSelectType(option)}
                      isLoading={isSubmitting && submittingType === option.type}
                      disabled={isSubmitting}
                    />
                  ))}
                </div>
              </>
            )}

            {filteredTypes.length === 0 && (
              <div className="px-2 py-8 text-sm text-gray-500 text-center">
                No matching column types
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Column type button component
function ColumnTypeButton({ 
  option, 
  onClick,
  isLoading,
  disabled,
}: { 
  option: ColumnTypeOption
  onClick: () => void 
  isLoading?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={`
        flex items-center gap-2 px-2 py-2 rounded 
        hover:bg-gray-100 transition-colors text-left w-full
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${option.iconBg}`}>
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-white animate-spin" />
        ) : (
          option.icon
        )}
      </span>
      <span className="text-sm text-gray-700 truncate">{option.label}</span>
    </button>
  )
}
