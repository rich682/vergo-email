"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StepTypeIcon, StepTypeLabel } from "../shared/step-type-icon"

interface StepCardProps {
  stepNumber: number
  type: string
  actionType?: string
  label: string
  onLabelChange: (label: string) => void
  onError?: string
  errorHandling: string
  onErrorHandlingChange: (value: string) => void
  onDelete?: () => void
  canDelete?: boolean
  children?: ReactNode
}

export function StepCard({
  stepNumber,
  type,
  actionType,
  label,
  onLabelChange,
  errorHandling,
  onErrorHandlingChange,
  onDelete,
  canDelete = true,
  children,
}: StepCardProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-100">
        <button
          className="text-gray-400 hover:text-gray-600 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <span className="text-xs font-medium text-gray-400 w-5 text-center">
          {stepNumber}
        </span>

        <StepTypeIcon type={type} actionType={actionType} size="sm" />

        <div className="flex-1 min-w-0">
          <Input
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            className="h-7 text-sm font-medium border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="Step name..."
          />
        </div>

        <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded bg-gray-50 flex-shrink-0">
          <StepTypeLabel type={type} actionType={actionType} />
        </span>

        {canDelete && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {children}

          {/* Error handling */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">If this step fails:</span>
            <Select value={errorHandling} onValueChange={onErrorHandlingChange}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fail">Stop workflow</SelectItem>
                <SelectItem value="skip">Skip and continue</SelectItem>
                <SelectItem value="retry">Retry</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}
