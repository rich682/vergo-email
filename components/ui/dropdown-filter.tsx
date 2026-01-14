/**
 * DropdownFilter - Dropdown with checkbox options for filtering
 * 
 * Usage:
 * <DropdownFilter
 *   label="Status"
 *   icon={<Clock />}
 *   options={[{ value: 'ACTIVE', label: 'Active' }]}
 *   selected={selectedStatuses}
 *   onChange={setSelectedStatuses}
 *   multiple
 * />
 */

import { ReactNode, useState, useRef, useEffect } from "react"
import { ChevronDown, Check } from "lucide-react"

interface DropdownFilterOption {
  value: string
  label: string
  count?: number
}

interface DropdownFilterProps {
  label: string
  icon?: ReactNode
  options: DropdownFilterOption[]
  selected: string | string[]
  onChange: (value: string | string[]) => void
  multiple?: boolean
  placeholder?: string
}

export function DropdownFilter({
  label,
  icon,
  options,
  selected,
  onChange,
  multiple = false,
  placeholder,
}: DropdownFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedArray = Array.isArray(selected) ? selected : selected ? [selected] : []
  const hasSelection = selectedArray.length > 0

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (value: string) => {
    if (multiple) {
      const newSelected = selectedArray.includes(value)
        ? selectedArray.filter(v => v !== value)
        : [...selectedArray, value]
      onChange(newSelected)
    } else {
      onChange(value === selected ? '' : value)
      setIsOpen(false)
    }
  }

  const getDisplayLabel = () => {
    if (!hasSelection) return placeholder || label
    if (selectedArray.length === 1) {
      const option = options.find(o => o.value === selectedArray[0])
      return option?.label || selectedArray[0]
    }
    return `${selectedArray.length} selected`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors
          ${hasSelection
            ? 'bg-gray-900 border-gray-900 text-white'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }
        `}
      >
        {icon && <span className="w-4 h-4">{icon}</span>}
        <span>{getDisplayLabel()}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[180px] max-h-64 overflow-auto">
          <div className="py-1">
            {!multiple && (
              <button
                onClick={() => {
                  onChange('')
                  setIsOpen(false)
                }}
                className={`
                  flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50
                  ${!hasSelection ? 'bg-gray-50 font-medium' : ''}
                `}
              >
                All {label}
              </button>
            )}
            {options.map(option => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`
                  flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50
                  ${selectedArray.includes(option.value) ? 'bg-gray-50' : ''}
                `}
              >
                {multiple && (
                  <div className={`
                    w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                    ${selectedArray.includes(option.value)
                      ? 'bg-gray-900 border-gray-900'
                      : 'border-gray-300'
                    }
                  `}>
                    {selectedArray.includes(option.value) && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </div>
                )}
                <span className="flex-1">{option.label}</span>
                {option.count !== undefined && (
                  <span className="text-xs text-gray-400">{option.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
