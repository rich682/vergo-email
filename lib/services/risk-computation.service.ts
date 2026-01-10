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
  // Determine read status
  let readStatus: ReadStatus = "unknown" as ReadStatus
  
  if (input.hasReplies) {
    readStatus = "replied"
  } else if (input.openedAt || input.lastOpenedAt) {
    readStatus = "read"
  } else {
    readStatus = "unread"
  }

  // Apply deterministic rules
  if (readStatus === "unread") {
    return {
      riskLevel: "high",
      riskReason: "Email not opened yet",
      readStatus
    }
  }

  if (readStatus === "read" && !input.hasReplies) {
    return {
      riskLevel: "medium",
      riskReason: "Email read but no response",
      readStatus
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

