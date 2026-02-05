"use client"

import { useState, useEffect } from "react"
import { EmailThreadViewer } from "./email-thread-viewer"
import { AttachmentRail } from "./attachment-rail"
import { AttachmentPreview } from "./attachment-preview"
import { ReviewHeader } from "./review-header"
import { ReviewTabs } from "./review-tabs"

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

interface ReviewLayoutProps {
  data: ReviewData
  onRefresh: () => void
  onClose: () => void
}

export function ReviewLayout({ data, onRefresh, onClose }: ReviewLayoutProps) {
  const hasAttachments = data.attachments.length > 0
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(
    hasAttachments ? data.attachments[0].id : null
  )
  const [leftPaneWidth, setLeftPaneWidth] = useState(65) // percentage
  const [isDragging, setIsDragging] = useState(false)

  // Auto-select first attachment when attachments change
  useEffect(() => {
    if (hasAttachments && !selectedAttachmentId) {
      setSelectedAttachmentId(data.attachments[0].id)
    }
  }, [data.attachments, hasAttachments, selectedAttachmentId])

  const selectedAttachment = data.attachments.find(a => a.id === selectedAttachmentId)

  // Handle resize drag
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = (e.clientX / window.innerWidth) * 100
      setLeftPaneWidth(Math.min(Math.max(newWidth, 30), 80))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <ReviewHeader
        data={data}
        onRefresh={onRefresh}
        onClose={onClose}
      />

      {/* Main Content - Split Panes */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane */}
        <div
          className="flex flex-col overflow-hidden bg-white border-r border-gray-200"
          style={{ width: `${leftPaneWidth}%` }}
        >
          {/* Email Thread - Always visible */}
          <div className={`flex-1 overflow-hidden ${hasAttachments ? 'max-h-[50%]' : ''}`}>
            <EmailThreadViewer
              thread={data.thread}
              currentMessageId={data.message.id}
            />
          </div>

          {/* Attachments Section - Only if attachments exist */}
          {hasAttachments && (
            <>
              <AttachmentRail
                attachments={data.attachments}
                selectedId={selectedAttachmentId}
                onSelect={setSelectedAttachmentId}
              />
              <div className="flex-1 overflow-hidden min-h-[300px]">
                <AttachmentPreview attachment={selectedAttachment || null} />
              </div>
            </>
          )}
        </div>

        {/* Resize Handle */}
        <div
          className={`w-1 cursor-col-resize hover:bg-orange-400 transition-colors ${
            isDragging ? 'bg-orange-500' : 'bg-gray-200'
          }`}
          onMouseDown={handleMouseDown}
        />

        {/* Right Pane */}
        <div
          className="flex flex-col overflow-hidden bg-white"
          style={{ width: `${100 - leftPaneWidth}%` }}
        >
          <ReviewTabs
            data={data}
            onRefresh={onRefresh}
          />
        </div>
      </div>
    </div>
  )
}
