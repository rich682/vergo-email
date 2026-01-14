/**
 * Chip - Label/tag component with optional remove button
 * 
 * Usage:
 * <Chip label="January" color="blue" />
 * <Chip label="Urgent" color="amber" removable onRemove={() => {}} />
 */

import { X } from "lucide-react"

type ChipColor = 'gray' | 'blue' | 'green' | 'purple' | 'amber' | 'red'

interface ChipProps {
  label: string
  color?: ChipColor
  removable?: boolean
  onRemove?: () => void
  size?: 'sm' | 'md'
  onClick?: () => void
  className?: string
}

const colorStyles: Record<ChipColor, string> = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  purple: 'bg-purple-50 text-purple-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
}

export function Chip({ 
  label, 
  color = 'gray', 
  removable, 
  onRemove, 
  size = 'md',
  onClick,
  className = ''
}: ChipProps) {
  const sizeClasses = size === 'sm' 
    ? 'text-xs px-1.5 py-0.5 gap-1' 
    : 'text-xs px-2 py-1 gap-1.5'

  const Component = onClick ? 'button' : 'span'

  return (
    <Component
      onClick={onClick}
      className={`
        inline-flex items-center rounded-full font-medium
        ${sizeClasses}
        ${colorStyles[color]}
        ${onClick ? 'hover:opacity-80 cursor-pointer transition-opacity' : ''}
        ${className}
      `}
    >
      {label}
      {removable && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="hover:opacity-70 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </Component>
  )
}
