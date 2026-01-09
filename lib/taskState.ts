/**
 * Task State Mapper
 * 
 * Maps task and message data to UI completion states.
 * Pure function with no side effects.
 */

export type TaskCompletionState = "Needs Review" | "Submitted" | "Complete" | "Pending"

export interface TaskStateInput {
  status: string
  hasAttachments: boolean
  aiVerified: boolean | null
  updatedAt: string | Date
  hasReplies?: boolean
  latestInboundClassification?: string | null // DATA, QUESTION, COMPLAINT, ACKNOWLEDGMENT, OTHER
}

/**
 * Determines the completion state of a task based on available signals.
 * 
 * Priority order:
 * 1. Manual overrides (status === FULFILLED → Complete, status in {REJECTED, FLAGGED, MANUAL_REVIEW} → Needs Review)
 * 2. Attachments + verification (hasAttachments && aiVerified → Complete/Needs Review/Submitted)
 * 3. Complaint (latest inbound aiClassification === COMPLAINT → Needs Review)
 * 4. Data classification (latest inbound aiClassification === DATA && no attachments → Submitted)
 * 5. Fallback (Pending)
 */
export function getTaskCompletionState(input: TaskStateInput): TaskCompletionState {
  const { status, hasAttachments, aiVerified, updatedAt, hasReplies = false, latestInboundClassification } = input

  // Priority 1: Manual overrides
  if (status === "FULFILLED") {
    return "Complete"
  }
  
  if (["REJECTED", "FLAGGED", "MANUAL_REVIEW"].includes(status)) {
    return "Needs Review"
  }

  // Priority 2: Attachments + verification
  if (hasAttachments) {
    if (aiVerified === true) {
      return "Complete"
    }
    
    if (aiVerified === false) {
      return "Needs Review"
    }
    
    // aiVerified === null: check if verification is stuck (>24 hours)
    if (aiVerified === null) {
      const updatedAtDate = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt
      const hoursSinceUpdate = (Date.now() - updatedAtDate.getTime()) / (1000 * 60 * 60)
      
      if (hoursSinceUpdate > 24) {
        return "Needs Review"
      }
      
      return "Submitted"
    }
  }

  // Priority 3: Complaint detection (unless manually overridden to Complete)
  if (latestInboundClassification === "COMPLAINT" && status !== "FULFILLED") {
    return "Needs Review"
  }

  // Priority 4: Data classification without attachments
  if (latestInboundClassification === "DATA" && !hasAttachments) {
    return "Submitted"
  }
  
  // Priority 5: Fallback
  return "Pending"
}

/**
 * Gets the color scheme for a task state badge
 */
export function getStateBadgeColors(state: TaskCompletionState): {
  bg: string
  text: string
  border?: string
} {
  switch (state) {
    case "Needs Review":
      return {
        bg: "bg-red-100",
        text: "text-red-800",
        border: "border-red-200"
      }
    case "Submitted":
      return {
        bg: "bg-purple-100",
        text: "text-purple-800",
        border: "border-purple-200"
      }
    case "Complete":
      return {
        bg: "bg-green-100",
        text: "text-green-800",
        border: "border-green-200"
      }
    case "Pending":
      return {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        border: "border-yellow-200"
      }
  }
}

/**
 * Gets an icon name for a task state (for future icon implementation)
 */
export function getStateIcon(state: TaskCompletionState): string {
  switch (state) {
    case "Needs Review":
      return "alert-circle"
    case "Submitted":
      return "paperclip"
    case "Complete":
      return "check-circle"
    case "Pending":
      return "clock"
  }
}

