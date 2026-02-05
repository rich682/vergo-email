"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Mail, Paperclip, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmailTab } from "./left-pane/email-tab"
import { AttachmentsTab } from "./left-pane/attachments-tab"
import { ReviewRHS } from "./right-pane/review-rhs"

interface ThreadMessage {
  id: string
  direction: string
  subject: string | null
  body: string | null
  htmlBody: string | null
  fromAddress: string
  toAddress: string
  createdAt: string
}

interface Attachment {
  id: string
  filename: string
  fileKey: string
  fileUrl: string | null
  fileSize: number | null
  mimeType: string | null
}

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
  }
  task: {
    id: string
    status: string
    campaignName: string | null
    aiSummary: string | null
    entity: {
      id: string
      firstName: string
      lastName: string | null
      email: string | null
    } | null
  }
  job?: {
    id: string
    name: string
  }
  thread: ThreadMessage[]
  attachments: Attachment[]
  reviewStatus: string
}

interface ReplyReviewLayoutProps {
  messageId: string
}

type LeftTab = "email" | "attachments"

export function ReplyReviewLayout({ messageId }: ReplyReviewLayoutProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ReviewData | null>(null)
  const [leftTab, setLeftTab] = useState<LeftTab>("email")
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null)
  const [leftPaneWidth, setLeftPaneWidth] = useState(60)
  const [isDragging, setIsDragging] = useState(false)

  // Check URL params for initial tab/attachment selection
  const initialTab = searchParams.get("tab") as LeftTab | null
  const initialAttachmentId = searchParams.get("attachmentId")

  // Fetch review data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/review/${messageId}`, {
        credentials: "include"
      })

      if (!response.ok) {
        // Guard: Invalid review - redirect back
        router.push("/dashboard/requests?notice=invalid-review")
        return
      }

      const result = await response.json()
      
      // No guard on direction - we support viewing both sent requests and replies
      setData(result)

      // Handle URL params for tab and attachment selection
      if (initialTab === "attachments" && result.attachments?.length > 0) {
        setLeftTab("attachments")
        // Select specific attachment if provided, otherwise first one
        if (initialAttachmentId && result.attachments.some((a: Attachment) => a.id === initialAttachmentId)) {
          setSelectedAttachmentId(initialAttachmentId)
        } else {
          setSelectedAttachmentId(result.attachments[0].id)
        }
      } else if (result.attachments?.length > 0) {
        // Default: auto-select first attachment
        setSelectedAttachmentId(result.attachments[0].id)
      }
    } catch {
      router.push("/dashboard/requests?notice=invalid-review")
    } finally {
      setLoading(false)
    }
  }, [messageId, router, initialTab, initialAttachmentId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Resize handling
  const handleMouseDown = () => setIsDragging(true)

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = (e.clientX / window.innerWidth) * 100
      setLeftPaneWidth(Math.min(Math.max(newWidth, 35), 75))
    }

    const handleMouseUp = () => setIsDragging(false)

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  // Keyboard shortcut: Escape to go back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        router.back()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [router])

  const handleClose = () => router.back()

  const handleReplySent = () => {
    // Refresh data to show updated thread
    fetchData()
  }

  // Loading state
  if (loading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          <p className="text-sm text-gray-500">Loading review...</p>
        </div>
      </div>
    )
  }

  // Should never reach here due to guards, but safety
  if (!data) {
    return null
  }

  const hasAttachments = data.attachments.length > 0
  const isInbound = data.message.direction === "INBOUND"
  const recipientName = data.task.entity
    ? [data.task.entity.firstName, data.task.entity.lastName].filter(Boolean).join(" ")
    : isInbound ? data.message.fromAddress : data.message.toAddress
  const recipientEmail = data.task.entity?.email || (isInbound ? data.message.fromAddress : data.message.toAddress)

  // Header title based on message direction
  const headerTitle = isInbound
    ? `Review reply from ${recipientName}`
    : `Request sent to ${recipientName}`

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div className="h-4 w-px bg-gray-200" />
            <h1 className="text-sm font-medium text-gray-900">
              {headerTitle}
            </h1>
            {!isInbound && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                Awaiting reply
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content - Split Panes */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANE */}
        <div
          className="flex flex-col overflow-hidden bg-white border-r border-gray-200"
          style={{ width: `${leftPaneWidth}%` }}
        >
          {/* Left Pane Tabs */}
          <div className="flex-shrink-0 border-b border-gray-200 bg-white">
            <div className="flex">
              <button
                onClick={() => setLeftTab("email")}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  leftTab === "email"
                    ? "border-orange-500 text-orange-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Mail className="w-4 h-4" />
                Email
              </button>
              {hasAttachments && (
                <button
                  onClick={() => setLeftTab("attachments")}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    leftTab === "attachments"
                      ? "border-orange-500 text-orange-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Paperclip className="w-4 h-4" />
                  Attachments ({data.attachments.length})
                </button>
              )}
            </div>
          </div>

          {/* Left Pane Content */}
          <div className="flex-1 overflow-hidden">
            {leftTab === "email" ? (
              <EmailTab
                thread={data.thread}
                currentMessageId={data.message.id}
              />
            ) : (
              <AttachmentsTab
                attachments={data.attachments}
                selectedId={selectedAttachmentId}
                onSelect={setSelectedAttachmentId}
                jobId={data.job?.id}
              />
            )}
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className={`w-1 cursor-col-resize hover:bg-orange-400 transition-colors flex-shrink-0 ${
            isDragging ? "bg-orange-500" : "bg-gray-200"
          }`}
          onMouseDown={handleMouseDown}
        />

        {/* RIGHT PANE - Memory-Aware AI Assessment + Draft Reply */}
        <div
          className="flex flex-col overflow-hidden bg-white"
          style={{ width: `${100 - leftPaneWidth}%` }}
        >
          <div className="flex-1 overflow-y-auto p-4">
            <ReviewRHS
              messageId={data.message.id}
              taskId={data.task.id}
              recipientEmail={recipientEmail}
              recipientName={recipientName}
              originalSubject={data.message.subject}
              isInbound={isInbound}
              onReplySent={handleReplySent}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
