/**
 * FilterPills - Segmented control / pill filter component
 * 
 * Usage:
 * <FilterPills
 *   options={[
 *     { value: 'all', label: 'All' },
 *     { value: 'my', label: 'My Items', icon: <UserCircle /> }
 *   ]}
 *   value={filter}
 *   onChange={setFilter}
 * />
 */

import { ReactNode } from "react"

interface FilterPillOption {
  value: string
  label: string
  count?: number
  icon?: ReactNode
}

interface FilterPillsProps {
  options: FilterPillOption[]
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'
}

export function FilterPills({ options, value, onChange, size = 'md' }: FilterPillsProps) {
  const sizeClasses = size === 'sm' 
    ? 'text-xs px-2.5 py-1' 
    : 'text-sm px-3 py-1.5'

  return (
    <div className="inline-flex gap-0.5 bg-gray-100 p-1 rounded-full">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`
            ${sizeClasses}
            rounded-full font-medium transition-all duration-150
            flex items-center gap-1.5
            ${value === option.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
            }
          `}
        >
          {option.icon}
          <span>{option.label}</span>
          {option.count !== undefined && (
            <span className={`
              text-xs font-medium px-1.5 py-0.5 rounded-full
              ${value === option.value ? 'bg-gray-100' : 'bg-gray-200/60'}
            `}>
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
