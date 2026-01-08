"use client"

export type InboxTab = "awaiting" | "replied" | "read"

interface InboxTabsProps {
  activeTab: InboxTab
  onTabChange: (tab: InboxTab) => void
  awaitingCount: number
  repliedCount: number
  readCount: number
}

export function InboxTabs({
  activeTab,
  onTabChange,
  awaitingCount,
  repliedCount,
  readCount
}: InboxTabsProps) {
  return (
    <div className="flex items-center gap-6">
      <button
        onClick={() => onTabChange("awaiting")}
        className={`text-sm font-medium transition-colors ${
          activeTab === "awaiting"
            ? "text-gray-900"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Awaiting Response
        {awaitingCount > 0 && (
          <span className="ml-2 text-gray-400">{awaitingCount}</span>
        )}
      </button>
      <button
        onClick={() => onTabChange("read")}
        className={`text-sm font-medium transition-colors ${
          activeTab === "read"
            ? "text-gray-900"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Read
        {readCount > 0 && (
          <span className="ml-2 text-gray-400">{readCount}</span>
        )}
      </button>
      <button
        onClick={() => onTabChange("replied")}
        className={`text-sm font-medium transition-colors ${
          activeTab === "replied"
            ? "text-gray-900"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        Replied
        {repliedCount > 0 && (
          <span className="ml-2 text-gray-400">{repliedCount}</span>
        )}
      </button>
    </div>
  )
}

