"use client"

import { useState } from "react"
import { Check, Clock, AlertTriangle, RefreshCw } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface StatusSectionProps {
  messageId: string
  currentReviewStatus: string
  onStatusChange: () => void
  isOutbound?: boolean
}

const REVIEW_STATUS_OPTIONS = [
  { value: "UNREVIEWED", label: "Needs review", icon: Clock, color: "text-amber-600" },
  { value: "REVIEWED", label: "Reviewed", icon: Check, color: "text-green-600" },
  { value: "NEEDS_FOLLOW_UP", label: "Needs follow-up", icon: AlertTriangle, color: "text-orange-600" },
]

const RISK_OPTIONS = [
  { value: "none", label: "None" },
  { value: "missing_info", label: "Missing info" },
  { value: "potential_issue", label: "Potential issue" },
  { value: "critical", label: "Critical" },
]

export function StatusSection({ 
  messageId, 
  currentReviewStatus,
  onStatusChange,
  isOutbound = false
}: StatusSectionProps) {
  const [reviewStatus, setReviewStatus] = useState(currentReviewStatus || "UNREVIEWED")
  const [riskCategory, setRiskCategory] = useState("none")
  const [updating, setUpdating] = useState(false)

  const handleReviewStatusChange = async (newStatus: string) => {
    if (newStatus === reviewStatus) return
    
    setUpdating(true)
    try {
      const response = await fetch(`/api/review/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        setReviewStatus(newStatus)
        onStatusChange()
      }
    } catch (err) {
      console.error("Error updating status:", err)
    } finally {
      setUpdating(false)
    }
  }

  const currentStatusConfig = REVIEW_STATUS_OPTIONS.find(s => s.value === reviewStatus) || REVIEW_STATUS_OPTIONS[0]
  const StatusIcon = currentStatusConfig.icon

  // For outbound messages (sent requests), show a simpler status display
  if (isOutbound) {
    return (
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">
            Request Status
          </label>
          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg">
            <Clock className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">Awaiting Reply</p>
              <p className="text-xs text-amber-600">Request was sent and is pending a response</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Review Status */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">
          Review Status
        </label>
        <Select 
          value={reviewStatus} 
          onValueChange={handleReviewStatusChange}
          disabled={updating}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              <div className="flex items-center gap-2">
                {updating ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
                ) : (
                  <StatusIcon className={`w-4 h-4 ${currentStatusConfig.color}`} />
                )}
                <span>{currentStatusConfig.label}</span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {REVIEW_STATUS_OPTIONS.map(option => {
              const Icon = option.icon
              return (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${option.color}`} />
                    <span>{option.label}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Risk Category */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">
          Risk Category
        </label>
        <Select 
          value={riskCategory} 
          onValueChange={setRiskCategory}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select risk level" />
          </SelectTrigger>
          <SelectContent>
            {RISK_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quick Mark Reviewed Button */}
      {reviewStatus !== "REVIEWED" && (
        <button
          onClick={() => handleReviewStatusChange("REVIEWED")}
          disabled={updating}
          className="w-full py-2 px-4 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {updating ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Mark as Reviewed
        </button>
      )}
    </div>
  )
}
