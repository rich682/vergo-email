"use client"

import { useState, useEffect, useCallback } from "react"
import { 
  Send, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Loader2,
  FileText,
  File
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Finding {
  severity: "info" | "warning" | "critical"
  title: string
  explanation: string
  suggestedAction?: string
}

interface AttachmentSummary {
  filename: string
  documentType: string
  summary: string
  keyDetails: string[]
  accountingRelevance?: string
}

interface AIAssessment {
  id: string
  recommendedAction: "REVIEWED" | "NEEDS_FOLLOW_UP"
  reasoning: string
  summaryBullets: string[]
  findings: Finding[]
  attachmentSummaries?: AttachmentSummary[]
  hasAttachments?: boolean
  isExisting: boolean
}

interface ReviewRHSProps {
  messageId: string
  taskId: string
  recipientEmail: string
  recipientName: string
  originalSubject: string | null
  isInbound: boolean
  onReplySent: () => void
}

export function ReviewRHS({
  messageId,
  taskId,
  recipientEmail,
  recipientName,
  originalSubject,
  isInbound,
  onReplySent
}: ReviewRHSProps) {
  // AI Assessment state
  const [assessment, setAssessment] = useState<AIAssessment | null>(null)
  const [assessmentLoading, setAssessmentLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const [showDocuments, setShowDocuments] = useState(false)

  // Draft reply state
  const [draft, setDraft] = useState("")
  const [draftLoading, setDraftLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)

  // Send state
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  
  // Document analysis state
  const [reanalyzingDocs, setReanalyzingDocs] = useState(false)

  const replySubject = originalSubject?.startsWith("Re:") 
    ? originalSubject 
    : `Re: ${originalSubject || "Your message"}`

  // Auto-load assessment on mount
  const loadAssessment = useCallback(async () => {
    if (!isInbound) {
      setAssessmentLoading(false)
      return
    }

    try {
      setAssessmentLoading(true)
      const response = await fetch("/api/review/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messageId })
      })

      if (response.ok) {
        const data = await response.json()
        setAssessment(data)
      }
    } catch (error) {
      console.error("Failed to load assessment:", error)
    } finally {
      setAssessmentLoading(false)
    }
  }, [messageId, isInbound])

  // Auto-load draft on mount (after assessment)
  const loadDraft = useCallback(async (regenerate = false) => {
    if (!isInbound) {
      setDraftLoading(false)
      return
    }

    try {
      if (regenerate) {
        setRegenerating(true)
      } else {
        setDraftLoading(true)
      }

      const response = await fetch("/api/review/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messageId, regenerate })
      })

      if (response.ok) {
        const data = await response.json()
        setDraft(data.draft)
      }
    } catch (error) {
      console.error("Failed to load draft:", error)
      // Fallback draft
      setDraft(`Hi ${recipientName.split(" ")[0]},\n\nThank you for your response.\n\nBest regards`)
    } finally {
      setDraftLoading(false)
      setRegenerating(false)
    }
  }, [messageId, isInbound, recipientName])

  // Reanalyze documents (force regeneration)
  const reanalyzeDocuments = useCallback(async () => {
    if (!isInbound) return
    
    try {
      setReanalyzingDocs(true)
      const response = await fetch("/api/review/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messageId, forceReanalyze: true })
      })

      if (response.ok) {
        const data = await response.json()
        setAssessment(data)
        setShowDocuments(true) // Auto-expand to show results
      }
    } catch (error) {
      console.error("Failed to reanalyze documents:", error)
    } finally {
      setReanalyzingDocs(false)
    }
  }, [messageId, isInbound])

  // Load assessment and then draft
  useEffect(() => {
    loadAssessment()
  }, [loadAssessment])

  useEffect(() => {
    if (!assessmentLoading && isInbound) {
      loadDraft()
    }
  }, [assessmentLoading, isInbound, loadDraft])

  // Handle send reply
  const handleSendReply = async () => {
    if (!draft.trim()) return
    
    setSending(true)
    setSendSuccess(false)
    
    try {
      const response = await fetch(`/api/requests/detail/${taskId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: draft })
      })

      if (response.ok) {
        setSendSuccess(true)
        setDraft("")
        
        // Auto-mark as reviewed by updating status
        if (assessment?.id) {
          await fetch(`/api/review/${messageId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ status: "REVIEWED" })
          })
        }

        setTimeout(() => {
          onReplySent()
        }, 1500)
      }
    } catch (error) {
      console.error("Failed to send reply:", error)
    } finally {
      setSending(false)
      setShowConfirmModal(false)
    }
  }

  // Handle send click - show confirmation if needed
  const handleSendClick = () => {
    // For now, always show simple confirmation
    // Could enhance to detect multiple recipients
    setShowConfirmModal(true)
  }

  // Handle regenerate
  const handleRegenerate = () => {
    loadDraft(true)
  }

  // Get action badge styling
  const getActionBadge = () => {
    if (!assessment) return null
    
    if (assessment.recommendedAction === "REVIEWED") {
      return {
        icon: CheckCircle,
        label: "Looks complete",
        className: "bg-green-50 text-green-700 border-green-200"
      }
    }
    return {
      icon: AlertTriangle,
      label: "Needs follow-up",
      className: "bg-amber-50 text-amber-700 border-amber-200"
    }
  }

  const actionBadge = getActionBadge()

  // For outbound messages, show a simpler view
  if (!isInbound) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            This is a sent request. You'll be notified when a reply is received.
          </p>
        </div>

        {/* Follow-up option */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Send Follow-up
          </h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div>
              <span className="text-gray-500">To:</span>{" "}
              <span className="font-medium text-gray-900">{recipientName}</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Subject: {replySubject}
            </div>
          </div>
          <Textarea
            placeholder="Write a follow-up message..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[100px] resize-none"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleSendClick}
              disabled={!draft.trim() || sending}
              className="bg-orange-600 hover:bg-orange-700"
              size="sm"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* AI Assessment Section */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium text-gray-900">AI Assessment</span>
            </div>
            {actionBadge && !assessmentLoading && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${actionBadge.className}`}>
                <actionBadge.icon className="w-3 h-3" />
                {actionBadge.label}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 bg-white">
          {assessmentLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing reply...
            </div>
          ) : assessment ? (
            <div className="space-y-3">
              {/* Compact reasoning */}
              <p className="text-sm text-gray-700">
                {assessment.reasoning}
              </p>

              {/* Expandable details */}
              {(assessment.summaryBullets.length > 0 || assessment.findings.length > 0) && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  {showDetails ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  View details
                </button>
              )}

              {showDetails && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  {/* Summary bullets */}
                  {assessment.summaryBullets.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                        Summary
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {assessment.summaryBullets.map((bullet, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-gray-400">•</span>
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Findings - filter out attachment-related ones since we have Document Analysis section */}
                  {(() => {
                    // Filter out attachment verification findings - these are handled by Document Analysis
                    const filteredFindings = assessment.findings.filter(f => {
                      const title = f.title.toLowerCase()
                      const explanation = f.explanation.toLowerCase()
                      const isAttachmentRelated = 
                        title.includes("attachment") ||
                        title.includes("document verification") ||
                        title.includes("verification needed") ||
                        (explanation.includes("attachment") && explanation.includes("verify"))
                      return !isAttachmentRelated
                    })
                    
                    return filteredFindings.length > 0 ? (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                          Findings
                        </h4>
                        <div className="space-y-2">
                          {filteredFindings.map((finding, i) => (
                            <div
                              key={i}
                              className={`p-2 rounded text-sm ${
                                finding.severity === "critical"
                                  ? "bg-red-50 border border-red-200"
                                  : finding.severity === "warning"
                                  ? "bg-amber-50 border border-amber-200"
                                  : "bg-gray-50 border border-gray-200"
                              }`}
                            >
                              <div className="font-medium">{finding.title}</div>
                              <div className="text-xs text-gray-600 mt-0.5">
                                {finding.explanation}
                              </div>
                              {finding.suggestedAction && (
                                <div className="text-xs text-gray-500 mt-1 italic">
                                  → {finding.suggestedAction}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null
                  })()}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Unable to analyze reply.</p>
          )}
        </div>
      </div>

      {/* Document Analysis Section - only shown when attachments exist */}
      {assessment?.hasAttachments && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <button
              onClick={() => setShowDocuments(!showDocuments)}
              className="flex items-center gap-2 hover:text-gray-700"
            >
              {showDocuments ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
              <FileText className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-900">Document Analysis</span>
              {assessment.attachmentSummaries && assessment.attachmentSummaries.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                  {assessment.attachmentSummaries.length} file{assessment.attachmentSummaries.length !== 1 ? "s" : ""}
                </span>
              )}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                reanalyzeDocuments()
              }}
              disabled={reanalyzingDocs}
              className="h-6 text-xs text-gray-500"
            >
              {reanalyzingDocs ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              {reanalyzingDocs ? "Analyzing..." : "Re-analyze"}
            </Button>
          </div>

          {showDocuments && (
            <div className="p-4 bg-white space-y-4">
              {assessment.attachmentSummaries && assessment.attachmentSummaries.length > 0 ? (
                assessment.attachmentSummaries.map((doc, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                    {/* Document header */}
                    <div className="flex items-start gap-2 mb-2">
                      <File className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {doc.filename}
                          </span>
                          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded flex-shrink-0">
                            {doc.documentType}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Document summary */}
                    <p className="text-sm text-gray-600 mb-2">{doc.summary}</p>
                    
                    {/* Key details */}
                    {doc.keyDetails && doc.keyDetails.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Key Details
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {doc.keyDetails.map((detail, j) => (
                            <span
                              key={j}
                              className="inline-flex text-xs bg-white border border-gray-200 px-2 py-1 rounded text-gray-700"
                            >
                              {detail}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Accounting relevance note */}
                    {doc.accountingRelevance && (
                      <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1.5 rounded">
                        💡 {doc.accountingRelevance}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500 text-center py-6">
                  <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p>Attachment content not yet analyzed.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={reanalyzeDocuments}
                    disabled={reanalyzingDocs}
                    className="mt-3"
                  >
                    {reanalyzingDocs ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-1" />
                    )}
                    Analyze Documents
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Draft Reply Section */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Reply
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating || draftLoading}
            className="h-6 text-xs text-gray-500"
          >
            {regenerating ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Regenerate
          </Button>
        </div>

        {/* Recipient info */}
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

        {/* Draft editor */}
        {draftLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Generating draft...</span>
          </div>
        ) : (
          <Textarea
            placeholder="Write your reply..."
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setSendSuccess(false)
            }}
            className="min-h-[140px] resize-none"
          />
        )}

        {/* Success message */}
        {sendSuccess && (
          <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
            <CheckCircle className="w-3 h-3 flex-shrink-0" />
            Reply sent successfully!
          </div>
        )}

        {/* Send button */}
        <div className="flex items-center justify-end">
          <Button
            onClick={handleSendClick}
            disabled={!draft.trim() || sending || draftLoading}
            className="bg-orange-600 hover:bg-orange-700"
            size="sm"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
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

      {/* Send Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Send</DialogTitle>
            <DialogDescription>
              You are about to send a reply to <strong>{recipientName}</strong> ({recipientEmail}).
            </DialogDescription>
          </DialogHeader>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 max-h-32 overflow-y-auto">
            {draft.substring(0, 200)}{draft.length > 200 ? "..." : ""}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendReply}
              disabled={sending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1" />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
