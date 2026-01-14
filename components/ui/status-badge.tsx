/**
 * StatusBadge - Status indicator with consistent styling
 * 
 * Usage:
 * <StatusBadge status="ACTIVE" />
 * <StatusBadge status="Custom Status" />
 */

interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
  className?: string
}

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Active' },
  WAITING: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Waiting' },
  COMPLETED: { bg: 'bg-green-50', text: 'text-green-700', label: 'Completed' },
  ARCHIVED: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Archived' },
}

export function StatusBadge({ status, size = 'md', className = '' }: StatusBadgeProps) {
  const style = statusStyles[status] || {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    label: status,
  }

  const sizeClasses = size === 'sm'
    ? 'text-xs px-1.5 py-0.5'
    : 'text-xs px-2 py-1'

  return (
    <span
      className={`
        inline-flex items-center rounded-full font-medium
        ${sizeClasses}
        ${style.bg}
        ${style.text}
        ${className}
      `}
    >
      {style.label}
    </span>
  )
}
