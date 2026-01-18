"use client"

import { useState } from "react"
import { 
  Send, 
  Sparkles, 
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
  AlertCircle,
  User
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface ReviewData {
  message: {
    id: string
    fromAddress: string
    subject: string | null
  }
  task: {
    id: string
    entity: {
      firstName: string
      lastName: string | null
      email: string | null
    } | null
  }
}

interface ReplyTabProps {
  data: ReviewData
  onRefresh: () => void
}

export function ReplyTab({ data, onRefresh }: ReplyTabProps) {
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [showDraftSection, setShowDraftSection] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recipientEmail = data.task.entity?.email || data.message.fromAddress
  const recipientName = data.task.entity
    ? [data.task.entity.firstName, data.task.entity.lastName].filter(Boolean).join(" ")
    : data.message.fromAddress

  // Get subject for reply
  const originalSubject = data.message.subject || "Your message"
  const replySubject = originalSubject.startsWith("Re:") 
    ? originalSubject 
    : `Re: ${originalSubject}`

  const handleGenerateDraft = async () => {
    setGeneratingDraft(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/tasks/${data.task.id}/reply-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: replyText || "" })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || "Failed to generate draft")
      }

      const result = await response.json()
      setReplyText(result.draft || "")
      setShowDraftSection(false)
    } catch (err: any) {
      console.error("Error generating draft:", err)
      setError(err.message)
    } finally {
      setGeneratingDraft(false)
    }
  }

  const handleSendReply = async () => {
    if (!replyText.trim()) return
    
    setSending(true)
    setError(null)
    setSendSuccess(false)
    
    try {
      const response = await fetch(`/api/tasks/${data.task.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: replyText })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || "Failed to send reply")
      }

      setSendSuccess(true)
      setReplyText("")
      
      // Refresh data to show new message in thread
      setTimeout(() => {
        onRefresh()
      }, 1000)
    } catch (err: any) {
      console.error("Error sending reply:", err)
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-4 space-y-4 h-full flex flex-col">
      {/* Recipient Info */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center gap-2 text-sm">
          <User className="w-4 h-4 text-gray-400" />
          <span className="text-gray-500">To:</span>
          <span className="font-medium text-gray-900">{recipientName}</span>
          {recipientName !== recipientEmail && (
            <span className="text-gray-500">({recipientEmail})</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm mt-1">
          <span className="text-gray-500 ml-6">Subject:</span>
          <span className="text-gray-700">{replySubject}</span>
        </div>
      </div>

      {/* AI Draft Section (Collapsible) */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowDraftSection(!showDraftSection)}
          className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium text-gray-900">AI Draft Assistant</span>
          </div>
          {showDraftSection ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        
        {showDraftSection && (
          <div className="p-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-3">
              Generate a contextual reply based on the conversation history.
            </p>
            <Button
              onClick={handleGenerateDraft}
              disabled={generatingDraft}
              variant="outline"
            >
              {generatingDraft ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Draft
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Reply Composer */}
      <div className="flex-1 flex flex-col min-h-0">
        <Textarea
          placeholder="Write your reply..."
          value={replyText}
          onChange={(e) => {
            setReplyText(e.target.value)
            setSendSuccess(false)
            setError(null)
          }}
          className="flex-1 min-h-[200px] resize-none"
        />
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {sendSuccess && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <Check className="w-4 h-4 flex-shrink-0" />
          Reply sent successfully! Consider marking this response as reviewed.
        </div>
      )}

      {/* Send Button */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          {replyText.length} characters
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setShowDraftSection(true)}
            disabled={generatingDraft}
          >
            <Sparkles className="w-4 h-4 mr-1" />
            AI Draft
          </Button>
          <Button
            onClick={handleSendReply}
            disabled={!replyText.trim() || sending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {sending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Reply
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
