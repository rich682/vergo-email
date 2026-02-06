/**
 * AI Suggested Action Utility
 *
 * Pure function that interprets already-computed AI data
 * into actionable suggestions for the user. No LLM calls.
 */

export type SuggestedActionType =
  | "mark_complete"
  | "send_followup"
  | "review_attachment"
  | "review_reply"
  | "no_action"

export interface SuggestedAction {
  type: SuggestedActionType
  label: string
  confidence: number // 0-100
  description?: string
}

interface SuggestedActionInput {
  completionPercentage?: number | null
  aiReasoning?: any // JSON object with completionAnalysis
  riskLevel?: string | null
  riskReason?: string | null
  status?: string | null
  hasAttachments?: boolean
  aiVerified?: boolean | null
  readStatus?: string | null
}

/**
 * Compute a suggested action from existing AI data.
 * Returns the highest-priority action.
 */
export function getSuggestedAction(input: SuggestedActionInput): SuggestedAction {
  const {
    completionPercentage,
    riskLevel,
    riskReason,
    status,
    hasAttachments,
    aiVerified,
    readStatus,
  } = input

  const pct = completionPercentage ?? 0
  const normalizedStatus = status?.toUpperCase() || ""

  // Already complete -- no action needed
  if (normalizedStatus === "COMPLETE" || normalizedStatus === "FULFILLED") {
    return { type: "no_action", label: "Complete", confidence: 100 }
  }

  // Failed send -- suggest retry (handled elsewhere)
  if (normalizedStatus === "SEND_FAILED") {
    return { type: "no_action", label: "Send failed", confidence: 100 }
  }

  // No reply yet
  if (normalizedStatus === "AWAITING_RESPONSE" || normalizedStatus === "NO_REPLY") {
    if (readStatus !== "replied") {
      return {
        type: "no_action",
        label: "Awaiting reply",
        confidence: 100,
      }
    }
  }

  // High completion -- suggest marking complete
  if (pct >= 90) {
    return {
      type: "mark_complete",
      label: "Mark as complete",
      confidence: pct,
      description: `AI is ${pct}% confident this request is fulfilled`,
    }
  }

  // Attachment received but not verified -- suggest review
  if (hasAttachments && aiVerified === null) {
    return {
      type: "review_attachment",
      label: "Review attachment",
      confidence: Math.max(pct, 60),
      description: "Attachment received but not yet verified",
    }
  }

  // Medium completion with reply -- suggest reviewing
  if (pct >= 40 && pct < 90 && readStatus === "replied") {
    return {
      type: "review_reply",
      label: "Review reply",
      confidence: pct,
      description: riskReason || "Reply received -- review to determine if complete",
    }
  }

  // Low completion with reply -- suggest follow-up
  if (pct < 40 && pct > 0 && readStatus === "replied") {
    return {
      type: "send_followup",
      label: "Send follow-up",
      confidence: Math.max(100 - pct, 50),
      description: riskReason || "Reply received but request appears incomplete",
    }
  }

  // High risk -- suggest follow-up
  if (riskLevel === "high") {
    return {
      type: "send_followup",
      label: "Follow up",
      confidence: 70,
      description: riskReason || "High risk -- needs attention",
    }
  }

  return { type: "no_action", label: "No action needed", confidence: 50 }
}

/**
 * Get a human-readable classification label
 */
export function getClassificationLabel(classification: string | null | undefined): string {
  if (!classification) return ""
  const labels: Record<string, string> = {
    DATA: "Data Received",
    QUESTION: "Question Asked",
    COMPLAINT: "Issue Raised",
    ACKNOWLEDGMENT: "Acknowledged",
    BOUNCE: "Bounced",
    OUT_OF_OFFICE: "Out of Office",
    OTHER: "Reply",
  }
  return labels[classification.toUpperCase()] || classification
}

/**
 * Get risk color class
 */
export function getRiskColor(riskLevel: string | null | undefined): string {
  switch (riskLevel) {
    case "high":
      return "text-red-500"
    case "medium":
      return "text-yellow-500"
    case "low":
      return "text-green-500"
    default:
      return "text-gray-400"
  }
}

/**
 * Get risk background color class
 */
export function getRiskBgColor(riskLevel: string | null | undefined): string {
  switch (riskLevel) {
    case "high":
      return "bg-red-500"
    case "medium":
      return "bg-yellow-500"
    case "low":
      return "bg-green-500"
    default:
      return "bg-gray-300"
  }
}
