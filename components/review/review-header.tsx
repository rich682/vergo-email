"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft, 
  ChevronRight, 
  Check, 
  Clock, 
  AlertTriangle,
  RefreshCw,
  MoreHorizontal
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"

interface ReviewData {
  message: {
    id: string
    fromAddress: string
    createdAt: string
    reviewNotes: string | null
  }
  task: {
    id: string
    status: string
    campaignName: string | null
    entity: {
      firstName: string
      lastName: string | null
      email: string | null
    } | null
  }
  job: {
    id: string
    name: string
    board: {
      id: string
      name: string
    } | null
  } | null
  reviewStatus: string
  reviewedAt: string | null
  reviewedBy: {
    name: string | null
    email: string
  } | null
}

interface ReviewHeaderProps {
  data: ReviewData
  onRefresh: () => void
  onClose: () => void
}

const REVIEW_STATUS_CONFIG = {
  UNREVIEWED: {
    label: "Needs Review",
    color: "bg-amber-100 text-amber-700",
    icon: Clock
  },
  NEEDS_FOLLOW_UP: {
    label: "Follow-up Required",
    color: "bg-orange-100 text-orange-700",
    icon: AlertTriangle
  },
  REVIEWED: {
    label: "Reviewed",
    color: "bg-green-100 text-green-700",
    icon: Check
  }
}

export function ReviewHeader({ data, onRefresh, onClose }: ReviewHeaderProps) {
  const router = useRouter()
  const [updating, setUpdating] = useState(false)
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)

  const statusConfig = REVIEW_STATUS_CONFIG[data.reviewStatus as keyof typeof REVIEW_STATUS_CONFIG] 
    || REVIEW_STATUS_CONFIG.UNREVIEWED

  const StatusIcon = statusConfig.icon

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true)
    setShowStatusDropdown(false)
    
    try {
      const response = await fetch(`/api/review/${data.message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        onRefresh()
      }
    } catch (err) {
      console.error("Error updating review status:", err)
    } finally {
      setUpdating(false)
    }
  }

  const handleMarkReviewed = () => {
    handleStatusChange("REVIEWED")
  }

  // Build breadcrumb
  const breadcrumbItems = []
  if (data.job?.board) {
    breadcrumbItems.push({
      label: data.job.board.name,
      href: `/dashboard/boards/${data.job.board.id}`
    })
  }
  if (data.job) {
    breadcrumbItems.push({
      label: data.job.name,
      href: `/dashboard/jobs/${data.job.id}`
    })
  }
  if (data.task.entity) {
    const entityName = [data.task.entity.firstName, data.task.entity.lastName]
      .filter(Boolean)
      .join(" ") || data.task.entity.email || "Unknown"
    breadcrumbItems.push({
      label: entityName,
      href: null // Current page
    })
  }

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Back + Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-sm min-w-0">
            {breadcrumbItems.map((item, index) => (
              <span key={index} className="flex items-center gap-1 min-w-0">
                {index > 0 && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                {item.href ? (
                  <button
                    onClick={() => router.push(item.href!)}
                    className="text-gray-500 hover:text-gray-900 truncate max-w-[150px]"
                    title={item.label}
                  >
                    {item.label}
                  </button>
                ) : (
                  <span className="font-medium text-gray-900 truncate max-w-[150px]" title={item.label}>
                    {item.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        </div>

        {/* Right: Status + Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Review Status Badge */}
          <div className="relative">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.color}`}
            >
              <StatusIcon className="w-4 h-4" />
              {statusConfig.label}
            </button>

            {/* Status Dropdown */}
            {showStatusDropdown && (
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {Object.entries(REVIEW_STATUS_CONFIG).map(([key, config]) => {
                  const Icon = config.icon
                  const isActive = data.reviewStatus === key
                  return (
                    <button
                      key={key}
                      onClick={() => handleStatusChange(key)}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 ${
                        isActive ? 'bg-gray-50' : ''
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${config.color.split(' ')[1]}`} />
                      {config.label}
                      {isActive && <Check className="w-4 h-4 text-green-500 ml-auto" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Reviewed info */}
          {data.reviewedAt && data.reviewedBy && (
            <span className="text-xs text-gray-500">
              by {data.reviewedBy.name || data.reviewedBy.email} 
              {" · "}
              {format(new Date(data.reviewedAt), "MMM d")}
            </span>
          )}

          {/* Mark Reviewed Button */}
          {data.reviewStatus !== "REVIEWED" && (
            <Button
              onClick={handleMarkReviewed}
              disabled={updating}
              className="bg-green-600 hover:bg-green-700"
            >
              {updating ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-1" />
              )}
              Mark Reviewed
            </Button>
          )}
        </div>
      </div>

      {/* Close dropdown on outside click */}
      {showStatusDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowStatusDropdown(false)}
        />
      )}
    </div>
  )
}
