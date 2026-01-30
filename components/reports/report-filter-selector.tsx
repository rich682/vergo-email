"use client"

/**
 * ReportFilterSelector
 * 
 * A multi-property filter selector for reports. Instead of selecting from
 * pre-built slices, users can dynamically select values across multiple
 * properties (e.g., Location, PM, Brand) with multi-select checkboxes.
 * 
 * Each property gets its own dropdown with:
 * - Search filter for many values
 * - Select all / Clear all
 * - Checkbox list of values
 * - Shows "(All)" or count of selected when collapsed
 */

import { useState, useCallback, useMemo, useEffect } from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// ============================================
// Types
// ============================================

export interface FilterableProperty {
  key: string           // Column key in database (e.g., "location", "pm_name")
  label: string         // Display name (e.g., "Location", "PM")
  values: string[]      // Available unique values
}

export interface FilterBindings {
  [columnKey: string]: string[]  // Selected values per column
}

interface ReportFilterSelectorProps {
  properties: FilterableProperty[]
  value: FilterBindings
  onChange: (bindings: FilterBindings) => void
  loading?: boolean
  disabled?: boolean
}

// ============================================
// Main Component
// ============================================

export function ReportFilterSelector({
  properties,
  value,
  onChange,
  loading = false,
  disabled = false,
}: ReportFilterSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
        Loading filters...
      </div>
    )
  }

  if (properties.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No filterable properties available
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        Filter by selecting values for each property. Leave as &quot;All&quot; to include all values.
      </div>
      <div className="flex flex-wrap gap-2">
        {properties.map((property) => (
          <PropertyFilter
            key={property.key}
            property={property}
            selectedValues={value[property.key] || []}
            onSelectionChange={(selected) => {
              onChange({
                ...value,
                [property.key]: selected,
              })
            }}
            disabled={disabled}
          />
        ))}
      </div>
      
      {/* Active filters summary */}
      <ActiveFiltersSummary 
        properties={properties} 
        bindings={value}
        onClear={(key) => {
          const next = { ...value }
          delete next[key]
          onChange(next)
        }}
        onClearAll={() => onChange({})}
      />
    </div>
  )
}

// ============================================
// Property Filter Dropdown
// ============================================

interface PropertyFilterProps {
  property: FilterableProperty
  selectedValues: string[]
  onSelectionChange: (values: string[]) => void
  disabled?: boolean
}

function PropertyFilter({
  property,
  selectedValues,
  onSelectionChange,
  disabled = false,
}: PropertyFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selectedValues))

  // Sync local state when prop changes
  useEffect(() => {
    setLocalSelected(new Set(selectedValues))
  }, [selectedValues])

  // Reset search when closed
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open)
    if (open) {
      setSearchQuery("")
      setLocalSelected(new Set(selectedValues))
    }
  }, [selectedValues])

  // Filter values by search
  const filteredValues = useMemo(() => {
    if (!searchQuery.trim()) return property.values
    const query = searchQuery.toLowerCase()
    return property.values.filter((v) => v.toLowerCase().includes(query))
  }, [property.values, searchQuery])

  const handleToggle = useCallback((value: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setLocalSelected(new Set(property.values))
  }, [property.values])

  const handleClearAll = useCallback(() => {
    setLocalSelected(new Set())
  }, [])

  const handleApply = useCallback(() => {
    // If all or none selected, treat as "all" (no filter)
    if (localSelected.size === 0 || localSelected.size === property.values.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(Array.from(localSelected))
    }
    setIsOpen(false)
  }, [localSelected, property.values.length, onSelectionChange])

  // Display text for the trigger
  const displayText = useMemo(() => {
    if (selectedValues.length === 0 || selectedValues.length === property.values.length) {
      return "All"
    }
    if (selectedValues.length === 1) {
      return selectedValues[0]
    }
    return `${selectedValues.length} selected`
  }, [selectedValues, property.values.length])

  const hasFilter = selectedValues.length > 0 && selectedValues.length < property.values.length

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={`
            h-8 gap-1 px-2 text-xs font-normal
            ${hasFilter ? "border-blue-500 bg-blue-50 text-blue-700" : ""}
          `}
        >
          <span className="font-medium">{property.label}:</span>
          <span className="max-w-[120px] truncate">{displayText}</span>
          <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b border-gray-200">
          <div className="font-medium text-sm">{property.label}</div>
        </div>

        {/* Search */}
        {property.values.length > 8 && (
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-sm pl-7"
              />
            </div>
          </div>
        )}

        {/* Select all / Clear */}
        <div className="flex items-center justify-between px-2 py-1.5 text-xs border-b border-gray-100">
          <button
            className="text-gray-600 hover:text-gray-800"
            onClick={handleSelectAll}
          >
            Select all
          </button>
          <button
            className="text-gray-600 hover:text-gray-800"
            onClick={handleClearAll}
          >
            Clear
          </button>
        </div>

        {/* Values list */}
        <div className="max-h-56 overflow-y-auto">
          {filteredValues.length === 0 ? (
            <div className="px-2 py-4 text-sm text-gray-500 text-center">
              {searchQuery ? "No matching values" : "No values available"}
            </div>
          ) : (
            filteredValues.map((value) => (
              <label
                key={value}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
              >
                <Checkbox
                  checked={localSelected.has(value)}
                  onChange={() => handleToggle(value)}
                />
                <span className="text-sm truncate flex-1" title={value}>
                  {value}
                </span>
              </label>
            ))
          )}
        </div>

        {/* Apply button */}
        <div className="p-2 border-t border-gray-200">
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleApply}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ============================================
// Active Filters Summary
// ============================================

interface ActiveFiltersSummaryProps {
  properties: FilterableProperty[]
  bindings: FilterBindings
  onClear: (key: string) => void
  onClearAll: () => void
}

function ActiveFiltersSummary({
  properties,
  bindings,
  onClear,
  onClearAll,
}: ActiveFiltersSummaryProps) {
  const activeFilters = properties.filter(
    (p) => bindings[p.key]?.length > 0 && bindings[p.key].length < p.values.length
  )

  if (activeFilters.length === 0) {
    return null
  }

  return (
    <div className="pt-2 border-t border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">Active filters</span>
        <button
          className="text-xs text-gray-500 hover:text-gray-700"
          onClick={onClearAll}
        >
          Clear all
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {activeFilters.map((property) => {
          const selected = bindings[property.key]
          const displayCount = selected.length > 2 
            ? `${selected.slice(0, 2).join(", ")} +${selected.length - 2}`
            : selected.join(", ")
          
          return (
            <div
              key={property.key}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs"
            >
              <span className="font-medium">{property.label}:</span>
              <span className="max-w-[150px] truncate">{displayCount}</span>
              <button
                className="ml-0.5 p-0.5 hover:bg-blue-100 rounded-full"
                onClick={() => onClear(property.key)}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================
// Checkbox Component
// ============================================

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        onChange()
      }}
      className={`
        w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors
        ${checked 
          ? "bg-blue-600 border-blue-600" 
          : "bg-white border-gray-300 hover:border-gray-400"
        }
      `}
    >
      {checked && <Check className="w-3 h-3 text-white" />}
    </button>
  )
}
