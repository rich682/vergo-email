"use client"

import { useState } from "react"
import { 
  Send, 
  Sparkles, 
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Check
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface ReplySectionProps {
  taskId: string
  recipientEmail: string
  recipientName: string
  originalSubject: string | null
  onReplySent: () => void
}

export function ReplySection({ 
  taskId, 
  recipientEmail, 
  recipientName, 
  originalSubject,
  onReplySent 
}: ReplySectionProps) {
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [showDraftSection, setShowDraftSection] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)

  const replySubject = originalSubject?.startsWith("Re:") 
    ? originalSubject 
    : `Re: ${originalSubject || "Your message"}`

  const handleGenerateDraft = async () => {
    setGeneratingDraft(true)
    
    try {
      const response = await fetch(`/api/requests/detail/${taskId}/reply-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: replyText || "" })
      })

      if (response.ok) {
        const result = await response.json()
        setReplyText(result.draft || "")
        setShowDraftSection(false)
      }
    } catch (err) {
      console.error("Error generating draft:", err)
    } finally {
      setGeneratingDraft(false)
    }
  }

  const handleSendReply = async () => {
    if (!replyText.trim()) return
    
    // Simple confirmation
    if (!confirm(`Send reply to ${recipientName}?`)) return
    
    setSending(true)
    setSendSuccess(false)
    
    try {
      const response = await fetch(`/api/requests/detail/${taskId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: replyText })
      })

      if (response.ok) {
        setSendSuccess(true)
        setReplyText("")
        setTimeout(() => {
          onReplySent()
        }, 1500)
      }
    } catch (err) {
      console.error("Error sending reply:", err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Recipient Info */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="text-sm">
          <span className="text-gray-500">To:</span>{" "}
          <span className="font-medium text-gray-900">{recipientName}</span>
          {recipientName !== recipientEmail && (
            <span className="text-gray-500 ml-1">({recipientEmail})</span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          Subject: {replySubject}
        </div>
      </div>

      {/* AI Draft Section (Collapsed by default) */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowDraftSection(!showDraftSection)}
          className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-medium text-gray-700">Insert AI draft</span>
          </div>
          {showDraftSection ? (
            <ChevronDown className="w-3 h-3 text-gray-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-400" />
          )}
        </button>
        
        {showDraftSection && (
          <div className="p-3 border-t border-gray-200 bg-white">
            <p className="text-xs text-gray-600 mb-2">
              Generate a contextual reply based on the conversation.
            </p>
            <Button
              onClick={handleGenerateDraft}
              disabled={generatingDraft}
              variant="outline"
              size="sm"
            >
              {generatingDraft ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 mr-1" />
                  Generate
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Reply Composer */}
      <Textarea
        placeholder="Write your reply..."
        value={replyText}
        onChange={(e) => {
          setReplyText(e.target.value)
          setSendSuccess(false)
        }}
        className="min-h-[140px] resize-none"
      />

      {/* Success Message */}
      {sendSuccess && (
        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
          <Check className="w-3 h-3 flex-shrink-0" />
          Reply sent! Consider marking this as reviewed.
        </div>
      )}

      {/* Send Button */}
      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={handleSendReply}
          disabled={!replyText.trim() || sending}
          className="bg-orange-600 hover:bg-orange-700"
          size="sm"
        >
          {sending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-1" />
              Send Reply
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
