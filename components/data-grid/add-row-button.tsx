"use client"

/**
 * Add Row Button
 * 
 * Monday.com-style row type selector with:
 * - Search field
 * - Categorized row types with colored icons
 * - Direct add (no name confirmation step)
 */

import { useState, useMemo } from "react"
import { 
  Plus, Search, Type, Calculator, X, Loader2
} from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

export type AppRowType = "text" | "formula"

interface RowTypeOption {
  type: AppRowType
  label: string
  description: string
  icon: React.ReactNode
  iconBg: string
  category: "essentials" | "super_useful"
}

const ROW_TYPES: RowTypeOption[] = [
  // Essentials
  {
    type: "text",
    label: "Text",
    description: "Free text row for notes",
    icon: <Type className="w-4 h-4 text-white" />,
    iconBg: "bg-orange-500",
    category: "essentials",
  },
  // Super useful
  {
    type: "formula",
    label: "Formula",
    description: "Calculate values automatically",
    icon: <Calculator className="w-4 h-4 text-white" />,
    iconBg: "bg-cyan-500",
    category: "super_useful",
  },
]

interface AddRowButtonProps {
  onAddRow: (type: AppRowType, label: string) => Promise<void>
  disabled?: boolean
}

export function AddRowButton({ onAddRow, disabled }: AddRowButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittingType, setSubmittingType] = useState<AppRowType | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Filter row types by search
  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) return ROW_TYPES
    const query = searchQuery.toLowerCase()
    return ROW_TYPES.filter(
      (t) => t.label.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)
    )
  }, [searchQuery])

  const essentials = filteredTypes.filter((t) => t.category === "essentials")
  const superUseful = filteredTypes.filter((t) => t.category === "super_useful")

  const handleSelectType = async (option: RowTypeOption) => {
    // Formula is coming soon
    if (option.type === "formula") {
      setError("Formula rows coming soon!")
      setTimeout(() => setError(null), 2000)
      return
    }
    
    setIsSubmitting(true)
    setSubmittingType(option.type)
    setError(null)

    try {
      // Use the default label directly - no confirmation step
      await onAddRow(option.type, option.label)
      setIsOpen(false)
      setSearchQuery("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add row")
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

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled || isSubmitting}
          className={`
            flex items-center justify-center
            w-full h-8
            text-gray-400 hover:text-gray-600 hover:bg-gray-100
            border border-dashed border-gray-300 hover:border-gray-400
            rounded
            transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          <Plus className="w-4 h-4 mr-1" />
          <span className="text-sm">Add Row</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" sideOffset={4}>
        <div>
          {/* Header with search */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search or describe your row"
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

          {/* Row types */}
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
                    <RowTypeButton
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
                    <RowTypeButton
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
                No matching row types
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Row type button component
function RowTypeButton({ 
  option, 
  onClick,
  isLoading,
  disabled,
}: { 
  option: RowTypeOption
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
