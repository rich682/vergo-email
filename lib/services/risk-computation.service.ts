/**
 * Risk computation service for accounting-friendly risk triage
 * Provides deterministic fallbacks and LLM integration hooks
 */

export type RiskLevel = "high" | "medium" | "low" | "unknown"
export type ReadStatus = "unread" | "read" | "replied"

export interface RiskComputationInput {
  readStatus?: ReadStatus | null
  hasReplies?: boolean
  latestResponseText?: string | null
  latestInboundClassification?: string | null
  completionPercentage?: number | null
  openedAt?: Date | null
  lastOpenedAt?: Date | null
  hasAttachments?: boolean
  aiVerified?: boolean | null
  lastActivityAt?: Date | null
  deadlineDate?: Date | string | null // Deadline/due date for the request
  requestSentAt?: Date | string | null // When the request email was sent (for calculating days since)
}

export interface RiskComputationResult {
  riskLevel: RiskLevel
  riskReason: string
  readStatus: ReadStatus
}

/**
 * Compute deterministic risk level based on read status and basic heuristics
 * Default behavior (no AI yet):
 * - unread -> high
 * - read/no reply -> medium
 * - replied -> low (or medium/high based on content)
 * - unknown if insufficient data
 */
export function computeDeterministicRisk(input: RiskComputationInput): RiskComputationResult {
  // Determine read status based on current state
  // Priority: replied > read > unread
  let readStatus: ReadStatus = "unknown" as ReadStatus
  
  if (input.hasReplies) {
    // If there are any inbound messages (replies), status is "replied"
    readStatus = "replied"
  } else if (input.openedAt || input.lastOpenedAt) {
    // If email was opened (openedAt or lastOpenedAt exists) but no replies, status is "read"
    readStatus = "read"
  } else {
    // No replies and no open tracking, status is "unread"
    readStatus = "unread"
  }

  // Apply deterministic risk rules based on read status
  if (readStatus === "unread") {
    return {
      riskLevel: "high",
      riskReason: "Email not opened yet",
      readStatus
    }
  }

  if (readStatus === "read") {
    // Email was opened but no reply received - this is HIGH risk (they've seen it but haven't responded)
    // Calculate days overdue if deadline exists
    let daysOverdue = 0
    if (input.deadlineDate) {
      const deadline = input.deadlineDate instanceof Date ? input.deadlineDate : new Date(input.deadlineDate)
      const now = new Date()
      const diffTime = now.getTime() - deadline.getTime()
      daysOverdue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
    }
    
    // Risk increases based on days overdue
    if (daysOverdue > 7) {
      return {
        riskLevel: "high",
        riskReason: `Email read but no response (${daysOverdue} days overdue)`,
        readStatus
      }
    } else if (daysOverdue > 0) {
      return {
        riskLevel: "high",
        riskReason: `Email read but no response (${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue)`,
        readStatus
      }
    } else {
      return {
        riskLevel: "high",
        riskReason: "Email read but no response",
        readStatus
      }
    }
  }

  if (readStatus === "replied") {
    // Check response content for risk indicators
    const responseText = (input.latestResponseText || "").toLowerCase()
    
    // High risk phrases
    const highRiskPhrases = ["dispute", "wrong", "can't", "cannot", "next year", "won't", "will not", "refuse", "denied", "incorrect", "error"]
    const hasHighRiskPhrase = highRiskPhrases.some(phrase => responseText.includes(phrase))
    
    if (hasHighRiskPhrase) {
      return {
        riskLevel: "high",
        riskReason: "Response contains concerning language",
        readStatus
      }
    }

    // Low risk phrases (positive indicators)
    const lowRiskPhrases = ["paid", "sent", "attached", "today", "this week", "completed", "done", "received", "thank you", "confirm"]
    const hasLowRiskPhrase = lowRiskPhrases.some(phrase => responseText.includes(phrase))
    
    if (hasLowRiskPhrase) {
      return {
        riskLevel: "low",
        riskReason: "Positive response received",
        readStatus
      }
    }

    // Check if attachment was verified
    if (input.hasAttachments && input.aiVerified === true) {
      return {
        riskLevel: "low",
        riskReason: "Document verified",
        readStatus
      }
    }

    // Check completion percentage (if available)
    if (input.completionPercentage !== null && input.completionPercentage !== undefined) {
      if (input.completionPercentage >= 95) {
        return {
          riskLevel: "low",
          riskReason: "Request appears fulfilled",
          readStatus
        }
      } else if (input.completionPercentage >= 60) {
        return {
          riskLevel: "medium",
          riskReason: "Partially fulfilled",
          readStatus
        }
      } else {
        return {
          riskLevel: "high",
          riskReason: "Low completion likelihood",
          readStatus
        }
      }
    }

    // Default for replied without clear indicators
    return {
      riskLevel: "medium",
      riskReason: "Response received, awaiting verification",
      readStatus
    }
  }

  // Unknown case
  return {
    riskLevel: "unknown",
    riskReason: "Insufficient data to assess risk",
    readStatus: "unknown" as ReadStatus
  }
}

/**
 * LLM-based risk computation (stub for future enhancement)
 * This can be enhanced later with actual LLM calls
 */
export async function computeRiskWithLLM(input: RiskComputationInput & { requestIntent?: string }): Promise<RiskComputationResult> {
  // For now, use deterministic computation
  // Future: Call LLM with requestIntent + latestResponseText to get nuanced risk assessment
  // Example: "I'm looking for invoice payment status" + "I'll pay next month" -> medium risk
  
  return computeDeterministicRisk(input)
}

/**
 * Get last activity timestamp from various sources
 */
export function computeLastActivityAt(input: RiskComputationInput): Date | null {
  // Priority: lastOpenedAt > openedAt > lastActivityAt > null
  if (input.lastOpenedAt) return input.lastOpenedAt instanceof Date ? input.lastOpenedAt : new Date(input.lastOpenedAt)
  if (input.openedAt) return input.openedAt instanceof Date ? input.openedAt : new Date(input.openedAt)
  if (input.lastActivityAt) return input.lastActivityAt instanceof Date ? input.lastActivityAt : new Date(input.lastActivityAt)
  return null
}

