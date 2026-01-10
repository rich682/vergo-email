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
  } else if (input.openedAt instanceof Date || input.lastOpenedAt instanceof Date) {
    // If email was opened (openedAt or lastOpenedAt is a valid Date) but no replies, status is "read"
    // Must check instanceof Date to avoid truthy values like empty strings or non-Date objects
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
 * LLM-based risk computation with request context
 * Uses request intent (subject/body) + reply text to determine nuanced risk
 */
export async function computeRiskWithLLM(input: RiskComputationInput & { 
  requestSubject?: string | null
  requestBody?: string | null
  requestPrompt?: string | null // The original prompt/request name
  replyText?: string | null
}): Promise<RiskComputationResult> {
  // First compute deterministic baseline
  const deterministicResult = computeDeterministicRisk(input)
  
  // If no reply, return deterministic result (no need for LLM)
  if (!input.hasReplies || !input.replyText) {
    return deterministicResult
  }

  // If manual override exists, don't use LLM (override takes precedence)
  // This should be checked by caller, but defensive check here too
  
  try {
    const { default: OpenAI } = await import("openai")
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.warn("[Risk Computation] OPENAI_API_KEY not set, using deterministic fallback")
      return deterministicResult
    }

    const openai = new OpenAI({ apiKey })
    
    // Build request context
    const requestContext = input.requestPrompt || input.requestSubject || "Request"
    const requestBodyPreview = input.requestBody ? input.requestBody.substring(0, 500) : ""
    const replyPreview = input.replyText.substring(0, 800)
    
    // Call LLM for risk assessment
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an AI assistant that assesses risk for accounting requests based on email replies.

Analyze the reply in the context of the original request and assign a risk level:
- **HIGH**: Request is unlikely to be fulfilled (disputed, denied, delayed significantly, or unclear commitment)
- **MEDIUM**: Request may be fulfilled but needs follow-up (partial commitment, questions, or vague responses)
- **LOW**: Request is likely fulfilled or will be fulfilled soon (positive indicators, strong commitment, or already completed)

Consider:
- The urgency/timeline of the original request
- The recipient's response indicates they will complete the request vs. they cannot/will not
- Whether attachments were sent (indicates fulfillment)
- Whether the reply contains concerning language (disputes, denials, delays)

Respond with JSON:
{
  "riskLevel": "high" | "medium" | "low",
  "riskReason": "Brief explanation (1-2 sentences) why this risk level",
  "confidence": "High" | "Medium" | "Low",
  "nextAction": "Suggested next action (optional)"
}

Be realistic and nuanced - not all replies are binary fulfilled/not fulfilled.`
          },
          {
            role: "user",
            content: `Original Request:
Context: ${requestContext}
Subject: ${input.requestSubject || "N/A"}
Body: ${requestBodyPreview || "N/A"}

Reply Received:
${replyPreview}

Additional Context:
- Completion Percentage: ${input.completionPercentage !== null && input.completionPercentage !== undefined ? input.completionPercentage + "%" : "N/A"}
- Has Attachments: ${input.hasAttachments ? "Yes" : "No"}
- Attachments Verified: ${input.aiVerified === true ? "Yes" : input.aiVerified === false ? "No" : "Pending"}
- Classification: ${input.latestInboundClassification || "N/A"}
- Deadline Date: ${input.deadlineDate ? new Date(input.deadlineDate).toISOString().split('T')[0] : "None"}

Analyze the risk level based on the reply content and request context.`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 200,
        timeout: 8000 // 8 second timeout
      }),
      // Timeout fallback after 8 seconds
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("LLM timeout")), 8000)
      )
    ])

    const responseText = response.choices[0]?.message?.content
    if (!responseText) {
      console.warn("[Risk Computation] LLM returned empty response, using deterministic fallback")
      return deterministicResult
    }

    const parsed = JSON.parse(responseText)
    const llmRiskLevel = parsed.riskLevel?.toLowerCase()
    const riskReason = parsed.riskReason || deterministicResult.riskReason
    const confidence = parsed.confidence || "Medium"

    // Validate risk level
    if (llmRiskLevel !== "high" && llmRiskLevel !== "medium" && llmRiskLevel !== "low") {
      console.warn(`[Risk Computation] Invalid LLM risk level "${llmRiskLevel}", using deterministic fallback`)
      return deterministicResult
    }

    // Use LLM result if confidence is high, otherwise blend with deterministic
    if (confidence === "High" || confidence === "high") {
      return {
        riskLevel: llmRiskLevel,
        riskReason: `LLM analysis: ${riskReason}`,
        readStatus: deterministicResult.readStatus // Keep deterministic readStatus
      }
    } else {
      // Medium/low confidence: blend with deterministic, preferring more conservative (higher risk)
      const deterministicLevel = deterministicResult.riskLevel
      if (
        (llmRiskLevel === "high" && deterministicLevel !== "high") ||
        (llmRiskLevel === "medium" && deterministicLevel === "low")
      ) {
        return {
          riskLevel: llmRiskLevel,
          riskReason: `LLM analysis (${confidence} confidence): ${riskReason}`,
          readStatus: deterministicResult.readStatus
        }
      } else {
        return deterministicResult
      }
    }
  } catch (error: any) {
    console.warn(`[Risk Computation] LLM error (${error.message}), using deterministic fallback`)
    return deterministicResult
  }
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

