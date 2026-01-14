/**
 * EmptyState - Consistent empty state component
 * 
 * Usage:
 * <EmptyState
 *   icon={<Briefcase />}
 *   title="No items yet"
 *   description="Create your first item to get started"
 *   action={{ label: "Create Item", onClick: () => {} }}
 * />
 */

import { ReactNode } from "react"
import { Button } from "./button"

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary'
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  compact?: boolean
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`
      flex flex-col items-center justify-center text-center
      ${compact ? 'py-8' : 'py-12'}
    `}>
      {icon && (
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <div className="text-gray-400">
            {icon}
          </div>
        </div>
      )}
      <h3 className="text-base font-medium text-gray-900 mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 mb-4 max-w-sm">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant === 'secondary' ? 'outline' : 'default'}
              className={action.variant !== 'secondary' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant="outline"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
