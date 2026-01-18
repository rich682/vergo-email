"use client"

import { useState } from "react"
import { 
  FileText, 
  Search, 
  Zap, 
  MessageSquare 
} from "lucide-react"
import { OverviewTab } from "./tabs/overview-tab"
import { FindingsTab } from "./tabs/findings-tab"
import { ActionsTab } from "./tabs/actions-tab"
import { ReplyTab } from "./tabs/reply-tab"

interface ReviewData {
  message: {
    id: string
    direction: string
    subject: string | null
    body: string | null
    htmlBody: string | null
    fromAddress: string
    toAddress: string
    createdAt: string
    aiClassification: string | null
    aiReasoning: string | null
    isAutoReply: boolean
    reviewNotes: string | null
  }
  task: {
    id: string
    status: string
    campaignName: string | null
    aiSummary: string | null
    aiSummaryConfidence: string | null
    riskLevel: string | null
    riskReason: string | null
    entity: {
      id: string
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
  thread: Array<{
    id: string
    direction: string
    subject: string | null
    body: string | null
    htmlBody: string | null
    fromAddress: string
    toAddress: string
    createdAt: string
    attachments: any
    aiClassification: string | null
    aiReasoning: string | null
    isAutoReply: boolean
    openedAt: string | null
    openedCount: number
  }>
  attachments: Array<{
    id: string
    filename: string
    fileKey: string
    fileUrl: string | null
    fileSize: number | null
    mimeType: string | null
    source: string
    status: string
    receivedAt: string
  }>
  reviewStatus: string
  reviewedAt: string | null
  reviewedBy: {
    id: string
    name: string | null
    email: string
  } | null
}

interface ReviewTabsProps {
  data: ReviewData
  onRefresh: () => void
}

type TabId = "overview" | "findings" | "actions" | "reply"

const TABS = [
  { id: "overview" as TabId, label: "Overview", icon: FileText },
  { id: "findings" as TabId, label: "Findings", icon: Search },
  { id: "actions" as TabId, label: "Actions", icon: Zap },
  { id: "reply" as TabId, label: "Reply", icon: MessageSquare },
]

export function ReviewTabs({ data, onRefresh }: ReviewTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview")

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 px-4">
        <nav className="flex gap-1" aria-label="Tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "overview" && (
          <OverviewTab data={data} />
        )}
        {activeTab === "findings" && (
          <FindingsTab data={data} />
        )}
        {activeTab === "actions" && (
          <ActionsTab data={data} onRefresh={onRefresh} />
        )}
        {activeTab === "reply" && (
          <ReplyTab data={data} onRefresh={onRefresh} />
        )}
      </div>
    </div>
  )
}
