"use client"

import { TaskCompletionState } from "@/lib/taskState"

export type InboxTab = TaskCompletionState | "all"

interface InboxTabsProps {
  activeTab: InboxTab
  onTabChange: (tab: InboxTab) => void
  needsReviewCount: number
  pendingCount: number
  submittedCount: number
  completeCount: number
}

export function InboxTabs({
  activeTab,
  onTabChange,
  needsReviewCount,
  pendingCount,
  submittedCount,
  completeCount
}: InboxTabsProps) {
  return (
    <div className="flex items-center gap-6">
      <button
        onClick={() => onTabChange("Needs Review")}
        className={`text-sm font-medium transition-colors ${
          activeTab === "Needs Review"
            ? "text-red-700 font-semibold"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Needs Review
        {needsReviewCount > 0 && (
          <span className={`ml-2 ${activeTab === "Needs Review" ? "text-red-600" : "text-gray-400"}`}>
            {needsReviewCount}
          </span>
        )}
      </button>
      <button
        onClick={() => onTabChange("Pending")}
        className={`text-sm font-medium transition-colors ${
          activeTab === "Pending"
            ? "text-yellow-700 font-semibold"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Pending
        {pendingCount > 0 && (
          <span className={`ml-2 ${activeTab === "Pending" ? "text-yellow-600" : "text-gray-400"}`}>
            {pendingCount}
          </span>
        )}
      </button>
      <button
        onClick={() => onTabChange("Submitted")}
        className={`text-sm font-medium transition-colors ${
          activeTab === "Submitted"
            ? "text-purple-700 font-semibold"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Submitted
        {submittedCount > 0 && (
          <span className={`ml-2 ${activeTab === "Submitted" ? "text-purple-600" : "text-gray-400"}`}>
            {submittedCount}
          </span>
        )}
      </button>
      <button
        onClick={() => onTabChange("Complete")}
        className={`text-sm font-medium transition-colors ${
          activeTab === "Complete"
            ? "text-green-700 font-semibold"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Complete
        {completeCount > 0 && (
          <span className={`ml-2 ${activeTab === "Complete" ? "text-green-600" : "text-gray-400"}`}>
            {completeCount}
          </span>
        )}
      </button>
    </div>
  )
}

