"use client"

import { MessageSquare, Check } from "lucide-react"
import Link from "next/link"

interface ResponsesCellProps {
  jobId: string
  respondedCount: number
  totalCount: number
  className?: string
}

export function ResponsesCell({ jobId, respondedCount, totalCount, className = "" }: ResponsesCellProps) {
  // Calculate percentage for visual indicator
  const percentage = totalCount > 0 ? Math.round((respondedCount / totalCount) * 100) : 0
  const isComplete = respondedCount === totalCount && totalCount > 0
  
  // Color based on completion
  let textColor = "text-gray-500"
  let bgColor = "bg-gray-100"
  
  if (totalCount > 0) {
    if (isComplete) {
      textColor = "text-green-600"
      bgColor = "bg-green-50"
    } else if (percentage >= 50) {
      textColor = "text-blue-600"
      bgColor = "bg-blue-50"
    } else if (percentage > 0) {
      textColor = "text-amber-600"
      bgColor = "bg-amber-50"
    }
  }
  
  return (
    <Link
      href={`/dashboard/jobs/${jobId}?tab=requests`}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded ${bgColor} hover:opacity-80 transition-opacity ${className}`}
    >
      {isComplete ? (
        <Check className={`w-3.5 h-3.5 ${textColor}`} />
      ) : (
        <MessageSquare className={`w-3.5 h-3.5 ${textColor}`} />
      )}
      <span className={`text-sm font-medium ${textColor}`}>
        {totalCount === 0 ? (
          "—"
        ) : (
          `${respondedCount}/${totalCount}`
        )}
      </span>
    </Link>
  )
}
