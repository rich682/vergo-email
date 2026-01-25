"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { 
  Check, 
  Clock, 
  AlertTriangle,
  MessageSquare,
  Paperclip,
  ExternalLink,
  CheckCircle,
  XCircle,
  Link2,
  FileCheck,
  RefreshCw
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface ReviewData {
  message: {
    id: string
    fromAddress: string
  }
  task: {
    id: string
    status: string
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
  } | null
  attachments: Array<{
    id: string
    filename: string
    status: string
  }>
  reviewStatus: string
}

interface ActionsTabProps {
  data: ReviewData
  onRefresh: () => void
}

export function ActionsTab({ data, onRefresh }: ActionsTabProps) {
  const router = useRouter()
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingReview, setUpdatingReview] = useState(false)
  const [updatingAttachment, setUpdatingAttachment] = useState<string | null>(null)

  const hasAttachments = data.attachments.length > 0

  // Update task status
  const handleTaskStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true)
    try {
      const response = await fetch(`/api/tasks/${data.task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        onRefresh()
      }
    } catch (err) {
      console.error("Error updating task status:", err)
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Update review status
  const handleReviewStatusChange = async (newStatus: string) => {
    setUpdatingReview(true)
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
      setUpdatingReview(false)
    }
  }

  // Update attachment status
  const handleAttachmentStatus = async (attachmentId: string, status: string) => {
    setUpdatingAttachment(attachmentId)
    try {
      // Use collection service endpoint
      const response = await fetch(`/api/collection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          id: attachmentId, 
          status,
          jobId: data.job?.id 
        })
      })

      if (response.ok) {
        onRefresh()
      }
    } catch (err) {
      console.error("Error updating attachment status:", err)
    } finally {
      setUpdatingAttachment(null)
    }
  }

  // Navigate to compose follow-up
  const handleCreateFollowUp = () => {
    if (data.job) {
      router.push(`/dashboard/jobs/${data.job.id}?action=send-request`)
    }
  }

  return (
    <div className="p-4 space-y-6">
      {/* Review Actions */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Review Actions</h3>
        
        <div className="grid grid-cols-1 gap-2">
          <Button
            variant={data.reviewStatus === "REVIEWED" ? "default" : "outline"}
            className={data.reviewStatus === "REVIEWED" ? "bg-green-600 hover:bg-green-700" : ""}
            onClick={() => handleReviewStatusChange("REVIEWED")}
            disabled={updatingReview}
          >
            {updatingReview ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Mark as Reviewed
          </Button>

          <Button
            variant={data.reviewStatus === "NEEDS_FOLLOW_UP" ? "default" : "outline"}
            className={data.reviewStatus === "NEEDS_FOLLOW_UP" ? "bg-orange-600 hover:bg-orange-700" : ""}
            onClick={() => handleReviewStatusChange("NEEDS_FOLLOW_UP")}
            disabled={updatingReview}
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Needs Follow-up
          </Button>
        </div>
      </div>

      {/* Task Status Actions */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Request Status</h3>
        
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-2">Current status</p>
          <span className={`inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full font-medium ${
            data.task.status === "COMPLETE" || data.task.status === "FULFILLED"
              ? "bg-green-100 text-green-700"
              : data.task.status === "REPLIED" || data.task.status === "HAS_ATTACHMENTS"
              ? "bg-blue-100 text-blue-700"
              : "bg-amber-100 text-amber-700"
          }`}>
            {data.task.status === "COMPLETE" || data.task.status === "FULFILLED" ? (
              <CheckCircle className="w-4 h-4" />
            ) : data.task.status === "REPLIED" || data.task.status === "HAS_ATTACHMENTS" ? (
              <MessageSquare className="w-4 h-4" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
            {data.task.status.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Button
            variant="outline"
            onClick={() => handleTaskStatusChange("COMPLETE")}
            disabled={updatingStatus || data.task.status === "COMPLETE"}
          >
            {updatingStatus ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            Mark Request Complete
          </Button>

          <Button
            variant="outline"
            onClick={() => handleTaskStatusChange("REPLIED")}
            disabled={updatingStatus || data.task.status === "REPLIED"}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Mark as Replied (Pending)
          </Button>
        </div>
      </div>

      {/* Attachment Actions */}
      {hasAttachments && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900">
            Attachment Approval ({data.attachments.length})
          </h3>
          
          <div className="space-y-2">
            {data.attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-900 truncate">{att.filename}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    att.status === "APPROVED" 
                      ? "bg-green-100 text-green-700"
                      : att.status === "REJECTED"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {att.status.toLowerCase()}
                  </span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAttachmentStatus(att.id, "APPROVED")}
                    disabled={updatingAttachment === att.id || att.status === "APPROVED"}
                    className="h-8 w-8 p-0"
                    title="Approve"
                  >
                    <CheckCircle className={`w-4 h-4 ${att.status === "APPROVED" ? "text-green-500" : "text-gray-400"}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAttachmentStatus(att.id, "REJECTED")}
                    disabled={updatingAttachment === att.id || att.status === "REJECTED"}
                    className="h-8 w-8 p-0"
                    title="Reject"
                  >
                    <XCircle className={`w-4 h-4 ${att.status === "REJECTED" ? "text-red-500" : "text-gray-400"}`} />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Link to Job */}
          {data.job && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push(`/dashboard/jobs/${data.job!.id}`)}
            >
              <Link2 className="w-4 h-4 mr-2" />
              View in Job: {data.job.name}
            </Button>
          )}
        </div>
      )}

      {/* Follow-up Actions */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Follow-up</h3>
        
        <div className="grid grid-cols-1 gap-2">
          <Button
            variant="outline"
            onClick={handleCreateFollowUp}
            disabled={!data.job}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Create Follow-up Request
          </Button>

          {data.task.entity?.email && (
            <Button
              variant="outline"
              onClick={() => {
                // Switch to reply tab would be nice, but for now just open compose
                const tab = document.querySelector('[data-tab="reply"]') as HTMLButtonElement
                tab?.click()
              }}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Reply to {data.task.entity.firstName || data.task.entity.email}
            </Button>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="pt-4 border-t border-gray-200">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Quick Links
        </h3>
        <div className="space-y-1">
          {data.job && (
            <button
              onClick={() => router.push(`/dashboard/jobs/${data.job!.id}`)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Job Details
            </button>
          )}
          <button
            onClick={() => router.push("/dashboard/requests")}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            All Requests
          </button>
          <button
            onClick={() => router.push("/dashboard/collection")}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
          >
            <FileCheck className="w-4 h-4" />
            Collection Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
