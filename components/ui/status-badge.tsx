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
  // Job statuses (new action-oriented)
  NOT_STARTED: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Not Started' },
  IN_PROGRESS: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'In Progress' },
  BLOCKED: { bg: 'bg-red-50', text: 'text-red-700', label: 'Blocked' },
  COMPLETE: { bg: 'bg-green-50', text: 'text-green-700', label: 'Complete' },
  
  // Legacy job statuses (for backwards compatibility)
  ACTIVE: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Active' },
  WAITING: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Waiting' },
  COMPLETED: { bg: 'bg-green-50', text: 'text-green-700', label: 'Completed' },
  ARCHIVED: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Archived' },
  
  // Task/Request statuses - No reply, Replied, Read, Complete, Failed (new values)
  NO_REPLY: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'No reply' },
  REPLIED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Replied' },
  READ: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Read' },
  SEND_FAILED: { bg: 'bg-red-50', text: 'text-red-700', label: 'Failed' },
  // Note: COMPLETE is already defined above in Job statuses
  
  // Legacy Task/Request statuses (mapped to new display)
  AWAITING_RESPONSE: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'No reply' },
  HAS_ATTACHMENTS: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Replied' },
  VERIFYING: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Replied' },
  FULFILLED: { bg: 'bg-green-50', text: 'text-green-700', label: 'Complete' },
  REJECTED: { bg: 'bg-green-50', text: 'text-green-700', label: 'Complete' },
  FLAGGED: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'No reply' },
  MANUAL_REVIEW: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'No reply' },
  ON_HOLD: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'No reply' },
  
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
