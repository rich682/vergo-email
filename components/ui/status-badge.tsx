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
  // Job statuses
  ACTIVE: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Active' },
  WAITING: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Waiting' },
  COMPLETED: { bg: 'bg-green-50', text: 'text-green-700', label: 'Completed' },
  ARCHIVED: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Archived' },
  
  // Task/Request statuses
  AWAITING_RESPONSE: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Awaiting' },
  IN_PROGRESS: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'In Progress' },
  REPLIED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Replied' },
  HAS_ATTACHMENTS: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Has Attachments' },
  VERIFYING: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Verifying' },
  FULFILLED: { bg: 'bg-green-50', text: 'text-green-700', label: 'Complete' },
  REJECTED: { bg: 'bg-red-50', text: 'text-red-700', label: 'Rejected' },
  FLAGGED: { bg: 'bg-red-50', text: 'text-red-700', label: 'Flagged' },
  MANUAL_REVIEW: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Manual Review' },
  ON_HOLD: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'On Hold' },
  
  // Email draft statuses
  DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Draft' },
  APPROVED: { bg: 'bg-green-50', text: 'text-green-700', label: 'Approved' },
  SENT: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Sent' },
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
